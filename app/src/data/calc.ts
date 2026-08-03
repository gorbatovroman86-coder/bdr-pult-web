/**
 * БЛОК 10. Сборка: входные данные → расчётное ядро → то, что показывает пульт.
 *
 * Литералов эталона (C) здесь больше нет — всё считается движком.
 * Единственные литералы это входные параметры: контрактные цены, ставки,
 * логистика и курсы, то есть исходные данные, а не результаты.
 */

import { calcMonth, SETTINGS_WORKING, type EngineResult, type NetPrices } from '../domain/engine'
import { chooseBasis, type BasisCandidate, type BasisChoice } from '../domain/basis'
import { CZCE_DEFAULTS, contractToQuote, netback, quoteToContract, type Duty } from '../domain/pricing'
import { validateModel, type Blocker, type ParamState } from '../domain/validation'
import { engineBlockers, negativePriceWarnings } from '../domain/guards'
import type { ModelId, ProductId, Warning } from '../domain/types'
import { MODEL_META, type ModelMeta } from './models'

export const CALC_DATE = '2026-08-03T14:20:00'
export const CALC_MONTH = '2026-10' // первый месяц БДР, окт.2026
export const CURRENT_MONTH = '2026-08' // месяц, за который должны быть ставки

// ───────────────────────────────────────────────────────── Входные данные

export const INPUT = {
  fx: {
    cny: { value: 11.5, note: 'MOEX 03.08 14:18' },
    usd: { value: 80.0, note: 'MOEX 03.08 14:18' },
  },
  duties: {
    sunOil: { value: 7000, month: CURRENT_MONTH, note: 'введено 01.08.2026' },
    sunMeal: { value: 1015.91, month: CURRENT_MONTH, note: 'введено 01.08.2026' },
    kernelPercent: { value: 6.5, note: 'актуальна с 01.01.2026' },
  },
  /**
   * КАНОНИЧЕСКИЙ вход по M4 — цена контракта 8 000 CNY/т: именно её фиксирует
   * эталон (C). Котировка ВЫВОДИТСЯ из неё обратной цепочкой и служит проверкой
   * «попадает ли в реальный диапазон CZCE».
   *
   * Если ввести живую котировку, контракт будет считаться из неё — и результат
   * законно разойдётся с эталоном, потому что изменился вход. Округлённая
   * котировка 9 781,43 даёт контракт 8 000,0022 и сдвигает фин. результат M4
   * на +0,017 тыс.₽ — поэтому канон именно контракт, а не котировка.
   */
  czce: { ...CZCE_DEFAULTS, contractMonth: 'OIU-2026', note: 'выведена из контракта 8 000 CNY/т' },
  contracts: {
    rapeOilCN: 8000,
    kernel: 6500,
    semi: 5700,
    cat3: 4900,
    sunOil: 8550,
    sunMeal: 1950,
    rapeOilMY: 7300,
    rapeOilIR: 1050,
    rapeMeal: 2300,
  },
  /** ЭКСПОРТНОЕ плечо, ₽/т. НДС 0 %, вычитается как есть. */
  logistics: {
    kernel: 10000,
    semi: 10500,
    cat3: 10000,
    sunOil: 12000,
    sunMeal: 10500,
    rapeOilMY: 15000,
    rapeOilIR: 15000,
    rapeOilCN: 12000,
    rapeMeal: 10500,
  },
  /** Q3: лузга сжигается на своём котле. Это экономия, не выручка. */
  huskFuelSavingRubPerTon: 0,
}

/**
 * Управленческий ФОТ вынесен в параметр — см. `payroll.ts`.
 * Значений в репозитории нет: он публичный, а ФОТ это внутренние данные.
 * На расчёт не влияет (в фин. результат не входит, налог считается до него).
 */

/** Блок U:W — фактические замеры (Q7). Справочная сверка, не параметр. */
export const MEASURED = {
  kernelShare: 0.5703795,
  semiShare: 0.0371295,
  cat3Share: 0.0731392,
  sumShare: 0.6806482,
  planShare: 0.7,
}

// ─────────────────────────────────────────────────────────────── Цены

const NONE: Duty = { kind: 'none' }
const pctDuty: Duty = { kind: 'percent', percent: INPUT.duties.kernelPercent.value }

const cny = (contract: number, duty: Duty, log: number) =>
  netback({ contract, currency: 'CNY', fx: INPUT.fx.cny.value, duty, logisticsRubPerTon: log })

/** Контракт M4 — канон; котировка выводится обратной цепочкой. */
export const CZCE_CONTRACT = INPUT.contracts.rapeOilCN
export const CZCE_QUOTE = contractToQuote(CZCE_CONTRACT, INPUT.czce)
/** Прямая проверка: выведенная котировка возвращает исходный контракт. */
export const CZCE_ROUNDTRIP = quoteToContract({ quote: CZCE_QUOTE, ...INPUT.czce })

export const NET = {
  kernel: cny(INPUT.contracts.kernel, pctDuty, INPUT.logistics.kernel),
  semi: cny(INPUT.contracts.semi, pctDuty, INPUT.logistics.semi),
  cat3: cny(INPUT.contracts.cat3, pctDuty, INPUT.logistics.cat3),
  sunOil: cny(
    INPUT.contracts.sunOil,
    { kind: 'perTon', rubPerTon: INPUT.duties.sunOil.value },
    INPUT.logistics.sunOil,
  ),
  sunMeal: cny(
    INPUT.contracts.sunMeal,
    { kind: 'perTon', rubPerTon: INPUT.duties.sunMeal.value },
    INPUT.logistics.sunMeal,
  ),
  rapeMeal: cny(INPUT.contracts.rapeMeal, NONE, INPUT.logistics.rapeMeal),
  rapeOilCN: cny(CZCE_CONTRACT, NONE, INPUT.logistics.rapeOilCN),
  rapeOilMY: cny(INPUT.contracts.rapeOilMY, NONE, INPUT.logistics.rapeOilMY),
  rapeOilIR: netback({
    contract: INPUT.contracts.rapeOilIR,
    currency: 'USD',
    fx: INPUT.fx.usd.value,
    duty: NONE,
    logisticsRubPerTon: INPUT.logistics.rapeOilIR,
  }),
}

// ───────────────────────────────────────────────────────── Базис M1

const candIR: BasisCandidate = {
  destination: 'IR',
  contract: INPUT.contracts.rapeOilIR,
  currency: 'USD',
  fx: INPUT.fx.usd.value,
  logisticsRubPerTon: INPUT.logistics.rapeOilIR,
  net: NET.rapeOilIR,
}
const candMY: BasisCandidate = {
  destination: 'MY',
  contract: INPUT.contracts.rapeOilMY,
  currency: 'CNY',
  fx: INPUT.fx.cny.value,
  logisticsRubPerTon: INPUT.logistics.rapeOilMY,
  net: NET.rapeOilMY,
}
export const BASIS: BasisChoice = chooseBasis(candIR, candMY)

// ─────────────────────────────────────────────────── Цены по моделям

const PRICES: Record<ModelId, NetPrices> = {
  M1: { oil: BASIS.winner.net, meal: NET.rapeMeal },
  M2: { oil: NET.sunOil, meal: NET.sunMeal },
  M3: { kernel: NET.kernel, semi: NET.semi, cat3: NET.cat3 },
  M4: { oil: NET.rapeOilCN, meal: NET.rapeMeal },
  M5: { kernel: NET.kernel, oil: NET.sunOil, meal: NET.sunMeal },
}

// ─────────────────────────────────────────────── Состояние параметров

const monthly = (label: string, value: number | null, month: string): ParamState =>
  ({ id: label as never, label, value, monthly: true, effectiveMonth: month })

export const PARAM_STATE: Record<string, ParamState> = {
  fxCny: { id: 'fxCny', label: 'курс CNY/RUB', value: INPUT.fx.cny.value, monthly: false },
  fxUsd: { id: 'fxUsd', label: 'курс USD/RUB', value: INPUT.fx.usd.value, monthly: false },
  dutySunOil: {
    ...monthly('пошлина на подсолнечное масло', INPUT.duties.sunOil.value, INPUT.duties.sunOil.month),
    id: 'dutySunOil',
  },
  dutySunMeal: {
    ...monthly('пошлина на подсолнечный жмых', INPUT.duties.sunMeal.value, INPUT.duties.sunMeal.month),
    id: 'dutySunMeal',
  },
  dutyKernelPercent: {
    id: 'dutyKernelPercent',
    label: 'экспортная пошлина на ядро, П/Ф и 3 кат',
    value: INPUT.duties.kernelPercent.value,
    monthly: false,
  },
  czceQuote: { id: 'czceQuote', label: 'котировка CZCE', value: CZCE_QUOTE, monthly: false },
  'logistics:kernel': { ...monthly('логистика ядра', INPUT.logistics.kernel, CURRENT_MONTH), id: 'logistics:kernel' },
  'logistics:semi': { ...monthly('логистика П/Ф', INPUT.logistics.semi, CURRENT_MONTH), id: 'logistics:semi' },
  'logistics:cat3': { ...monthly('логистика 3 категории', INPUT.logistics.cat3, CURRENT_MONTH), id: 'logistics:cat3' },
  'logistics:oil': { ...monthly('логистика масла', INPUT.logistics.sunOil, CURRENT_MONTH), id: 'logistics:oil' },
  'logistics:meal': { ...monthly('логистика жмыха', INPUT.logistics.rapeMeal, CURRENT_MONTH), id: 'logistics:meal' },
}

// ──────────────────────────────────────────────────────── Результаты

export interface ComputedModel {
  meta: ModelMeta
  result: EngineResult
  prices: NetPrices
  blockers: Blocker[]
  warnings: Warning[]
  basis?: BasisChoice
}

function warningsFor(id: ModelId, r: EngineResult): Warning[] {
  const w: Warning[] = []
  const huskTons = r.tons.husk ?? 0

  if (r.soldTonsAsInFile > r.rawTons) {
    const semi = r.tons.semi ?? 0
    w.push({
      kind: 'discrepancy',
      text: `П/Ф ${semi.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} т/мес учтён в «Продажа, т», но не продаётся и цены не имеет`,
      ref: 'D1',
    })
  }
  if (huskTons > 0 && r.revenue.husk === 0) {
    w.push({
      kind: 'unmonetized',
      text: `Лузга ${huskTons.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} т/мес не монетизируется: сжигается на своём котле, экономия на топливе не задана`,
      ref: 'Q3',
    })
  }
  if (id === 'M3') {
    w.push({
      kind: 'simplification',
      text: 'Не прессует, но платит те же 5 000 ₽/т переработки, что и двухпередельные режимы',
      ref: 'Q5',
    })
  }
  if (id === 'M1' || id === 'M4') {
    w.push({
      kind: 'discrepancy',
      text: 'Столбец L (авг.2027) заполнен только в строках тонн: годовой ИТОГО не сходится сам с собой',
      ref: 'D3 · Q10',
    })
    w.push({
      kind: 'discrepancy',
      text: 'ДЗ = 0, потому что считается только по ядру. Капитал и процент занижены',
      ref: 'D4',
    })
  }
  if (id === 'M1') {
    w.push({
      kind: 'beyond-bdr',
      text: 'Иранский базис и выбор лучшего из двух — сверх БДР, в файле формула цены одна',
      ref: '➕',
    })
  }
  return w
}

export const COMPUTED: ComputedModel[] = MODEL_META.map((meta) => {
  const prices = PRICES[meta.id]
  const result = calcMonth(meta.params, prices, SETTINGS_WORKING, {
    huskFuelSavingRubPerTon: INPUT.huskFuelSavingRubPerTon,
  })
  return {
    meta,
    result,
    prices,
    // Блокировки двух родов: незаданные/устаревшие параметры (граф зависимостей)
    // и невозможный расчёт (сторожа ЭТАПА 5, сценарий 7).
    blockers: [
      ...validateModel(meta.id, PARAM_STATE, CURRENT_MONTH, { iranBasisEnabled: true }),
      ...engineBlockers(meta.params, prices).map((i) => ({
        paramId: i.code as never,
        label: i.code,
        reason: 'not-set' as const,
        message: i.message,
      })),
    ],
    warnings: [
      ...warningsFor(meta.id, result),
      ...negativePriceWarnings(prices).map((text) => ({ kind: 'discrepancy' as const, text, ref: '⚠' })),
    ],
    basis: meta.id === 'M1' ? BASIS : undefined,
  }
}).sort((a, b) => b.result.netResult - a.result.netResult)

export const byModelId = (id: string) => COMPUTED.find((c) => c.meta.id === id)

/** Показывается на экране сравнения постоянно, не сворачивается. */
export const ASSUMPTIONS = [
  {
    kind: 'simplification' as const,
    text:
      'Переработка 5 000 ₽/т одинакова независимо от числа переделов. М3 не прессует, ' +
      'но платит столько же.',
    ref: 'Q5',
  },
  {
    kind: 'simplification' as const,
    text: 'Потери 1 % есть у всех, кроме М3 — балансы выходов разные.',
    ref: 'Q9',
  },
  {
    kind: 'simplification' as const,
    text:
      'Лузга топит котёл в М2, М3 и М5, экономия не посчитана; М1 и М4 топят покупным ' +
      'при той же ставке переработки.',
    ref: 'Q3',
  },
]

export const PRODUCT_DESTINATION: Partial<Record<ProductId, string>> = {
  kernel: 'Китай',
  semi: 'Китай',
  cat3: 'Китай',
  oil: 'Китай',
  meal: 'Китай',
}
