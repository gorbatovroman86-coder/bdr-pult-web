/**
 * Маршруты. Отделены от сети, чтобы проверяться тестами без живого сокета
 * и без обращений к настоящей бирже.
 *
 * Операций ровно столько, сколько нужно пульту, и ни одной сверх:
 *   GET  /health          жив ли сервис
 *   GET  /params          текущий набор
 *   PUT  /params          записать набор (со сторожем от затирки)
 *   GET  /journal         список записей
 *   POST /journal         добавить запись
 *   GET  /journal/:id     одна запись целиком
 *   DELETE /journal/:id   удалить запись
 *   GET  /fx              курсы валют
 *   GET  /duties          ставки пошлин МСХ из вторичных источников
 */

import {
  deleteJournal, getJournalEntry, insertJournal, listJournal, readFx, readParams, writeFx, writeParams,
} from './db.mjs'
import { validateFingerprint, validateInputs, validateJournalEntry } from './validate.mjs'
import { fetchRate, isFresh } from './fx.mjs'
import { implausible, prevMonth, reconcile } from './duties.mjs'

const json = (status, body) => ({ status, body })
const bad = (status, error, details) => json(status, details ? { error, details } : { error })

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * @param {object} ctx
 * @param {import('node:sqlite').DatabaseSync} ctx.db
 * @param {() => string} ctx.now  ISO-время; в тестах подменяется
 * @param {typeof fetchRate} [ctx.fetchRate] источник курсов; в тестах — мок
 */
export async function handle(ctx, { method, path, body }) {
  const { db, now } = ctx

  if (method === 'GET' && path === '/health') {
    return json(200, { ok: true, at: now() })
  }

  // ── Параметры

  if (path === '/params') {
    if (method === 'GET') {
      const p = readParams(db)
      return p ? json(200, p) : json(200, { inputs: null, revision: 0, updatedAt: null, fingerprint: null })
    }
    if (method === 'PUT') {
      if (!body || typeof body !== 'object') return bad(400, 'тело запроса не разобрано')
      const errs = [...validateFingerprint(body.fingerprint), ...validateInputs(body.inputs)]
      if (errs.length > 0) return bad(422, 'набор не принят', errs.slice(0, 12))

      const res = writeParams(db, {
        inputs: body.inputs,
        fingerprint: body.fingerprint,
        baseRevision: body.baseRevision,
        force: body.force === true,
        now: now(),
      })
      if (res.conflict) {
        return json(409, { error: 'набор изменён с другого компьютера', server: res.conflict })
      }
      return json(200, res.saved)
    }
    return bad(405, 'метод не поддержан')
  }

  // ── Журнал

  if (path === '/journal') {
    if (method === 'GET') return json(200, { entries: listJournal(db) })
    if (method === 'POST') {
      if (!body || typeof body !== 'object') return bad(400, 'тело запроса не разобрано')
      const errs = validateJournalEntry(body)
      if (errs.length > 0) return bad(422, 'запись не принята', errs.slice(0, 12))
      if (typeof body.id !== 'string' || !ID_RE.test(body.id)) return bad(422, 'запись не принята', ['id: недопустимый'])

      const { id, at, auto, comment, fingerprint, ...entry } = body
      const res = insertJournal(db, { id, at, auto, comment, fingerprint, entry })
      // Тот же набор уже записан — второй записи не создаём и говорим об этом прямо.
      return json(res.duplicate ? 200 : 201, { id: res.id, duplicate: res.duplicate })
    }
    return bad(405, 'метод не поддержан')
  }

  const m = path.match(/^\/journal\/([^/]+)$/)
  if (m) {
    const id = decodeURIComponent(m[1])
    if (!ID_RE.test(id)) return bad(400, 'недопустимый id')
    if (method === 'GET') {
      const e = getJournalEntry(db, id)
      return e ? json(200, e) : bad(404, 'запись не найдена')
    }
    if (method === 'DELETE') {
      return deleteJournal(db, id) ? json(200, { deleted: id }) : bad(404, 'запись не найдена')
    }
    return bad(405, 'метод не поддержан')
  }

  // ── Курсы

  if (method === 'GET' && path === '/fx') {
    const fetcher = ctx.fetchRate ?? fetchRate
    const stored = readFx(db)
    const t = Date.parse(now())
    for (const code of ['CNY', 'USD']) {
      if (isFresh(stored[code], t)) continue
      const got = await fetcher(code)
      // Не достали — оставляем последнее сохранённое, приложение покажет возраст.
      if (got) writeFx(db, code, { ...got, fetchedAt: now() })
    }
    return json(200, { rates: readFx(db) })
  }

  // ── Ставки пошлин МСХ из вторичных источников

  if (method === 'GET' && path === '/duties') {
    const t = Date.parse(now())
    if (!dutiesCache || t - dutiesCache.at > DUTIES_TTL) {
      let data
      try {
        data = decideDuties(ctx.scanDuties ? ctx.scanDuties() : [], now())
      } catch {
        // Базы сообщений может не быть — это не повод ронять сервис.
        data = { rates: [], note: 'источник сообщений недоступен', scannedAt: now() }
      }
      dutiesCache = { at: t, data }
    }
    return json(200, dutiesCache.data)
  }

  return bad(404, 'нет такого адреса')
}

// ─────────────────────────────────────────────── Ставки пошлин

/** Сканирование локальной базы дешёвое, но и раз в час более чем достаточно. */
const DUTIES_TTL = 60 * 60 * 1000
let dutiesCache = null

/** Сброс кэша — нужен тестам. */
export function resetDutiesCache() {
  dutiesCache = null
}

/**
 * Решение по каждой паре «месяц + продукт»: что применять и можно ли
 * применять автоматически.
 *
 * Автоматически применяется только то, что подтверждено двумя независимыми
 * источниками И не выглядит неправдоподобным. Всё остальное показывается
 * человеку — молча не применяется ничего.
 */
export function decideDuties(hits, nowIso) {
  const resolved = reconcile(hits)
  const byKey = new Map(resolved.map((r) => [`${r.month}|${r.product}`, r]))

  const rates = resolved.map((r) => {
    const prev = byKey.get(`${prevMonth(r.month)}|${r.product}`)
    const jump = implausible(r.rate, prev?.rate ?? null)
    return {
      ...r,
      previousRate: prev?.rate ?? null,
      implausible: jump,
      // Применяем сами только при согласии источников и правдоподобии.
      autoApply: r.status === 'confirmed' && !jump,
      needsHuman: r.status === 'disputed' || jump || r.status === 'single',
    }
  })

  return { rates, scannedAt: nowIso, note: rates.length === 0 ? 'ставок в сообщениях не найдено' : '' }
}
