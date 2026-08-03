/**
 * СТЫК КЛИЕНТА И СЕРВЕРА.
 *
 * Тесты экранов подменяют сеть моками — а мок пишет тот же человек,
 * что и клиент, поэтому расхождение адресов, полей или кодов ответа
 * они не поймают. Здесь настоящий клиент из api.ts разговаривает
 * с настоящим обработчиком сервера: подменён только транспорт.
 *
 * Сокета нет, живой сервис не трогается.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error — серверные модули на чистом JS, типов у них нет намеренно
import { openDb } from '../../server/src/db.mjs'
// @ts-expect-error — см. выше
import { handle } from '../../server/src/routes.mjs'
import {
  apiDeleteEntry, apiGetEntry, apiGetFx, apiGetParams, apiListJournal, apiPostEntry,
  apiPutParams, type ApiConfig,
} from '../src/state/api'
import { baseInputs } from '../src/state/inputs'
import { fingerprint } from '../src/state/transfer'
import { makeEntry } from '../src/state/journal'
import { computeAll } from '../src/state/compute'

const CFG: ApiConfig = { base: 'https://пример.invalid/хранилище', user: 'u', pass: 'p' }
const NOW = '2026-08-03T10:00:00.000Z'

let ctx: { db: unknown; now: () => string; fetchRate?: (c: string) => Promise<unknown> }

/** Транспорт: вместо сокета — прямой вызов обработчика сервера. */
function wire() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    // Адрес берём строкой: `new URL().pathname` вернул бы кириллицу
    // в процентном кодировании, и префикс перестал бы совпадать.
    const path = decodeURI(String(url).slice(CFG.base.length))
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const out = await handle(ctx, { method: init?.method ?? 'GET', path, body })
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }))
}

beforeEach(() => {
  ctx = { db: openDb(':memory:'), now: () => NOW }
  wire()
})

describe('Параметры ходят туда и обратно без потерь', () => {
  it('пустой сервер клиент понимает, а не считает ошибкой', async () => {
    const r = await apiGetParams(CFG)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.inputs).toBeNull()
    expect(r.data.revision).toBe(0)
  })

  it('записанный набор возвращается тем же', async () => {
    const inputs = baseInputs()
    const put = await apiPutParams(CFG, { inputs, fingerprint: fingerprint(inputs), baseRevision: 0 })
    expect(put.ok).toBe(true)
    if (!put.ok) return
    expect(put.data.revision).toBe(1)

    const got = await apiGetParams(CFG)
    expect(got.ok && got.data.inputs).toEqual(inputs)
  })

  it('расхождение ревизий доходит до клиента как конфликт, а не как ошибка', async () => {
    const a = baseInputs()
    await apiPutParams(CFG, { inputs: a, fingerprint: fingerprint(a), baseRevision: 0 })

    const b = baseInputs()
    b.fxCny.value = 12
    const r = await apiPutParams(CFG, { inputs: b, fingerprint: fingerprint(b), baseRevision: 0 })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('conflict')
    if (r.reason !== 'conflict') return
    expect(r.server.revision).toBe(1)
    expect(r.server.inputs!.fxCny.value).toBe(11.5)
  })

  it('негодный набор доходит как отказ с причинами', async () => {
    const bad = baseInputs()
    bad.taxRate = 7
    const r = await apiPutParams(CFG, { inputs: bad, fingerprint: fingerprint(bad), baseRevision: 0 })
    expect(r.ok).toBe(false)
    if (r.ok || r.reason !== 'server') return
    expect(r.details?.join(' ')).toContain('taxRate')
  })
})

describe('Журнал ходит через тот же стык', () => {
  const entry = (comment: string, fx?: number) => {
    const i = baseInputs()
    if (fx !== undefined) i.fxCny.value = fx
    return makeEntry(i, computeAll(i), { now: NOW, comment, auto: false })
  }

  it('запись создаётся, читается целиком и удаляется', async () => {
    const e = entry('первый')
    const post = await apiPostEntry(CFG, e)
    expect(post.ok && post.data.duplicate).toBe(false)

    const list = await apiListJournal(CFG)
    expect(list.ok && list.data.entries).toHaveLength(1)
    expect(list.ok && list.data.entries[0].leader?.id).toBe('M5')

    const one = await apiGetEntry(CFG, e.id)
    expect(one.ok).toBe(true)
    if (!one.ok) return
    expect((one.data as { comment: string }).comment).toBe('первый')

    expect((await apiDeleteEntry(CFG, e.id)).ok).toBe(true)
    expect((await apiListJournal(CFG)).ok && (await apiListJournal(CFG)).ok).toBe(true)
  })

  it('тот же набор второй записи не создаёт', async () => {
    await apiPostEntry(CFG, entry('первый'))
    const again = await apiPostEntry(CFG, entry('он же'))
    expect(again.ok && again.data.duplicate).toBe(true)

    const list = await apiListJournal(CFG)
    expect(list.ok && list.data.entries).toHaveLength(1)
  })

  it('другой набор — новая запись', async () => {
    await apiPostEntry(CFG, entry('первый'))
    await apiPostEntry(CFG, entry('курс вырос', 12))
    const list = await apiListJournal(CFG)
    expect(list.ok && list.data.entries).toHaveLength(2)
  })
})

describe('Курсы доходят до клиента с источником и датой', () => {
  it('клиент получает разобранные курсы', async () => {
    ctx.fetchRate = vi.fn(async (code: string) => ({
      value: code === 'CNY' ? 11.94 : 80.98,
      rateDate: '2026-08-03',
      source: 'moex',
    }))
    const r = await apiGetFx(CFG)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.rates.CNY).toEqual({
      value: 11.94, rateDate: '2026-08-03', source: 'moex', fetchedAt: NOW,
    })
  })
})

describe('Недоступный сервер клиент переживает', () => {
  it('обрыв сети — это «работаю локально», а не исключение', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('сети нет')
    }))
    const r = await apiGetParams(CFG)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('offline')
  })

  it('401 читается как «нет доступа», а не как поломка', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    const r = await apiGetParams(CFG)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('auth')
  })
})
