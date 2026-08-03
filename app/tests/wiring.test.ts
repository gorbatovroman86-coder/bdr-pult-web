/**
 * Сторож связки «экран ↔ эталон».
 *
 * Проверяет ровно то, что видит пользователь: результат сборки `computeAll`
 * на БАЗОВЫХ входных данных обязан совпадать с рабочим эталоном (C).
 * Ловит подмену входа, а не только ошибку в формуле.
 */

import { describe, expect, it } from 'vitest'
import { computeAll, ranked } from '../src/state/compute'
import { BASE, baseInputs, changedPaths } from '../src/state/inputs'
import { REF_C, REF_C_NET_PRICES, TOL_MONEY } from '../src/data/references'

const near = (got: number, exp: number, what: string) => {
  const d = Math.abs(got - exp)
  if (d > TOL_MONEY) throw new Error(`${what}: пульт ${got.toFixed(4)}, эталон ${exp.toFixed(2)}, Δ ${d.toFixed(4)}`)
}

const c = computeAll(BASE)
const by = (id: string) => c.models.find((m) => m.meta.id === id)!

describe('Пульт на базовых входных данных = эталон (C)', () => {
  const MAP: Record<string, string> = { M1: 'M1-IR-80', M2: 'M2', M3: 'M3', M4: 'M4', M5: 'M5' }

  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5']) {
    it(`${id} — то, что на экране, равно эталону`, () => {
      const m = by(id)
      const exp = REF_C[MAP[id]]
      expect(m.blockers, `${id} не должна быть заблокирована на базе`).toHaveLength(0)
      near(m.result.revenueTotal, exp.revenue, 'выручка')
      near(m.result.cost, exp.cost, 'себестоимость')
      near(m.result.shippingTotal, exp.shipping, 'отгрузка')
      near(m.result.capital.interestMonthly, exp.interest, '% пользования')
      near(m.result.tax, exp.tax, 'налог')
      near(m.result.netResult, exp.net, 'фин. результат')
    })
  }

  it('нетто-цены совпадают с эталоном', () => {
    near(c.net.kernel!, REF_C_NET_PRICES.kernel, 'ядро')
    near(c.net.semi!, REF_C_NET_PRICES.semi, 'П/Ф')
    near(c.net.cat3!, REF_C_NET_PRICES.cat3, '3 кат')
    near(c.net.sunOil!, REF_C_NET_PRICES.sunOil, 'подсолн. масло')
    near(c.net.sunMeal!, REF_C_NET_PRICES.sunMeal, 'подсолн. жмых')
    near(c.net.rapeMeal!, REF_C_NET_PRICES.rapeMeal, 'рапс. жмых')
    near(c.net.rapeOilCN!, 80000, 'рапс. масло Китай')
  })

  it('цепочка CZCE замкнута: контракт → котировка → тот же контракт', () => {
    expect(c.czce.contract).toBe(8000)
    expect(c.czce.quote!).toBeCloseTo(9781.43, 2)
    expect(c.czce.roundtrip!).toBeCloseTo(8000, 6)
  })

  it('базис M1: при курсе 80,00 выигрывает Иран с отрывом 50,00 ₽/т', () => {
    expect(c.basis!.winner.destination).toBe('IR')
    expect(c.basis!.gapRubPerTon).toBeCloseTo(50, 6)
  })

  it('рейтинг: M5 → M3 → M2 → M4 → M1', () => {
    expect(ranked(c).map((m) => m.meta.id)).toEqual(['M5', 'M3', 'M2', 'M4', 'M1'])
  })

  it('база не помечена как изменённая', () => {
    expect(changedPaths(BASE)).toHaveLength(0)
    expect(changedPaths(baseInputs())).toHaveLength(0)
  })
})

describe('Живой пересчёт: правка входа меняет результат', () => {
  it('рост цены подсолнечного масла поднимает M2 и M5, не трогая рапсовые', () => {
    const i = baseInputs()
    i.contracts.sunOil.value = 9000
    const c2 = computeAll(i)
    const get = (x: typeof c2, id: string) => x.models.find((m) => m.meta.id === id)!.result.netResult

    expect(get(c2, 'M2')).toBeGreaterThan(get(c, 'M2'))
    expect(get(c2, 'M5')).toBeGreaterThan(get(c, 'M5'))
    expect(get(c2, 'M1')).toBeCloseTo(get(c, 'M1'), 6)
    expect(get(c2, 'M3')).toBeCloseTo(get(c, 'M3'), 6)
    expect(get(c2, 'M4')).toBeCloseTo(get(c, 'M4'), 6)
  })

  it('курс доллара выше порога переключает базис M1 на Иран, ниже — на Малайзию', () => {
    const low = baseInputs(); low.fxUsd.value = 79.9
    const high = baseInputs(); high.fxUsd.value = 80.0
    expect(computeAll(low).basis!.winner.destination).toBe('MY')
    expect(computeAll(high).basis!.winner.destination).toBe('IR')
  })

  it('НДС услуг 20 % меняет себестоимость и отгрузку всех моделей', () => {
    const i = baseInputs(); i.serviceVatDivisor = 1.2
    const c2 = computeAll(i)
    for (const id of ['M1', 'M2', 'M3', 'M4', 'M5']) {
      const a = by(id).result
      const b = c2.models.find((m) => m.meta.id === id)!.result
      expect(b.cost).toBeGreaterThan(a.cost) // делитель меньше → затраты выше
      expect(b.netResult).toBeLessThan(a.netResult)
    }
  })

  it('изменение выхода ядра у M3 пересчитывает производный П/Ф', () => {
    const i = baseInputs(); i.models.M3.yieldKernel = 0.45
    const m = computeAll(i).models.find((x) => x.meta.id === 'M3')!
    expect(m.result.tons.kernel).toBeCloseTo(1701, 6)
    expect(m.result.tons.semi).toBeCloseTo(831.6, 6) // 1 − 0,45 − 0,03 − 0,30 = 0,22
  })

  it('экономия на топливе от лузги считается и в выручку не входит', () => {
    const i = baseInputs(); i.huskFuelSaving = 1000
    const m = computeAll(i).models.find((x) => x.meta.id === 'M3')!
    expect(m.result.huskFuelSaving).toBeCloseTo(1134, 6) // 1 134 т × 1000 ₽ / 1000
    near(m.result.revenueTotal, REF_C.M3.revenue, 'выручка не изменилась')
    near(m.result.netResult, REF_C.M3.net, 'фин. результат не изменился')
  })
})

describe('Блокировки работают через входные данные', () => {
  it('просроченный месяц ставок МСХ останавливает M2 и M5, но не M3', () => {
    const i = baseInputs()
    i.dutySunOil.month = '2026-07'
    i.dutySunMeal.month = '2026-07'
    const c2 = computeAll(i)
    const blocked = c2.models.filter((m) => m.blockers.length > 0).map((m) => m.meta.id)
    expect(blocked.sort()).toEqual(['M2', 'M5'])
    const m2 = c2.models.find((m) => m.meta.id === 'M2')!
    expect(m2.blockers[0].message).toContain('подсолнечное масло')
  })

  it('незаданная экспортная пошлина останавливает M3 и M5', () => {
    const i = baseInputs()
    i.dutyKernelPercent.value = null
    const blocked = computeAll(i).models.filter((m) => m.blockers.length > 0).map((m) => m.meta.id)
    expect(blocked.sort()).toEqual(['M3', 'M5'])
  })

  it('незаданный курс доллара останавливает только M1', () => {
    const i = baseInputs()
    i.fxUsd.value = null
    const blocked = computeAll(i).models.filter((m) => m.blockers.length > 0).map((m) => m.meta.id)
    expect(blocked).toEqual(['M1'])
  })

  it('заблокированные уходят в конец рейтинга', () => {
    const i = baseInputs()
    i.dutySunOil.month = '2026-07'
    i.dutySunMeal.month = '2026-07'
    const order = ranked(computeAll(i)).map((m) => m.meta.id)
    expect(order.slice(-2).sort()).toEqual(['M2', 'M5'])
  })
})

describe('Сброс возвращает ровно эталон (C)', () => {
  it('после правок сброс даёт базу', () => {
    const i = baseInputs()
    i.fxCny.value = 13
    i.models.M3.yieldKernel = 0.9
    i.serviceVatDivisor = 1.2
    expect(changedPaths(i).length).toBeGreaterThan(0)

    const back = baseInputs()
    expect(changedPaths(back)).toHaveLength(0)
    const c2 = computeAll(back)
    for (const id of ['M1', 'M2', 'M3', 'M4', 'M5']) {
      const exp = REF_C[{ M1: 'M1-IR-80', M2: 'M2', M3: 'M3', M4: 'M4', M5: 'M5' }[id]!]
      near(c2.models.find((m) => m.meta.id === id)!.result.netResult, exp.net, `${id} после сброса`)
    }
  })
})
