/**
 * БЛОК 9а. Карта формул: показатель → формула → лист!ячейка.
 * Питает раскрытие формул в интерфейсе.
 */

import type { EngineResult } from './engine'
import { kRub, rub, rubPerTon, tons } from './units'

export interface Trace {
  label: string
  formula: string
  substituted: string
  cell: string
  row: number
  /** Отличие от файла, включённое настройкой. */
  deviation?: string
  children?: Trace[]
}

const q = (sheet: string, row: number) => `«${sheet}»!B${row}`

export function traceNetResult(
  r: EngineResult,
  sheet: string,
  serviceVatDivisor: number,
  purchaseWithVat: number,
  processingWithVat: number,
  moneyRate: number,
): Trace {
  const vatNote =
    serviceVatDivisor === 1.2
      ? undefined
      : `НДС услуг ${((serviceVatDivisor - 1) * 100).toFixed(0)} % (делитель ${serviceVatDivisor}) вместо 20 % в файле — включено настройкой`

  return {
    label: 'Фин. результат',
    formula: 'Выручка − Себестоимость − Отгрузка − % пользования − Налог',
    substituted: `${kRub(r.revenueTotal)} − ${kRub(r.cost)} − ${kRub(r.shippingTotal)} − ${kRub(r.capital.interestMonthly)} − ${kRub(r.tax)} = ${kRub(r.netResult)}`,
    cell: q(sheet, 32),
    row: 32,
    children: [
      {
        label: 'Выручка',
        formula: '=SUM(B17:B22) · по продукту: тонны × цена ÷ 1000 ÷ 1,1',
        substituted: `= ${kRub(r.revenueTotal)}`,
        cell: q(sheet, 16),
        row: 16,
      },
      {
        label: 'Себестоимость',
        formula: '=($L$1*$N$1*$D$1/1,1 + $H$1/НДСуслуг*$L$1*$N$1)/1000',
        substituted: `(${tons(r.rawTons)} × ${rub(purchaseWithVat)} ÷ 1,1 + ${rub(processingWithVat)} ÷ ${serviceVatDivisor} × ${tons(r.rawTons)}) ÷ 1000 = ${kRub(r.cost)}`,
        cell: q(sheet, 23),
        row: 23,
        deviation: vatNote,
      },
      {
        label: 'Отгрузка',
        formula: '=SUM(B25:B29) · по продукту: тонны × ставка ÷ НДСуслуг ÷ 1000',
        substituted: `= ${kRub(r.shippingTotal)}`,
        cell: q(sheet, 24),
        row: 24,
        deviation: vatNote,
      },
      {
        label: '% пользования деньгами',
        formula: '=B41 · B41 = B40/12 · B40 = B38*J1/1000 · B38 = B35+B36+B37',
        substituted: `(${rub(r.capital.stock)} + ${rub(r.capital.payables)} + ${rub(r.capital.receivables)}) × ${(moneyRate * 100).toFixed(1)} % ÷ 12 ÷ 1000 = ${kRub(r.capital.interestMonthly)}`,
        cell: q(sheet, 30),
        row: 30,
        children: [
          {
            label: 'Запас сырья',
            formula: '=N1*L1*D1',
            substituted: `${tons(r.rawTons)} × ${rub(purchaseWithVat)} = ${rub(r.capital.stock)} ₽`,
            cell: q(sheet, 35),
            row: 35,
          },
          {
            label: 'Кредиторка (½ мес)',
            formula: '=B35/2',
            substituted: `${rub(r.capital.stock)} ÷ 2 = ${rub(r.capital.payables)} ₽`,
            cell: q(sheet, 36),
            row: 36,
            deviation:
              'прибавляется к капиталу, а не вычитается. Решение владельца модели, не факт из БДР',
          },
          {
            label: 'Дебиторка',
            formula: '=(N1*L1*F1*B1) — по цене С НДС, только по ядру',
            substituted: `${rub(r.capital.receivables)} ₽`,
            cell: q(sheet, 37),
            row: 37,
            deviation:
              r.capital.receivables === 0
                ? 'ядра в этом режиме нет → ДЗ = 0, капитал и процент занижены (D4)'
                : undefined,
          },
        ],
      },
      {
        label: 'Налог на прибыль',
        formula: '=(B16-B23-B24-B30)*0,25',
        substituted: `(${kRub(r.revenueTotal)} − ${kRub(r.cost)} − ${kRub(r.shippingTotal)} − ${kRub(r.capital.interestMonthly)}) × 25 % = ${kRub(r.tax)}`,
        cell: q(sheet, 31),
        row: 31,
        deviation: 'управленческий ФОТ в базу налога не входит — как в файле',
      },
    ],
  }
}

/** Раскрытие выручки по продуктам: строки 17–22. */
export function traceRevenue(
  r: EngineResult,
  sheet: string,
  netPrices: Partial<Record<string, number>>,
): { label: string; tons: string; price: string; sum: string; cell: string }[] {
  const ROW: Record<string, [number, string]> = {
    kernel: [17, 'ядро'],
    semi: [18, 'полуфабрикат'],
    cat3: [19, '3 категория'],
    husk: [20, 'лузга'],
    oil: [21, 'масло'],
    meal: [22, 'жмых'],
  }
  const out = []
  for (const [id, [row, label]] of Object.entries(ROW)) {
    const t = (r.tons as Record<string, number | undefined>)[id]
    if (t === undefined || t === 0) continue
    const price = netPrices[id]
    out.push({
      label,
      tons: `${tons(t)} т`,
      price: price === undefined ? 'цена не задана' : `${rubPerTon(price)} ₽/т`,
      sum: kRub((r.revenue as Record<string, number | undefined>)[id] ?? 0),
      cell: q(sheet, row),
    })
  }
  return out
}
