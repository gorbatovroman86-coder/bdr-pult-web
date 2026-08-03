/**
 * Сторож проводки: то, что ПОКАЗЫВАЕТ пульт, обязано совпадать с эталоном (C).
 *
 * Этот тест ловит расхождения не в формулах, а во входных данных — например,
 * подстановку округлённой котировки CZCE вместо канонической цены контракта.
 */

import { describe, expect, it } from 'vitest'
import { BASIS, COMPUTED, CZCE_CONTRACT, CZCE_QUOTE, CZCE_ROUNDTRIP, NET } from '../src/data/calc'
import { REF_C, REF_C_NET_PRICES, TOL_MONEY } from '../src/data/references'

const near = (got: number, exp: number, what: string) => {
  const d = Math.abs(got - exp)
  if (d > TOL_MONEY) throw new Error(`${what}: пульт ${got.toFixed(4)}, эталон ${exp.toFixed(2)}, Δ ${d.toFixed(4)}`)
}

describe('Пульт против эталона (C)', () => {
  const MAP: Record<string, string> = { M1: 'M1-IR-80', M2: 'M2', M3: 'M3', M4: 'M4', M5: 'M5' }

  for (const c of COMPUTED) {
    it(`${c.meta.id} — то, что на экране, равно эталону`, () => {
      const exp = REF_C[MAP[c.meta.id]]
      near(c.result.revenueTotal, exp.revenue, 'выручка')
      near(c.result.cost, exp.cost, 'себестоимость')
      near(c.result.shippingTotal, exp.shipping, 'отгрузка')
      near(c.result.capital.interestMonthly, exp.interest, '% пользования')
      near(c.result.tax, exp.tax, 'налог')
      near(c.result.netResult, exp.net, 'фин. результат')
    })
  }

  it('нетто-цены совпадают с эталоном', () => {
    near(NET.kernel, REF_C_NET_PRICES.kernel, 'ядро')
    near(NET.semi, REF_C_NET_PRICES.semi, 'П/Ф')
    near(NET.cat3, REF_C_NET_PRICES.cat3, '3 кат')
    near(NET.sunOil, REF_C_NET_PRICES.sunOil, 'подсолн. масло')
    near(NET.sunMeal, REF_C_NET_PRICES.sunMeal, 'подсолн. жмых')
    near(NET.rapeMeal, REF_C_NET_PRICES.rapeMeal, 'рапс. жмых')
    near(NET.rapeOilCN, 80000, 'рапс. масло Китай')
  })

  it('цепочка CZCE замкнута: контракт → котировка → тот же контракт', () => {
    expect(CZCE_CONTRACT).toBe(8000)
    expect(CZCE_QUOTE).toBeCloseTo(9781.43, 2)
    expect(CZCE_ROUNDTRIP).toBeCloseTo(CZCE_CONTRACT, 6)
  })

  it('базис M1: при курсе 80,00 выигрывает Иран', () => {
    expect(BASIS.winner.destination).toBe('IR')
    expect(BASIS.gapRubPerTon).toBeCloseTo(50, 6)
  })

  it('рейтинг: M5 → M3 → M2 → M4 → M1', () => {
    expect(COMPUTED.map((c) => c.meta.id)).toEqual(['M5', 'M3', 'M2', 'M4', 'M1'])
  })
})
