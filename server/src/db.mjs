/**
 * Хранилище пульта БДР — SQLite через встроенный `node:sqlite`.
 * Ни одной внешней зависимости: на сервере нечего обновлять и нечем питаться
 * цепочке поставок.
 *
 * Файл базы лежит ВНЕ репозитория, путь задаётся переменной окружения.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS params (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      inputs      TEXT    NOT NULL,
      fingerprint TEXT    NOT NULL,
      revision    INTEGER NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal (
      id          TEXT PRIMARY KEY,
      at          TEXT NOT NULL,
      auto        INTEGER NOT NULL,
      comment     TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      entry       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS journal_at ON journal (at DESC);

    -- Без дублей: тот же набор параметров — та же запись, второй раз не пишем.
    CREATE UNIQUE INDEX IF NOT EXISTS journal_fp ON journal (fingerprint);

    CREATE TABLE IF NOT EXISTS fx (
      code       TEXT PRIMARY KEY,
      value      REAL NOT NULL,
      rate_date  TEXT NOT NULL,
      source     TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `)
  return db
}

// ─────────────────────────────────────────────── Параметры

export function readParams(db) {
  const row = db.prepare('SELECT inputs, fingerprint, revision, updated_at FROM params WHERE id = 1').get()
  if (!row) return null
  return {
    inputs: JSON.parse(row.inputs),
    fingerprint: row.fingerprint,
    revision: row.revision,
    updatedAt: row.updated_at,
  }
}

/**
 * Запись со сторожем от молчаливой затирки: клиент присылает ревизию,
 * которую видел последней. Разошлась — не пишем и возвращаем конфликт,
 * пусть человек выберет сам.
 */
export function writeParams(db, { inputs, fingerprint, baseRevision, now, force }) {
  const cur = readParams(db)
  if (cur && !force && baseRevision !== cur.revision) {
    return { conflict: cur }
  }
  const revision = (cur?.revision ?? 0) + 1
  db.prepare(
    `INSERT INTO params (id, inputs, fingerprint, revision, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       inputs = excluded.inputs,
       fingerprint = excluded.fingerprint,
       revision = excluded.revision,
       updated_at = excluded.updated_at`,
  ).run(JSON.stringify(inputs), fingerprint, revision, now)
  return { saved: { fingerprint, revision, updatedAt: now } }
}

// ─────────────────────────────────────────────── Журнал

/** Список — без полного тела расчёта: он нужен только при открытии записи. */
export function listJournal(db) {
  return db
    .prepare('SELECT id, at, auto, comment, fingerprint, entry FROM journal ORDER BY at DESC')
    .all()
    .map((r) => {
      const e = JSON.parse(r.entry)
      return {
        id: r.id,
        at: r.at,
        auto: r.auto === 1,
        comment: r.comment,
        fingerprint: r.fingerprint,
        leader: e.leader ?? null,
        results: e.results ?? null,
        blocked: e.blocked ?? [],
      }
    })
}

export function getJournalEntry(db, id) {
  const row = db.prepare('SELECT id, at, auto, comment, fingerprint, entry FROM journal WHERE id = ?').get(id)
  if (!row) return null
  return { ...JSON.parse(row.entry), id: row.id, at: row.at, auto: row.auto === 1, comment: row.comment, fingerprint: row.fingerprint }
}

export function findByFingerprint(db, fingerprint) {
  const row = db.prepare('SELECT id FROM journal WHERE fingerprint = ?').get(fingerprint)
  return row ? row.id : null
}

export function insertJournal(db, { id, at, auto, comment, fingerprint, entry }) {
  const existing = findByFingerprint(db, fingerprint)
  if (existing) return { duplicate: true, id: existing }
  db.prepare(
    'INSERT INTO journal (id, at, auto, comment, fingerprint, entry) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, at, auto ? 1 : 0, comment, fingerprint, JSON.stringify(entry))
  return { duplicate: false, id }
}

export function deleteJournal(db, id) {
  return db.prepare('DELETE FROM journal WHERE id = ?').run(id).changes > 0
}

/** Когда последний раз писали в журнал — по этому решается автосохранение раз в день. */
export function lastJournalAt(db) {
  const row = db.prepare('SELECT at FROM journal ORDER BY at DESC LIMIT 1').get()
  return row ? row.at : null
}

// ─────────────────────────────────────────────── Курсы

export function readFx(db) {
  const out = {}
  for (const r of db.prepare('SELECT code, value, rate_date, source, fetched_at FROM fx').all()) {
    out[r.code] = { value: r.value, rateDate: r.rate_date, source: r.source, fetchedAt: r.fetched_at }
  }
  return out
}

export function writeFx(db, code, { value, rateDate, source, fetchedAt }) {
  db.prepare(
    `INSERT INTO fx (code, value, rate_date, source, fetched_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       value = excluded.value, rate_date = excluded.rate_date,
       source = excluded.source, fetched_at = excluded.fetched_at`,
  ).run(code, value, rateDate, source, fetchedAt)
}
