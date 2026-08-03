/**
 * Типы предметной области. Без React, без сети, без браузерных API.
 * Формулы здесь НЕ живут — их перенос это ЭТАП 4.
 */

export type ModelId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5'

export type ProductId = 'kernel' | 'semi' | 'cat3' | 'husk' | 'oil' | 'meal'

/** Псевдопродукт: потери. В ленте показываются, в выручке отсутствуют. */
export type MassId = ProductId | 'loss'

export type RawId = 'rapeseed' | 'sunflower'

export type DestinationId = 'CN' | 'IR' | 'MY'

export type Currency = 'RUB' | 'CNY' | 'USD'

/** Откуда взялось значение. Отвечает за значки 🔄 ✋ 📄 ⚙️. */
export type Origin = 'auto' | 'manual' | 'file' | 'setting'

export interface Sourced<T> {
  value: T | null
  origin: Origin
  /** Что показать под значком: «MOEX 03.08 14:18» или «введено 01.08.2026». */
  note?: string
  /** Месяц действия для месячных параметров: '2026-08'. */
  effectiveMonth?: string
}

export const PRODUCT_LABEL: Record<MassId, string> = {
  kernel: 'ядро',
  semi: 'П/Ф',
  cat3: '3 кат',
  husk: 'лузга',
  oil: 'масло',
  meal: 'жмых',
  loss: 'потери',
}

export const PRODUCT_LABEL_FULL: Record<MassId, string> = {
  kernel: 'ядро',
  semi: 'полуфабрикат',
  cat3: '3 категория',
  husk: 'лузга',
  oil: 'масло',
  meal: 'жмых',
  loss: 'потери',
}

export const RAW_LABEL: Record<RawId, string> = {
  rapeseed: 'рапс',
  sunflower: 'подсолнечник',
}

export const DESTINATION_LABEL: Record<DestinationId, string> = {
  CN: 'Китай',
  IR: 'Иран',
  MY: 'Малайзия',
}

/** Один сегмент «Раскладки тонны». */
export interface MassSegment {
  id: MassId
  /** Доля от тонны сырья на своём ярусе. */
  share: number
  /** Тонн в месяц. */
  tons: number
  /** Продаётся ли. false → выручки нет, сегмент приглушён. */
  monetized: boolean
  /** Почему не продаётся — для подписи. */
  note?: string
}

/** Второй ярус: только там, где полуфабрикат идёт в пресс (М2, М5). */
export interface PressStage {
  from: ProductId
  segments: MassSegment[]
}

export interface Ribbon {
  stage1: MassSegment[]
  stage2?: PressStage
}

/** Строка цены: как собран нетбэк. */
export interface PriceRow {
  productId: ProductId
  contract: number
  currency: Currency
  destination: DestinationId
  fx: number
  /** Тип пошлины: процент от контракта или рубли на тонну. */
  duty: { kind: 'none' } | { kind: 'percent'; percent: number } | { kind: 'perTon'; rubPerTon: number }
  logistics: number
  /** Итог: контракт × курс − пошлина − логистика. */
  net: number
  origins: { contract: Origin; fx: Origin; duty: Origin; logistics: Origin }
}

/** Выбор базиса в М1. */
export interface BasisDecision {
  winner: DestinationId
  loser: DestinationId
  netWinner: number
  netLoser: number
  gapRubPerTon: number
  gapNetResult: number
  /** Кросс USD/CNY, при котором базисы равны. */
  crossoverUsdPerCny: number
  /** Порог по доллару при текущем юане. */
  thresholdUsdRub: number
  currentUsdRub: number
  /** Сколько рублей до переключения. */
  distanceRub: number
  fx: { cny: number; usd: number }
  /** Победитель сменился с прошлого расчёта. */
  switched?: { from: DestinationId; at: string; prevUsdRub: number }
}

export interface CapitalBlock {
  stock: number
  payables: number
  receivables: number
  total: number
  interestMonthly: number
}

export interface Warning {
  kind: 'discrepancy' | 'unmonetized' | 'beyond-bdr' | 'simplification'
  text: string
  ref?: string
}

/** Результат расчёта одной модели за месяц. Все деньги — тыс.₽. */
export interface ModelResult {
  id: ModelId
  name: string
  sheet: string
  raw: RawId
  intakeTonsPerDay: number
  daysPerMonth: number
  /** L1 × N1. База всех удельных показателей. Никогда не строка 9. */
  rawTons: number

  ribbon: Ribbon
  tons: Partial<Record<MassId, number>>
  /** Строка 9 «как в файле». Показывать только с пометкой. */
  soldTonsAsInFile: number

  revenue: Partial<Record<ProductId, number>>
  revenueTotal: number
  cost: number
  shipping: Partial<Record<ProductId, number>>
  shippingTotal: number
  capital: CapitalBlock
  tax: number
  netResult: number
  margin: number
  /** Строго на тонну сырья. */
  netPerRawTon: number

  prices: PriceRow[]
  basis?: BasisDecision
  warnings: Warning[]
}

/** Строка раскрытия формулы: показатель → формула → лист!ячейка. */
export interface FormulaTrace {
  label: string
  formula: string
  substituted: string
  result: number
  excelRow: number
  excelCell: string
  /** Отличие от файла, включённое флагом. */
  deviation?: string
  children?: FormulaTrace[]
}
