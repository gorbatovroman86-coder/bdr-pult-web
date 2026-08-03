/**
 * Ставки пошлин МСХ из вторичных источников.
 *
 * Тексты в фикстурах — НАСТОЯЩИЕ формулировки из накопленных сообщений,
 * а не придуманные. Именно на них разбор ломался дважды, поэтому они
 * зафиксированы: если формулировка перестанет разбираться, это увидят здесь,
 * а не по молча неверной ставке в расчёте.
 */

import { beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — серверные модули на чистом JS, типов у них нет намеренно
import { implausible, looksLikeDuty, parseDuties, prevMonth, reconcile } from '../../server/src/duties.mjs'
// @ts-expect-error — см. выше
import { decideDuties, handle, resetDutiesCache } from '../../server/src/routes.mjs'

const JUL = '2026-07-28T09:00:00Z'

/** Настоящие сообщения из каналов, по одному на каждую форму записи ставки. */
const REAL = {
  agroinvestor:
    'В августе пошлина на экспорт подсолнечного масла составит 7748 руб./т против 3294 руб./т в июле. ' +
    'Ставка рассчитывалась при индикативной цене в $1298/т, в июле — $1297/т. ' +
    'Пошлина на вывоз подсолнечного шрота в августе составит 312,4 руб./т, индикативная цена — $228,4/т ($215/т). ' +
    'При этом пошлина на экспорт подсолнечного шрота с мая по июль была нулевой, сообщается на сайте Минсельхоза.',

  // «7 тыс. 748 рублей» — форма, на которой ломается наивный разбор числа
  zolnews:
    'Пошлина на экспорт подсолнечного масла в августе составит 7 тыс. 748 рублей за тонну, сообщает Минсельхоз. ' +
    'Это почти в 2,4 раза выше июльского значения - 3 тыс. 294,2 рубля за тонну. ' +
    'Пошлина на экспорт подсолнечного шрота составит 312,4 рубля за тонну.',

  // Месяц назван только в первом предложении, а «в мае-июле» ниже сбивало привязку
  oilworld:
    'Пошлина на подсолнечное масло и шрот выросла. ' +
    'В августе экспортная пошлина на подсолнечное масло составит 7 748 рублей за тонну, ' +
    'что почти в 2,4 раза выше, чем в июле, когда она составляла 3 294,2 рубля за тонну, сообщает Минсельхоз. ' +
    'Пошлина на экспорт подсолнечного шрота будет равна 312,4 рубля за тонну, ' +
    'несмотря на то, что в мае-июле пошлина была нулевой.',

  // Реклама топлива: содержит «7748», но ставкой не является
  реклама:
    'Оптовые поставки качественного топлива ДТ К5 Евро, АИ-92-К5 / АИ-95-К5. ' +
    'Оптовая продажа по всей России, отгрузка с ведущих НПЗ. Телефон 7748. Развитая логистика по ЦФО и ЮФО.',
}

describe('Префильтр отсеивает мусор до всякого разбора', () => {
  it('реклама топлива с числом 7748 ставкой не считается', () => {
    expect(looksLikeDuty(REAL.реклама)).toBe(false)
    expect(parseDuties(REAL.реклама, JUL)).toEqual([])
  })

  it('сообщение про пошлину на подсолнечное проходит', () => {
    expect(looksLikeDuty(REAL.agroinvestor)).toBe(true)
  })

  it('пошлина без подсолнечника не наша', () => {
    expect(looksLikeDuty('Пошлина на экспорт пшеницы составит 1500 руб./т в августе.')).toBe(false)
  })
})

describe('Разбор настоящих формулировок', () => {
  it('«7748 руб./т против 3294 руб./т» — берётся объявленная, а не сравнение', () => {
    expect(parseDuties(REAL.agroinvestor, JUL)).toEqual([
      { product: 'oil', month: '2026-08', rate: 7748 },
      { product: 'meal', month: '2026-08', rate: 312.4 },
    ])
  })

  it('«7 тыс. 748 рублей за тонну» разбирается в 7748, а не в 7', () => {
    const d = parseDuties(REAL.zolnews, JUL)
    expect(d.find((x: { product: string }) => x.product === 'oil')).toEqual(
      { product: 'oil', month: '2026-08', rate: 7748 },
    )
  })

  it('«в мае-июле была нулевой» не уводит августовскую ставку в июль', () => {
    const d = parseDuties(REAL.oilworld, '2026-07-24T09:00:00Z')
    expect(d.every((x: { month: string }) => x.month === '2026-08')).toBe(true)
    expect(d.find((x: { product: string }) => x.product === 'meal')?.rate).toBe(312.4)
  })

  it('заголовок «на масло и шрот» ставкой не считается — продукт неоднозначен', () => {
    expect(parseDuties('Пошлина на подсолнечное масло и шрот выросла до 7748 руб./т.', JUL)).toEqual([])
  })

  it('индикативная цена в долларах ставкой не становится', () => {
    const d = parseDuties(
      'Пошлина на подсолнечное масло в августе составит 7748 руб./т при индикативной цене $1298/т.',
      JUL,
    )
    expect(d).toEqual([{ product: 'oil', month: '2026-08', rate: 7748 }])
  })
})

describe('Сверка источников', () => {
  const hit = (source: string, rate: number, product = 'oil') =>
    ({ product, month: '2026-08', rate, source, at: JUL })

  it('два независимых источника с одним значением — подтверждено', () => {
    const r = reconcile([hit('zolnews', 7748), hit('oilworldru', 7748)])
    expect(r[0].status).toBe('confirmed')
    expect(r[0].sources).toEqual(['oilworldru', 'zolnews'])
  })

  it('один источник — применяем, но помечаем', () => {
    expect(reconcile([hit('zolnews', 7748)])[0].status).toBe('single')
  })

  it('настоящее расхождение двух групп — спор, автоматически не применяем', () => {
    const r = reconcile([
      hit('zolnews', 7748), hit('oilworldru', 7748),
      hit('agrotrendru', 7000), hit('agroinvestor', 7000),
    ])
    expect(r[0].status).toBe('disputed')
    expect(r[0].variants).toHaveLength(2)
  })

  it('одинокая опечатка на фоне согласных источников спором не считается', () => {
    const r = reconcile([
      hit('zolnews', 7748), hit('oilworldru', 7748), hit('agrotrendru', 7748),
      hit('случайный', 77480),
    ])
    expect(r[0].status).toBe('confirmed')
    expect(r[0].rate).toBe(7748)
    expect(r[0].variants[1].rate).toBe(77480) // но вариант виден, не спрятан
  })
})

describe('Сторож неправдоподобия', () => {
  it('рост больше чем вдвое к прошлому месяцу не применяется молча', () => {
    expect(implausible(7748, 3294.2)).toBe(true) // настоящий скачок августа
    expect(implausible(3294.2, 7748)).toBe(true) // падение вдвое — тоже повод
    expect(implausible(7748, 7000)).toBe(false)
  })

  it('без прошлого месяца сторож молчит', () => {
    expect(implausible(7748, null)).toBe(false)
  })

  it('предыдущий месяц считается через границу года', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('2026-08')).toBe('2026-07')
  })
})

describe('Решение: что применять само, а что показать человеку', () => {
  const hits = [
    { product: 'oil', month: '2026-07', rate: 3294.2, source: 'zolnews', at: '2026-06-25T09:00:00Z' },
    { product: 'oil', month: '2026-07', rate: 3294.2, source: 'oilworldru', at: '2026-06-25T09:00:00Z' },
    { product: 'oil', month: '2026-08', rate: 7748, source: 'zolnews', at: JUL },
    { product: 'oil', month: '2026-08', rate: 7748, source: 'oilworldru', at: JUL },
    { product: 'meal', month: '2026-08', rate: 312.4, source: 'zolnews', at: JUL },
    { product: 'meal', month: '2026-08', rate: 312.4, source: 'agroinvestor', at: JUL },
  ]

  const d = decideDuties(hits, JUL)
  const oilAug = d.rates.find((r: { month: string; product: string }) => r.month === '2026-08' && r.product === 'oil')
  const mealAug = d.rates.find((r: { month: string; product: string }) => r.month === '2026-08' && r.product === 'meal')

  it('подтверждённое и правдоподобное применяется само', () => {
    expect(mealAug.status).toBe('confirmed')
    expect(mealAug.autoApply).toBe(true)
    expect(mealAug.needsHuman).toBe(false)
  })

  it('подтверждённое, но выросшее вдвое — само НЕ применяется', () => {
    expect(oilAug.status).toBe('confirmed')
    expect(oilAug.previousRate).toBe(3294.2)
    expect(oilAug.implausible).toBe(true)
    expect(oilAug.autoApply).toBe(false)
    expect(oilAug.needsHuman).toBe(true)
  })
})

describe('Маршрут /duties', () => {
  beforeEach(() => resetDutiesCache())

  const call = (scanDuties: () => unknown[]) =>
    handle({ db: null, now: () => JUL, scanDuties }, { method: 'GET', path: '/duties' }) as Promise<{
      status: number; body: { rates: unknown[]; note: string }
    }>

  it('отдаёт разобранные ставки', async () => {
    const r = await call(() => [
      { product: 'oil', month: '2026-08', rate: 7748, source: 'a', at: JUL },
      { product: 'oil', month: '2026-08', rate: 7748, source: 'b', at: JUL },
    ])
    expect(r.status).toBe(200)
    expect(r.body.rates).toHaveLength(1)
  })

  it('пустой источник — не ошибка, а «не найдено»', async () => {
    const r = await call(() => [])
    expect(r.status).toBe(200)
    expect(r.body.note).toContain('не найдено')
  })

  it('недоступная база сообщений сервис не роняет', async () => {
    const r = await call(() => {
      throw new Error('базы нет')
    })
    expect(r.status).toBe(200)
    expect(r.body.note).toContain('недоступен')
  })
})
