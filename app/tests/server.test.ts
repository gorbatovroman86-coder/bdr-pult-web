/**
 * Хранилище на сервере: маршруты, сторож от затирки, журнал, курсы.
 *
 * Всё на базе в памяти и на подменённом источнике курсов — живой сервис
 * и настоящая биржа в тестах не трогаются.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error — серверные модули на чистом JS, типов у них нет намеренно
import { openDb } from '../../server/src/db.mjs'
// @ts-expect-error — см. выше
import { handle } from '../../server/src/routes.mjs'
import { BASE, baseInputs } from '../src/state/inputs'
import { fingerprint } from '../src/state/transfer'

const T0 = '2026-08-03T10:00:00.000Z'

interface Ctx {
  db: unknown
  now: () => string
  fetchRate?: (code: string) => Promise<unknown>
}

let ctx: Ctx
let clock: string

const req = (method: string, path: string, body?: unknown) =>
  handle(ctx, { method, path, body }) as Promise<{ status: number; body: any }>

beforeEach(() => {
  clock = T0
  ctx = { db: openDb(':memory:'), now: () => clock }
})

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  at: T0,
  auto: false,
  comment: 'первый расчёт',
  fingerprint: fingerprint(BASE),
  inputs: baseInputs(),
  results: [
    { id: 'M1', net: 1 }, { id: 'M2', net: 2 }, { id: 'M3', net: 3 },
    { id: 'M4', net: 4 }, { id: 'M5', net: 5 },
  ],
  leader: { id: 'M5', net: 5 },
  blocked: [],
  ...over,
})

describe('Здоровье и неизвестные адреса', () => {
  it('health отвечает', async () => {
    const r = await req('GET', '/health')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
  })

  it('чужой адрес — 404', async () => {
    expect((await req('GET', '/чего-нибудь')).status).toBe(404)
  })

  it('лишний метод — 405', async () => {
    expect((await req('DELETE', '/params')).status).toBe(405)
    expect((await req('PUT', '/journal')).status).toBe(405)
  })
})

describe('Параметры: чтение и запись', () => {
  it('пустое хранилище отвечает честно, а не ошибкой', async () => {
    const r = await req('GET', '/params')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ inputs: null, revision: 0, updatedAt: null, fingerprint: null })
  })

  it('записанный набор читается обратно без потерь', async () => {
    const inputs = baseInputs()
    const put = await req('PUT', '/params', { inputs, fingerprint: fingerprint(inputs), baseRevision: 0 })
    expect(put.status).toBe(200)
    expect(put.body.revision).toBe(1)

    const got = await req('GET', '/params')
    expect(got.body.inputs).toEqual(inputs)
    expect(got.body.fingerprint).toBe(fingerprint(BASE))
    expect(got.body.updatedAt).toBe(T0)
  })

  it('каждая запись поднимает ревизию', async () => {
    const inputs = baseInputs()
    await req('PUT', '/params', { inputs, fingerprint: fingerprint(inputs), baseRevision: 0 })
    inputs.fxCny.value = 12
    const second = await req('PUT', '/params', { inputs, fingerprint: fingerprint(inputs), baseRevision: 1 })
    expect(second.body.revision).toBe(2)
  })
})

describe('Конфликт двух компьютеров не затирается молча', () => {
  it('устаревшая ревизия отклоняется и возвращает серверное состояние', async () => {
    const a = baseInputs()
    await req('PUT', '/params', { inputs: a, fingerprint: fingerprint(a), baseRevision: 0 })

    // Второй компьютер успел записать своё
    clock = '2026-08-03T11:00:00.000Z'
    const b = baseInputs()
    b.fxCny.value = 12
    await req('PUT', '/params', { inputs: b, fingerprint: fingerprint(b), baseRevision: 1 })

    // Первый шлёт правку, всё ещё думая, что видит ревизию 1
    clock = '2026-08-03T11:05:00.000Z'
    const c = baseInputs()
    c.fxCny.value = 13
    const r = await req('PUT', '/params', { inputs: c, fingerprint: fingerprint(c), baseRevision: 1 })

    expect(r.status).toBe(409)
    expect(r.body.server.revision).toBe(2)
    expect(r.body.server.inputs.fxCny.value).toBe(12)
    expect(r.body.server.updatedAt).toBe('2026-08-03T11:00:00.000Z')
  })

  it('серверное состояние при конфликте не тронуто', async () => {
    const a = baseInputs()
    await req('PUT', '/params', { inputs: a, fingerprint: fingerprint(a), baseRevision: 0 })
    const b = baseInputs()
    b.fxCny.value = 13
    await req('PUT', '/params', { inputs: b, fingerprint: fingerprint(b), baseRevision: 999 })
    expect((await req('GET', '/params')).body.inputs.fxCny.value).toBe(11.5)
  })

  it('осознанный выбор «оставить моё» проходит через force', async () => {
    const a = baseInputs()
    await req('PUT', '/params', { inputs: a, fingerprint: fingerprint(a), baseRevision: 0 })
    const b = baseInputs()
    b.fxCny.value = 13
    const r = await req('PUT', '/params', {
      inputs: b, fingerprint: fingerprint(b), baseRevision: 999, force: true,
    })
    expect(r.status).toBe(200)
    expect((await req('GET', '/params')).body.inputs.fxCny.value).toBe(13)
  })
})

describe('Сервер проверяет вход сам, а не верит браузеру', () => {
  const put = (over: Record<string, unknown>) => {
    const inputs = baseInputs()
    Object.assign(inputs, over)
    return req('PUT', '/params', { inputs, fingerprint: fingerprint(BASE), baseRevision: 0 })
  }

  it('курс вне границ отклоняется', async () => {
    const inputs = baseInputs()
    inputs.fxCny.value = 500
    const r = await req('PUT', '/params', { inputs, fingerprint: fingerprint(inputs), baseRevision: 0 })
    expect(r.status).toBe(422)
    expect(r.body.details.join(' ')).toContain('fxCny.value')
  })

  it('месяц не вида ГГГГ-ММ отклоняется', async () => {
    const r = await put({ currentMonth: 'август' })
    expect(r.status).toBe(422)
    expect(r.body.details.join(' ')).toContain('currentMonth')
  })

  it('пропавший режим отклоняется', async () => {
    const inputs = baseInputs()
    delete (inputs.models as Record<string, unknown>).M3
    const r = await req('PUT', '/params', { inputs, fingerprint: fingerprint(inputs), baseRevision: 0 })
    expect(r.status).toBe(422)
    expect(r.body.details.join(' ')).toContain('models.M3')
  })

  it('выход больше единицы отклоняется', async () => {
    const inputs = baseInputs()
    inputs.models.M2.yieldOil = 1.4
    const r = await req('PUT', '/params', { inputs, fingerprint: fingerprint(inputs), baseRevision: 0 })
    expect(r.status).toBe(422)
    expect(r.body.details.join(' ')).toContain('models.M2.yieldOil')
  })

  it('негодный отпечаток отклоняется', async () => {
    const inputs = baseInputs()
    const r = await req('PUT', '/params', { inputs, fingerprint: 'не-хеш', baseRevision: 0 })
    expect(r.status).toBe(422)
    expect(r.body.details.join(' ')).toContain('fingerprint')
  })

  it('пустое тело отклоняется', async () => {
    expect((await req('PUT', '/params', undefined)).status).toBe(400)
  })
})

describe('Журнал', () => {
  it('запись создаётся и читается целиком', async () => {
    const post = await req('POST', '/journal', entry())
    expect(post.status).toBe(201)
    expect(post.body.duplicate).toBe(false)

    const one = await req('GET', '/journal/e1')
    expect(one.status).toBe(200)
    expect(one.body.comment).toBe('первый расчёт')
    expect(one.body.inputs.fxCny.value).toBe(11.5)
    expect(one.body.results).toHaveLength(5)
  })

  it('тот же набор второй записи не создаёт', async () => {
    await req('POST', '/journal', entry())
    const again = await req('POST', '/journal', entry({ id: 'e2', comment: 'то же самое' }))
    expect(again.status).toBe(200)
    expect(again.body.duplicate).toBe(true)
    expect(again.body.id).toBe('e1')
    expect((await req('GET', '/journal')).body.entries).toHaveLength(1)
  })

  it('другой набор — новая запись', async () => {
    await req('POST', '/journal', entry())
    const other = baseInputs()
    other.fxCny.value = 12
    const r = await req('POST', '/journal', entry({
      id: 'e2', inputs: other, fingerprint: fingerprint(other), at: '2026-08-04T10:00:00.000Z',
    }))
    expect(r.status).toBe(201)
    expect((await req('GET', '/journal')).body.entries).toHaveLength(2)
  })

  it('список отсортирован от свежих к старым и без полного тела', async () => {
    const other = baseInputs()
    other.fxCny.value = 12
    await req('POST', '/journal', entry())
    await req('POST', '/journal', entry({
      id: 'e2', inputs: other, fingerprint: fingerprint(other), at: '2026-08-05T10:00:00.000Z',
    }))
    const list = (await req('GET', '/journal')).body.entries
    expect(list.map((e: { id: string }) => e.id)).toEqual(['e2', 'e1'])
    expect(list[0].leader.id).toBe('M5')
    expect(list[0].inputs).toBeUndefined()
  })

  it('удаление работает, повторное — 404', async () => {
    await req('POST', '/journal', entry())
    expect((await req('DELETE', '/journal/e1')).status).toBe(200)
    expect((await req('DELETE', '/journal/e1')).status).toBe(404)
    expect((await req('GET', '/journal/e1')).status).toBe(404)
  })

  it('ФОТ в журнал не принимается', async () => {
    const r = await req('POST', '/journal', entry({ payroll: { project: 1, total: 2 } }))
    expect(r.status).toBe(422)
    expect(r.body.details.join(' ')).toContain('ФОТ')
  })

  it('запись с негодными входными данными не принимается', async () => {
    const bad = baseInputs()
    bad.taxRate = 5
    const r = await req('POST', '/journal', entry({ inputs: bad }))
    expect(r.status).toBe(422)
    expect(r.body.details.join(' ')).toContain('taxRate')
  })

  it('слишком длинный комментарий не принимается', async () => {
    const r = await req('POST', '/journal', entry({ comment: 'я'.repeat(501) }))
    expect(r.status).toBe(422)
  })

  it('опасный id не принимается', async () => {
    const r = await req('POST', '/journal', entry({ id: '../../etc/passwd' }))
    expect(r.status).toBe(422)
  })
})

describe('Курсы: сервер тянет, приложение забирает готовое', () => {
  it('курсы сохраняются и отдаются с источником и датой', async () => {
    ctx.fetchRate = vi.fn(async (code: string) =>
      code === 'CNY'
        ? { value: 11.94, rateDate: '2026-08-03', source: 'moex' }
        : { value: 80.98, rateDate: '2026-08-03', source: 'moex' })

    const r = await req('GET', '/fx')
    expect(r.status).toBe(200)
    expect(r.body.rates.CNY).toEqual({
      value: 11.94, rateDate: '2026-08-03', source: 'moex', fetchedAt: T0,
    })
    expect(r.body.rates.USD.value).toBe(80.98)
  })

  it('пока курс свежий, источник не дёргается', async () => {
    const spy = vi.fn(async () => ({ value: 11.94, rateDate: '2026-08-03', source: 'moex' }))
    ctx.fetchRate = spy
    await req('GET', '/fx')
    expect(spy).toHaveBeenCalledTimes(2) // CNY и USD

    clock = '2026-08-03T10:05:00.000Z' // пять минут — кэш ещё жив
    await req('GET', '/fx')
    expect(spy).toHaveBeenCalledTimes(2)

    clock = '2026-08-03T10:20:00.000Z' // двадцать — пора обновить
    await req('GET', '/fx')
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('источник молчит — отдаём последнее сохранённое, а не пустоту', async () => {
    ctx.fetchRate = vi.fn(async () => ({ value: 11.94, rateDate: '2026-08-03', source: 'moex' }))
    await req('GET', '/fx')

    clock = '2026-08-04T10:00:00.000Z'
    ctx.fetchRate = vi.fn(async () => null)
    const r = await req('GET', '/fx')
    expect(r.body.rates.CNY.value).toBe(11.94)
    expect(r.body.rates.CNY.fetchedAt).toBe(T0) // видно, что значение старое
  })
})
