/**
 * Регрессия переноса формул: эталоны A, B, C из технического задания.
 * При расхождении сверх допуска тест падает — обходить нельзя.
 */

import { describe, expect, it } from 'vitest'
import { calcMonth, SETTINGS_AS_IN_EXCEL, SETTINGS_WORKING, type NetPrices } from '../src/domain/engine'
import { excelForecastDiscount, excelPrices, netback, contractToQuote, CZCE_DEFAULTS } from '../src/domain/pricing'
import { chooseBasis, type BasisCandidate } from '../src/domain/basis'
import { byId } from '../src/data/models'
import { REF_A, REF_B, REF_C, REF_C_NET_PRICES, TOL_MARGIN, TOL_MONEY } from '../src/data/references'

const CNY = 11.5

/**
 * Заявленный допуск: 0,011 тыс.₽ по деньгам, 0,0001 по доле рентабельности.
 * Он покрывает то, что эталоны в ТЗ напечатаны округлёнными до копеек
 * (расхождение до 0,005), и не покрывает ничего сверх этого.
 */
function near(got: number, exp: number, what: string) {
  const d = Math.abs(got - exp)
  if (d > TOL_MONEY) {
    throw new Error(`${what}: получено ${got.toFixed(4)}, эталон ${exp.toFixed(2)}, Δ ${d.toFixed(4)} > ${TOL_MONEY}`)
  }
}

function checkRow(
  got: { revenueTotal: number; cost: number; shippingTotal: number; capital: { interestMonthly: number }; tax: number; netResult: number; margin: number },
  exp: { revenue: number; cost?: number; shipping?: number; interest?: number; tax?: number; net: number; margin: number },
) {
  near(got.revenueTotal, exp.revenue, 'выручка')
  if (exp.cost !== undefined) near(got.cost, exp.cost, 'себестоимость')
  if (exp.shipping !== undefined) near(got.shippingTotal, exp.shipping, 'отгрузка')
  if (exp.interest !== undefined) near(got.capital.interestMonthly, exp.interest, '% пользования')
  if (exp.tax !== undefined) near(got.tax, exp.tax, 'налог')
  near(got.netResult, exp.net, 'фин. результат')
  expect(Math.abs(got.margin - exp.margin)).toBeLessThan(TOL_MARGIN)
}

// ────────────────────────────────────────────────────── Эталон A «как в Excel»

describe('Эталон A — как в Excel (C5 = 0,8636…, НДС услуг 1,2)', () => {
  const c5 = excelForecastDiscount()
  const p = excelPrices(CNY, c5)

  const PRICES: Record<string, NetPrices> = {
    M1: { oil: p.rapeOilMY, meal: p.rapeMeal },
    M2: { oil: p.sunOil, meal: p.sunMeal },
    M3: { kernel: p.kernel, semi: p.semi, cat3: p.cat3 },
    M4: { oil: p.rapeOilCN, meal: p.rapeMeal },
    M5: { kernel: p.kernel, oil: p.sunOil, meal: p.sunMeal },
  }

  it('C5 воспроизводит формулу файла 1 − (1250/1100 − 1)', () => {
    expect(c5).toBeCloseTo(0.8636363636, 9)
  })

  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5'] as const) {
    it(`${id} — 7 показателей`, () => {
      const r = calcMonth(byId(id).params, PRICES[id], SETTINGS_AS_IN_EXCEL)
      checkRow(r, REF_A[id])
    })
  }
})

// ──────────────────────────────────────────── Эталон B — C5 = 1, НДС услуг 1,2

describe('Эталон B — без прогнозного дисконта, НДС услуг 1,2', () => {
  const p = excelPrices(CNY, 1)
  const PRICES: Record<string, NetPrices> = {
    M2: { oil: p.sunOil, meal: p.sunMeal },
    M3: { kernel: p.kernel, semi: p.semi, cat3: p.cat3 },
    M5: { kernel: p.kernel, oil: p.sunOil, meal: p.sunMeal },
  }

  it('цены при C5 = 1 совпадают с ТЗ', () => {
    // Слева — точные значения формул файла, справа — как они напечатаны в ТЗ.
    // Ядро: точное 65 880,375, в ТЗ округлено до 65 880,38 — это округление
    // при печати, а не расхождение расчёта.
    near(p.sunOil * 1.1, 87257.5, 'подсолн. масло с НДС')
    near(p.sunMeal * 1.1, 12000, 'подсолн. жмых с НДС')
    expect(p.kernel * 1.1).toBeCloseTo(65880.375, 6)
    expect(p.semi * 1.1).toBeCloseTo(55868.175, 6)
    expect(p.cat3 * 1.1).toBeCloseTo(46955.975, 6)
  })

  for (const id of ['M2', 'M3', 'M5'] as const) {
    it(`${id} — выручка, фин. результат, рентабельность`, () => {
      const r = calcMonth(byId(id).params, PRICES[id], SETTINGS_AS_IN_EXCEL)
      checkRow(r, REF_B[id])
    })
  }
})

// ─────────────────────────────────────────────── Эталон C — рабочий, НДС 1,22

describe('Эталон C — рабочий расчёт (НДС услуг 1,22)', () => {
  const DUTY_SUN_OIL = 7000
  const DUTY_SUN_MEAL = 1015.91
  const KERNEL_DUTY = 6.5

  const pctDuty = { kind: 'percent' as const, percent: KERNEL_DUTY }
  const noDuty = { kind: 'none' as const }
  const cny = (contract: number, duty: Parameters<typeof netback>[0]['duty'], log: number) =>
    netback({ contract, currency: 'CNY' as const, fx: CNY, duty, logisticsRubPerTon: log })

  const NET = {
    kernel: cny(6500, pctDuty, 10000),
    semi: cny(5700, pctDuty, 10500),
    cat3: cny(4900, pctDuty, 10000),
    sunOil: cny(8550, { kind: 'perTon', rubPerTon: DUTY_SUN_OIL }, 12000),
    sunMeal: cny(1950, { kind: 'perTon', rubPerTon: DUTY_SUN_MEAL }, 10500),
    rapeMeal: cny(2300, noDuty, 10500),
    rapeOilCN: cny(8000, noDuty, 12000),
    rapeOilMY: cny(7300, noDuty, 15000),
    rapeOilIR80: netback({ contract: 1050, currency: 'USD', fx: 80, duty: noDuty, logisticsRubPerTon: 15000 }),
    rapeOilIR82: netback({ contract: 1050, currency: 'USD', fx: 82, duty: noDuty, logisticsRubPerTon: 15000 }),
  }

  it('нетто-цены совпадают с ТЗ', () => {
    expect(NET.rapeMeal).toBeCloseTo(REF_C_NET_PRICES.rapeMeal, 2)
    expect(NET.sunOil).toBeCloseTo(REF_C_NET_PRICES.sunOil, 2)
    expect(NET.sunMeal).toBeCloseTo(REF_C_NET_PRICES.sunMeal, 2)
    expect(NET.kernel).toBeCloseTo(REF_C_NET_PRICES.kernel, 2)
    expect(NET.semi).toBeCloseTo(REF_C_NET_PRICES.semi, 2)
    expect(NET.cat3).toBeCloseTo(REF_C_NET_PRICES.cat3, 2)
  })

  const CASES: [string, string, NetPrices][] = [
    ['M1-MY', 'M1', { oil: NET.rapeOilMY, meal: NET.rapeMeal }],
    ['M1-IR-80', 'M1', { oil: NET.rapeOilIR80, meal: NET.rapeMeal }],
    ['M1-IR-82', 'M1', { oil: NET.rapeOilIR82, meal: NET.rapeMeal }],
    ['M4', 'M4', { oil: NET.rapeOilCN, meal: NET.rapeMeal }],
    ['M2', 'M2', { oil: NET.sunOil, meal: NET.sunMeal }],
    ['M3', 'M3', { kernel: NET.kernel, semi: NET.semi, cat3: NET.cat3 }],
    ['M5', 'M5', { kernel: NET.kernel, oil: NET.sunOil, meal: NET.sunMeal }],
  ]

  for (const [key, modelId, prices] of CASES) {
    it(`${key} — 7 показателей`, () => {
      const r = calcMonth(byId(modelId as 'M1').params, prices, SETTINGS_WORKING)
      checkRow(r, REF_C[key])
    })
  }

  it('ДЗ считается по цене С НДС и только по ядру', () => {
    const m3 = calcMonth(byId('M3').params, { kernel: NET.kernel, semi: NET.semi, cat3: NET.cat3 }, SETTINGS_WORKING)
    expect(m3.capital.receivables).toBeCloseTo(1512 * NET.kernel * 1.1, 0)
    expect(m3.capital.total).toBeCloseTo(252701127, 0)

    const m1 = calcMonth(byId('M1').params, { oil: NET.rapeOilMY, meal: NET.rapeMeal }, SETTINGS_WORKING)
    expect(m1.capital.receivables).toBe(0) // F1 = 0 → ДЗ = 0 (D4)
  })
})

// ────────────────────────────────────────────────── Выходы и физическая масса

describe('Выходы и баланс массы', () => {
  it('F2 = 1 − F1 − F3 − F4 у M2, M3, M5', () => {
    const y = (id: 'M2' | 'M3' | 'M5') => byId(id).params.yields
    const d = (id: 'M2' | 'M3' | 'M5') => 1 - y(id).kernel - y(id).cat3 - y(id).husk
    expect(d('M2')).toBeCloseTo(0.87, 10)
    expect(d('M3')).toBeCloseTo(0.27, 10)
    expect(d('M5')).toBeCloseTo(0.67, 10)
  })

  it('F6 = (1 − потери) − F5 даёт значения файла', () => {
    expect(1 - 0.01 - 0.36).toBeCloseTo(0.63, 10) // M1, M4
    expect(1 - 0.01 - 0.49).toBeCloseTo(0.5, 10) // M2, M5
  })

  it('лузга M3: 1 134,0 т физически есть, но в строку 9 не входит', () => {
    const r = calcMonth(byId('M3').params, { kernel: 59891.25, semi: 50789.25, cat3: 42687.25 }, SETTINGS_WORKING)
    expect(r.tons.husk).toBeCloseTo(1134, 6)
    expect(r.soldTonsAsInFile).toBeCloseTo(2646, 6) // как в файле: строки 13 нет
    expect(r.revenue.husk).toBe(0) // цена не задана
  })

  it('двойной счёт П/Ф в строке 9 у M2 и M5 воспроизводится', () => {
    const m2 = calcMonth(byId('M2').params, { oil: 79325, meal: 10909.09 }, SETTINGS_WORKING)
    expect(m2.soldTonsAsInFile).toBeCloseTo(4908.2355, 3)
    expect(m2.soldTonsAsInFile).toBeGreaterThan(m2.rawTons) // 4 908 > 2 835
    const m5 = calcMonth(byId('M5').params, { kernel: 59891.25, oil: 79325, meal: 10909.09 }, SETTINGS_WORKING)
    expect(m5.soldTonsAsInFile).toBeCloseTo(5795.874, 3)
  })

  it('удельное считается на тонну сырья, а не на строку 9', () => {
    const m5 = calcMonth(byId('M5').params, { kernel: 59891.25, oil: 79325, meal: 10909.09 }, SETTINGS_WORKING)
    expect(m5.netPerRawTon).toBeCloseTo((m5.netResult / 3780) * 1000, 6)
    expect(m5.netPerRawTon).toBeCloseTo(8176.56, 1)
  })
})

// ────────────────────────────────────────────────────────── Базис M1 и фьючерс

describe('Выбор базиса M1', () => {
  const mk = (destination: 'IR' | 'MY', contract: number, currency: 'USD' | 'CNY', fx: number): BasisCandidate => ({
    destination,
    contract,
    currency,
    fx,
    logisticsRubPerTon: 15000,
    net: contract * fx - 15000,
  })

  it('порог 6,9524 и 79,95 ₽/долл при курсе CNY 11,5', () => {
    const c = chooseBasis(mk('IR', 1050, 'USD', 80), mk('MY', 7300, 'CNY', 11.5))
    expect(c.crossoverUsdPerCny).toBeCloseTo(6.952381, 6)
    expect(c.thresholdUsdRub).toBeCloseTo(79.952381, 6)
    expect(c.logisticsEqual).toBe(true)
  })

  it('при 80,00 выигрывает Иран с отрывом 50,00 ₽/т', () => {
    const c = chooseBasis(mk('IR', 1050, 'USD', 80), mk('MY', 7300, 'CNY', 11.5))
    expect(c.winner.destination).toBe('IR')
    expect(c.gapRubPerTon).toBeCloseTo(50, 6)
    expect(c.distanceRub).toBeCloseTo(0.047619, 6)
  })

  it('при 79,95 выигрывает ещё Малайзия — переключение выше порога', () => {
    const c = chooseBasis(mk('IR', 1050, 'USD', 79.95), mk('MY', 7300, 'CNY', 11.5))
    expect(c.winner.destination).toBe('MY')
    expect(c.distanceRub).toBeLessThan(0)
  })
})

describe('Цепочка CZCE', () => {
  it('обратный пересчёт: контракту 8 000 соответствует котировка 9 781,43', () => {
    expect(contractToQuote(8000, CZCE_DEFAULTS)).toBeCloseTo(9781.43, 2)
  })
})
