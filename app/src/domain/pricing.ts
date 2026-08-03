/**
 * БЛОК 2. Цены.
 *
 * Перенос из БДР, ячейки B1…B6 (у каждого листа свои):
 *   «Ядро »!B1              `=(6500*$C$3*0,935*$C$5-10000)*1,1`   ядро
 *   «Ядро »!B2              `=(5700*C3*0,935*C5-10500)*1,1`       полуфабрикат
 *   «Ядро »!B3              `=(4900*$C$3*0,935*$C$5-10000)*1,1`   3 категория
 *   «Ядро+масло»!B1         то же, что «Ядро »!B1                 ядро
 *   «Масло (через ядро)»!B5 `=(8550*C5*C3-7000-12000)*1,1`        подсолн. масло
 *   «Масло (через ядро)»!B6 `=12000*C5`                           подсолн. жмых
 *   «Масло (рапс, Иран, Малайзия)»!B5 `=(7300*C3-15000)*1,1`      рапс. масло
 *   «Масло (рапс, Китай)»!B5          `=(8000*C3-12000)*1,1`      рапс. масло
 *   «Масло (рапс, …)»!B6              `=(2300*C3-10500)*1,1`      рапс. жмых
 *   B4 цена ЛУЗГИ — ПУСТА во всех пяти листах
 *   C3 курс, C5 прогнозный дисконт `=1-N4`, N4 `=M3/M4-1`
 *
 * КАНОНИЧЕСКОЕ ЗНАЧЕНИЕ — НЕТТО (без НДС).
 * В файле цены «с НДС» (×1,1), а выручка делится на 1,1 — множители
 * сокращаются, на фин. результат НДС 10 % не влияет. Но цена с НДС нужна
 * для дебиторки (строка 37 считает `N1*L1*F1*B1`, то есть по цене С НДС),
 * поэтому обе величины держим явно.
 */

import type { Currency, DestinationId, ProductId } from './types'

export const GOODS_VAT = 1.1

/** Пошлина: процент от контракта или рубли на тонну. Два механизма — как в файле. */
export type Duty =
  | { kind: 'none' }
  | { kind: 'percent'; percent: number }
  | { kind: 'perTon'; rubPerTon: number }

export interface NetbackInput {
  /** Цена контракта в валюте за тонну. */
  contract: number
  currency: Currency
  /** Курс валюты к рублю. */
  fx: number
  duty: Duty
  /** ЭКСПОРТНОЕ плечо, ₽/т. НДС 0 %, вычитается как есть. */
  logisticsRubPerTon: number
  /** Прогнозный дисконт C5. В рабочем расчёте строго 1. */
  forecastDiscount?: number
}

/**
 * Нетто-цена, ₽/т.
 * Порядок обязателен: пошлина и логистика вычитаются В РУБЛЯХ после конвертации.
 */
export function netback(i: NetbackInput): number {
  const c5 = i.forecastDiscount ?? 1
  const base = i.contract * c5 * i.fx
  const afterDuty =
    i.duty.kind === 'none'
      ? base
      : i.duty.kind === 'percent'
        ? base * (1 - i.duty.percent / 100)
        : base - i.duty.rubPerTon
  return afterDuty - i.logisticsRubPerTon
}

/** Цена «с НДС» — то, что лежит в ячейках B1…B6. Нужна для дебиторки. */
export const withVat = (net: number) => net * GOODS_VAT

// ─────────────────────────────────────────────────── Цепочка CZCE (только M4)

export interface CzceChain {
  /** Котировка фьючерса, CNY/т. */
  quote: number
  /** Пошлина КНР. */
  kChinaDuty: number
  /** НДС КНР. */
  kChinaVat: number
  /** Портовые расходы, CNY/т. */
  portCNY: number
}

export const CZCE_DEFAULTS = { kChinaDuty: 0.91, kChinaVat: 0.91, portCNY: 100 }

/** Котировка → цена контракта: ×пошлина ×НДС −порт. */
export function quoteToContract(c: CzceChain): number {
  return c.quote * c.kChinaDuty * c.kChinaVat - c.portCNY
}

/** Обратно: контракт → котировка. Проверка (8000+100)/0,91/0,91 = 9 781,43. */
export function contractToQuote(contract: number, c: Omit<CzceChain, 'quote'>): number {
  return (contract + c.portCNY) / c.kChinaVat / c.kChinaDuty
}

// ─────────────────────────────── Прогнозный дисконт C5 — воспроизведение файла

/**
 * `C5 = 1 − N4`, `N4 = M3/M4 − 1`, M3 = 1250, M4 = 1100.
 * Нужен ТОЛЬКО для эталона A. В рабочем расчёте C5 = 1.
 *
 * Арифметика в файле неточна: снижение 1250 → 1100 даёт 1100/1250 = 0,88,
 * а записанная формула даёт 0,863636. Не исправляем — воспроизводим.
 */
export function excelForecastDiscount(before = 1250, after = 1100): number {
  return 1 - (before / after - 1)
}

// ───────────────────────────────────── Ценовые наборы: «как в Excel» и рабочий

export type PriceSet = Partial<Record<ProductId, number>>

/**
 * Цены ровно по формулам файла. Регрессия эталонов A и B.
 * Возвращает НЕТТО (формула файла ÷ 1,1); для `12000*C5` — тоже ÷ 1,1,
 * потому что строка 22 делит B6 на 1,1 наравне с остальными.
 */
export function excelPrices(fx: number, c5: number): Record<string, number> {
  return {
    // «Ядро »!B1 и «Ядро+масло»!B1
    kernel: (6500 * fx * 0.935 * c5 - 10000) * 1.1 / GOODS_VAT,
    // «Ядро »!B2
    semi: (5700 * fx * 0.935 * c5 - 10500) * 1.1 / GOODS_VAT,
    // «Ядро »!B3
    cat3: (4900 * fx * 0.935 * c5 - 10000) * 1.1 / GOODS_VAT,
    // «Масло (через ядро)»!B5 и «Ядро+масло»!B5
    sunOil: (8550 * c5 * fx - 7000 - 12000) * 1.1 / GOODS_VAT,
    // «Масло (через ядро)»!B6 и «Ядро+масло»!B6 — рублёвая цена, не нетбэк
    sunMeal: (12000 * c5) / GOODS_VAT,
    // «Масло (рапс, Иран, Малайзия)»!B5 — базис Малайзия, единственный в файле
    rapeOilMY: (7300 * fx - 15000) * 1.1 / GOODS_VAT,
    // «Масло (рапс, Китай)»!B5
    rapeOilCN: (8000 * fx - 12000) * 1.1 / GOODS_VAT,
    // «Масло (рапс, …)»!B6 — одинаково в M1 и M4
    rapeMeal: (2300 * fx - 10500) * 1.1 / GOODS_VAT,
  }
}

/** Рабочая ценовая модель: единая формула нетбэка для всех девяти позиций. */
export interface WorkingPriceInputs {
  fxCny: number
  fxUsd: number
  /** Месячная ставка МСХ, ₽/т. */
  dutySunOil: number
  dutySunMeal: number
  /** Экспортная пошлина РФ на ядро, П/Ф и 3 кат, %. */
  kernelDutyPercent: number
  contracts: {
    kernel: number
    semi: number
    cat3: number
    sunOil: number
    sunMeal: number
    rapeOilMY: number
    rapeOilIR: number
    rapeOilCN: number
    rapeMeal: number
  }
  logistics: Record<string, number>
}

export function workingPrices(i: WorkingPriceInputs): Record<string, number> {
  const pct = { kind: 'percent' as const, percent: i.kernelDutyPercent }
  const none = { kind: 'none' as const }
  const cny = (contract: number, duty: Duty, log: number) =>
    netback({ contract, currency: 'CNY', fx: i.fxCny, duty, logisticsRubPerTon: log })
  return {
    kernel: cny(i.contracts.kernel, pct, i.logistics.kernel),
    semi: cny(i.contracts.semi, pct, i.logistics.semi),
    cat3: cny(i.contracts.cat3, pct, i.logistics.cat3),
    sunOil: cny(i.contracts.sunOil, { kind: 'perTon', rubPerTon: i.dutySunOil }, i.logistics.sunOil),
    sunMeal: cny(
      i.contracts.sunMeal,
      { kind: 'perTon', rubPerTon: i.dutySunMeal },
      i.logistics.sunMeal,
    ),
    rapeOilMY: cny(i.contracts.rapeOilMY, none, i.logistics.rapeOilMY),
    rapeOilIR: netback({
      contract: i.contracts.rapeOilIR,
      currency: 'USD',
      fx: i.fxUsd,
      duty: none,
      logisticsRubPerTon: i.logistics.rapeOilIR,
    }),
    rapeOilCN: cny(i.contracts.rapeOilCN, none, i.logistics.rapeOilCN),
    rapeMeal: cny(i.contracts.rapeMeal, none, i.logistics.rapeMeal),
  }
}

export const DESTINATION_OF: Partial<Record<string, DestinationId>> = {
  rapeOilMY: 'MY',
  rapeOilIR: 'IR',
  rapeOilCN: 'CN',
}
