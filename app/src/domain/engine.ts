/**
 * БЛОКИ 4–8. Расчётное ядро: строки 9–41 БДР.
 *
 * Строки 8–50 идентичны на всех пяти листах, различия только в параметрах
 * строк 1–6 — поэтому ядро ОДНО, а модель это именованный набор параметров.
 *
 * Соответствие ячейкам (буква столбца = месяц; ниже B = окт.2026):
 *
 *  9   Продажа, т          `=SUM(B10:B15)`
 *  10  ядро, т             `=$L$1*$N$1*$F$1`
 *  11  П/Ф, т              `=$L$1*$N$1*$F$2`
 *  12  3 категория, т      `=$L$1*$N$1*$F$3`
 *  13  лузга, т            `=IF(B12>0;$L$1*$N$1*$F$4;0)` · у «Ядро » ПУСТО
 *  14  масло, т            `=$L$1*$N$1*$F$5`
 *                          M2, M5: `=$L$1*$F$2*$N$1*$F$5`  ← через П/Ф
 *  15  жмых, т             `=$L$1*$N$1*$F$6`
 *                          M2, M5: `=$L$1*$F$2*$N$1*$F$6`
 *  16  Выручка             `=SUM(B17:B22)`
 *  17  выручка ядро        `=B10*$B$1/1000/1,1`
 *  18  выручка П/Ф         `=B11*$B$2/1000/1,1`
 *  19  выручка 3 кат       `=B12*$B$3/1000/1,1`
 *  20  выручка лузга       `=B13*$B$4/1000/1,1`   B4 пуста → 0
 *  21  выручка масло       `=B14*$B$5/1000/1,1`
 *  22  выручка жмых        `=B15*$B$6/1000/1,1`
 *  23  Себестоимость       `=($L$1*$N$1*$D$1/1,1+$H$1/1,2*$L$1*$N$1)/1000`
 *  24  Отгрузка            `=SUM(B25:B29)`
 *  25  отгрузка ядро       `=B10*$H$3/1,2/1000`
 *  26  отгрузка П/Ф        `=B11*$H$2/1,2/1000`
 *  27  отгрузка 3 кат      `=B12*$H$3/1,2/1000`
 *  28  отгрузка масло      `=B14*$H$5/1,2/1000`
 *  29  отгрузка жмых       `=B15*$H$6/1,2/1000`
 *      отгрузки ЛУЗГИ строки нет; H4 пуста во всех пяти листах
 *  30  % пользования       `=$B$41`
 *  31  Налог               `=(B16-B23-B24-B30)*0,25`
 *  32  ФИН. РЕЗУЛЬТАТ      `=B16-B23-B24-B30-B31`
 *  33  Рентабельность      `=B32/B16`
 *  35  Запас сырья, ₽      `=N1*L1*D1`
 *  36  КЗ, ₽               `=B35/2`
 *  37  ДЗ, ₽               `=(N1*L1*F1*B1)`  ← по цене С НДС, только по ядру
 *  38  Вложенный капитал   `=B35+B37+B36`
 *  40  % за год            `=B38*J1/1000`
 *  41  % за месяц          `=B40/12`
 *
 * НЕ переносится: служебный блок O1:R6, Q11:Q12, O37; строки 34, 43, 50;
 * блок 52–55 (прессовый передел, показывается справочно);
 * битая ссылка `R5 = P5*H4/1,2` (H4 пуста) — зафиксирована, не чинится.
 *
 * Делитель 1,2 в строках 23–29 вынесен параметром `serviceVatDivisor`:
 * 1,2 для эталонов A и B, 1,22 в рабочем режиме.
 */

import type { MassId, ProductId } from './types'
import { deriveYields, massBalance, type MassBalance, type YieldInput } from './yields'
import { withVat } from './pricing'

export interface EngineSettings {
  /** Делитель НДС на УСЛУГИ: 1,2 как в файле или 1,22. */
  serviceVatDivisor: number
  /** Делитель НДС на ТОВАР. В файле 1,1; на фин. результат не влияет. */
  goodsVatDivisor: number
  /** Ставка налога на прибыль. */
  taxRate: number
}

export const SETTINGS_AS_IN_EXCEL: EngineSettings = {
  serviceVatDivisor: 1.2,
  goodsVatDivisor: 1.1,
  taxRate: 0.25,
}

export const SETTINGS_WORKING: EngineSettings = {
  serviceVatDivisor: 1.22,
  goodsVatDivisor: 1.1,
  taxRate: 0.25,
}

export interface EngineParams {
  /** L1, т/сут. */
  intakeTonsPerDay: number
  /** N1, суток. */
  daysPerMonth: number
  /** D1, ₽/т с НДС. */
  purchaseWithVat: number
  /** H1, ₽/т с НДС. Параметр ПО МОДЕЛИ. */
  processingWithVat: number
  /** J1, доля в год. */
  moneyRate: number
  yields: YieldInput
  /** M2, M5: строки 14–15 умножаются ещё и на F2. */
  oilFromSemi: boolean
  /** У «Ядро » строки 13 нет — тонны лузги в БДР не попадают. */
  huskRowPresent: boolean
  /** H2, H3, H5, H6, ₽/т с НДС. ВНУТРЕННЕЕ плечо. */
  shipping: { semi: number; kernelAndCat3: number; oil: number; meal: number }
}

/** Нетто-цены, ₽/т. Отсутствие ключа = цена НЕ ЗАДАНА (это не ноль). */
export type NetPrices = Partial<Record<ProductId, number>>

export interface EngineResult {
  rawTons: number
  balance: MassBalance
  tons: Partial<Record<MassId, number>>
  /** Строка 9. Показывать только с пометкой. */
  soldTonsAsInFile: number
  revenue: Partial<Record<ProductId, number>>
  revenueTotal: number
  cost: number
  shipping: Partial<Record<ProductId, number>>
  shippingTotal: number
  capital: {
    stock: number
    payables: number
    receivables: number
    total: number
    interestYear: number
    interestMonthly: number
  }
  tax: number
  netResult: number
  /**
   * НЕ ОПРЕДЕЛЕНА при нулевой выручке: 0/0 — это не ноль.
   * Показывать «—», а не число.
   */
  margin: number | null
  /** Строго на тонну СЫРЬЯ. Никогда не на строку 9. */
  netPerRawTon: number
  /** Экономия на топливе от лузги (Q3). В выручку НЕ входит. */
  huskFuelSaving: number
}

export function calcMonth(
  p: EngineParams,
  prices: NetPrices,
  s: EngineSettings,
  opts: { huskFuelSavingRubPerTon?: number } = {},
): EngineResult {
  const y = deriveYields(p.yields)
  const rawTons = p.intakeTonsPerDay * p.daysPerMonth // L1 × N1

  // ── Блок 4. Тонны, строки 10–15
  const tKernel = rawTons * y.kernel // строка 10
  const tSemi = rawTons * y.semi // строка 11
  const tCat3 = rawTons * y.cat3 // строка 12
  // строка 13: `IF(стр.12>0; L1*N1*F4; 0)`; у «Ядро » формулы нет вовсе
  const tHuskRow = p.huskRowPresent && tCat3 > 0 ? rawTons * y.husk : 0
  const base = p.oilFromSemi ? rawTons * y.semi : rawTons
  const tOil = base * y.oil // строка 14
  const tMeal = base * y.meal // строка 15

  // строка 9 — воспроизводит файл буквально, включая двойной счёт П/Ф в M2 и M5
  const soldTonsAsInFile = tKernel + tSemi + tCat3 + tHuskRow + tOil + tMeal

  // Физическая масса лузги существует независимо от строки 13
  const tHuskPhysical = rawTons * y.husk

  // ── Блок 5. Выручка, строки 17–22
  const g = s.goodsVatDivisor
  // цена в файле «с НДС», выручка делится на 1,1 — множители сокращаются,
  // поэтому нетто × тонны даёт то же самое; форму файла сохраняем явно
  const rev = (tons: number, net?: number) =>
    net === undefined ? 0 : (tons * withVat(net)) / 1000 / g

  const revenue: Partial<Record<ProductId, number>> = {
    kernel: rev(tKernel, prices.kernel),
    semi: rev(tSemi, prices.semi),
    cat3: rev(tCat3, prices.cat3),
    husk: rev(tHuskRow, prices.husk),
    oil: rev(tOil, prices.oil),
    meal: rev(tMeal, prices.meal),
  }
  const revenueTotal = Object.values(revenue).reduce((a, b) => a + b, 0) // строка 16

  // ── Блок 6. Себестоимость (23) и отгрузка (24–29)
  const v = s.serviceVatDivisor
  const cost = (rawTons * p.purchaseWithVat) / g / 1000 + (p.processingWithVat / v) * rawTons / 1000

  const ship = (tons: number, rate: number) => (tons * rate) / v / 1000
  const shipping: Partial<Record<ProductId, number>> = {
    kernel: ship(tKernel, p.shipping.kernelAndCat3),
    semi: ship(tSemi, p.shipping.semi),
    cat3: ship(tCat3, p.shipping.kernelAndCat3),
    oil: ship(tOil, p.shipping.oil),
    meal: ship(tMeal, p.shipping.meal),
    // отгрузки лузги в БДР нет: строки нет, H4 пуста
  }
  const shippingTotal = Object.values(shipping).reduce((a, b) => a + b, 0)

  // ── Блок 7. Капитал (35–38) и процент (40, 41, 30)
  const stock = p.daysPerMonth * p.intakeTonsPerDay * p.purchaseWithVat // 35
  const payables = stock / 2 // 36 — прибавляется, не вычитается: решение владельца
  // 37: ДЗ считается по цене С НДС и только по ядру (D4)
  const receivables =
    prices.kernel === undefined
      ? 0
      : p.daysPerMonth * p.intakeTonsPerDay * y.kernel * withVat(prices.kernel)
  const capitalTotal = stock + receivables + payables // 38
  const interestYear = (capitalTotal * p.moneyRate) / 1000 // 40
  const interestMonthly = interestYear / 12 // 41 → строка 30

  // ── Блок 8. Налог (31), фин. результат (32), рентабельность (33)
  const tax = (revenueTotal - cost - shippingTotal - interestMonthly) * s.taxRate
  const netResult = revenueTotal - cost - shippingTotal - interestMonthly - tax
  const margin = revenueTotal === 0 ? null : netResult / revenueTotal

  return {
    rawTons,
    balance: massBalance(y, rawTons, {
      oilFromSemi: p.oilFromSemi,
      lossShare: p.yields.lossShare,
      huskMonetized: prices.husk !== undefined,
    }),
    tons: {
      kernel: tKernel || undefined,
      semi: tSemi || undefined,
      cat3: tCat3 || undefined,
      husk: tHuskPhysical || undefined,
      oil: tOil || undefined,
      meal: tMeal || undefined,
    },
    soldTonsAsInFile,
    revenue,
    revenueTotal,
    cost,
    shipping,
    shippingTotal,
    capital: { stock, payables, receivables, total: capitalTotal, interestYear, interestMonthly },
    tax,
    netResult,
    margin,
    netPerRawTon: (netResult / rawTons) * 1000,
    // Q3: лузга сжигается на собственном котле — это ЭКОНОМИЯ, не выручка.
    // Отдельной строкой ниже фин. результата, по умолчанию 0.
    huskFuelSaving: (tHuskPhysical * (opts.huskFuelSavingRubPerTon ?? 0)) / 1000,
  }
}
