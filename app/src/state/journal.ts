/**
 * ЖУРНАЛ РАСЧЁТОВ.
 *
 * Смысл журнала не в том, чтобы копить записи, а в том, чтобы через месяц
 * ответить: что изменилось во входных данных и как это сдвинуло результат.
 * Поэтому запись хранит ВЕСЬ вход целиком — иначе сравнение будет гаданием.
 *
 * ФОТ в журнал не попадает: это зарплатные данные, а журнал уезжает на сервер
 * и выгружается файлами.
 *
 * ЧИСТЫЙ модуль: ни React, ни сети.
 */

import type { Inputs } from './inputs'
import type { Computed } from './compute'
import { diffInputs, fingerprint, type Diff } from './transfer'
import { APP_VERSION } from './transfer'

export interface ModelResult {
  id: string
  name: string
  revenue: number
  cost: number
  shipping: number
  interest: number
  tax: number
  net: number
  perTon: number
  margin: number | null
  /** Имя параметра, остановившего расчёт. Пусто — модель считалась. */
  blockedBy: string | null
}

export interface JournalEntry {
  id: string
  at: string
  auto: boolean
  comment: string
  fingerprint: string
  appVersion: string
  /** Весь вход целиком — без него сравнение записей невозможно. */
  inputs: Inputs
  results: ModelResult[]
  leader: { id: string; net: number } | null
  /** Победивший базис M1 и курс, на котором он победил. */
  basis: { destination: string; fx: number } | null
  /** Заблокированные модели с именем остановившего параметра. */
  blocked: string[]
}

/** Идентификатор записи: сортируется как время и виден глазами. */
export function entryId(nowIso: string, fp: string): string {
  return `${nowIso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${fp}`
}

/** Сборка записи из того, что сейчас на экране. */
export function makeEntry(
  inputs: Inputs,
  computed: Computed,
  opts: { now: string; comment: string; auto: boolean },
): JournalEntry {
  const fp = fingerprint(inputs)

  const results: ModelResult[] = computed.models.map((m) => ({
    id: m.meta.id,
    name: m.meta.name,
    revenue: m.result.revenueTotal,
    cost: m.result.cost,
    shipping: m.result.shippingTotal,
    interest: m.result.capital.interestMonthly,
    tax: m.result.tax,
    net: m.result.netResult,
    perTon: m.result.netPerRawTon,
    margin: m.result.margin,
    blockedBy: m.blockers.length > 0 ? m.blockers[0].label : null,
  }))

  const live = computed.models.filter((m) => m.blockers.length === 0)
  const best = live.length > 0
    ? live.reduce((a, b) => (b.result.netResult > a.result.netResult ? b : a))
    : null

  return {
    id: entryId(opts.now, fp),
    at: opts.now,
    auto: opts.auto,
    comment: opts.comment,
    fingerprint: fp,
    appVersion: APP_VERSION,
    inputs,
    results,
    leader: best ? { id: best.meta.id, net: best.result.netResult } : null,
    basis: computed.basis
      ? { destination: computed.basis.winner.destination, fx: computed.basis.winner.fx }
      : null,
    blocked: computed.models
      .filter((m) => m.blockers.length > 0)
      .map((m) => `${m.meta.id}: ${m.blockers[0].label}`),
  }
}

// ─────────────────────────────────────────────── Автосохранение

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Журнал, который заполняется только когда о нём вспомнили, окажется пустым
 * ровно тогда, когда понадобится. Поэтому раз в сутки запись создаётся сама —
 * но только если параметры с прошлого раза действительно менялись.
 */
export function shouldAutoSave(args: {
  now: string
  lastEntryAt: string | null
  knownFingerprints: string[]
  currentFingerprint: string
}): boolean {
  // Этот набор уже записан — дубля не будет ни при каких условиях.
  if (args.knownFingerprints.includes(args.currentFingerprint)) return false
  if (args.lastEntryAt === null) return true
  const dt = Date.parse(args.now) - Date.parse(args.lastEntryAt)
  return Number.isFinite(dt) && dt >= DAY_MS
}

// ─────────────────────────────────────────────── Сравнение двух записей

export interface ResultShift {
  id: string
  name: string
  from: number
  to: number
  delta: number
}

export interface EntryComparison {
  /** Что изменилось во входных данных. */
  inputDiffs: Diff[]
  /** Как это сдвинуло фин. результат каждой модели. */
  shifts: ResultShift[]
}

/** Главная функция журнала: что поменяли и что из этого вышло. */
export function compareEntries(older: JournalEntry, newer: JournalEntry): EntryComparison {
  const byId = new Map(older.results.map((r) => [r.id, r]))
  return {
    inputDiffs: diffInputs(older.inputs, newer.inputs),
    shifts: newer.results.map((r) => {
      const was = byId.get(r.id)
      return {
        id: r.id,
        name: r.name,
        from: was ? was.net : Number.NaN,
        to: r.net,
        delta: was ? r.net - was.net : Number.NaN,
      }
    }),
  }
}

// ─────────────────────────────────────────────── Выгрузка

const CSV_HEADER = [
  'дата', 'вид', 'комментарий', 'отпечаток', 'режим', 'выручка', 'себестоимость',
  'отгрузка', 'процент за деньги', 'налог', 'фин. результат', 'руб/т сырья',
  'рентабельность', 'остановлен параметром',
]

/** Экранирование по RFC 4180: разделитель — точка с запятой, как ждёт Excel. */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Одна строка на режим: так журнал открывается сводной таблицей без правки. */
export function journalToCsv(entries: JournalEntry[]): string {
  const rows = [CSV_HEADER.join(';')]
  for (const e of entries) {
    for (const r of e.results) {
      rows.push([
        e.at, e.auto ? 'авто' : 'вручную', e.comment, e.fingerprint, r.id,
        r.revenue, r.cost, r.shipping, r.interest, r.tax, r.net, r.perTon,
        r.margin === null ? '' : r.margin, r.blockedBy ?? '',
      ].map(cell).join(';'))
    }
  }
  // BOM: без него Excel читает кириллицу как «ЊЂ».
  return `﻿${rows.join('\r\n')}\r\n`
}

export interface JournalBundle {
  kind: 'bdr-pult-journal'
  schemaVersion: number
  appVersion: string
  exportedAt: string
  entries: JournalEntry[]
}

export const JOURNAL_SCHEMA_VERSION = 1

export function makeJournalBundle(entries: JournalEntry[], now: string): JournalBundle {
  return {
    kind: 'bdr-pult-journal',
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now,
    entries,
  }
}

export function journalFilename(iso: string, ext: 'json' | 'csv'): string {
  return `bdr-journal-${iso.slice(0, 10)}.${ext}`
}

export type JournalParse =
  | { ok: true; entries: JournalEntry[] }
  | { ok: false; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export function parseJournalBundle(text: string): JournalParse {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['Файл не читается как JSON — вероятно, повреждён.'] }
  }
  if (!isObj(raw) || raw.kind !== 'bdr-pult-journal') {
    return { ok: false, errors: ['Это не файл журнала пульта БДР.'] }
  }
  if (raw.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`Версия формата ${String(raw.schemaVersion)}, пульт читает ${JOURNAL_SCHEMA_VERSION}.`],
    }
  }
  if (!Array.isArray(raw.entries)) return { ok: false, errors: ['В файле нет списка записей.'] }

  const errs: string[] = []
  const entries: JournalEntry[] = []
  raw.entries.forEach((e, n) => {
    if (!isObj(e) || typeof e.id !== 'string' || typeof e.at !== 'string'
      || typeof e.fingerprint !== 'string' || !isObj(e.inputs) || !Array.isArray(e.results)) {
      errs.push(`запись ${n + 1}: неполная`)
      return
    }
    entries.push(e as unknown as JournalEntry)
  })

  if (errs.length > 0) return { ok: false, errors: ['Журнал не принят, ничего не применяю:', ...errs.slice(0, 12)] }
  return { ok: true, entries }
}

/**
 * Слияние по дате и отпечатку: одна и та же запись из двух файлов
 * не должна удвоиться.
 */
export function mergeJournal(have: JournalEntry[], incoming: JournalEntry[]): {
  merged: JournalEntry[]
  added: number
  skipped: number
} {
  const seen = new Set(have.map((e) => `${e.at}|${e.fingerprint}`))
  const byFp = new Set(have.map((e) => e.fingerprint))
  let added = 0
  let skipped = 0
  const merged = [...have]

  for (const e of incoming) {
    const key = `${e.at}|${e.fingerprint}`
    if (seen.has(key) || byFp.has(e.fingerprint)) {
      skipped++
      continue
    }
    seen.add(key)
    byFp.add(e.fingerprint)
    merged.push(e)
    added++
  }

  merged.sort((a, b) => b.at.localeCompare(a.at))
  return { merged, added, skipped }
}
