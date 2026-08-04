/**
 * ВХОДНЫЕ ДАННЫЕ ПУЛЬТА — единственный источник истины.
 *
 * Всё, что можно менять, лежит здесь. Изменение любого поля пересчитывает
 * все пять моделей: результаты нигде не хранятся, они всегда производные.
 *
 * BASE воспроизводит рабочий эталон (C). Кнопка «Вернуть базовые значения»
 * возвращает ровно его — это проверяется тестом.
 */

import type { ModelId } from '../domain/types'

/** Значение с происхождением. */
export interface Sourced {
  value: number | null
  origin: 'auto' | 'manual' | 'file' | 'setting'
  /** Когда получено или введено, ISO. */
  at: string
  /** Месяц действия для месячных параметров: '2026-08'. */
  month?: string
}

export type ContractKey =
  | 'kernel' | 'semi' | 'cat3'
  | 'sunOil' | 'sunMeal'
  | 'rapeOilMY' | 'rapeOilIR' | 'rapeOilCN' | 'rapeMeal'

export type LogisticsKey = ContractKey

export interface ModelInputs {
  /** L1, т/сут. */
  intakeTonsPerDay: number
  /** D1, ₽/т с НДС. */
  purchaseWithVat: number
  /** H1, ₽/т с НДС. */
  processingWithVat: number
  /** Задаваемые выходы. F2 и F6 — производные, здесь их нет намеренно. */
  yieldKernel: number
  yieldCat3: number
  yieldHusk: number
  yieldOil: number
  /** Потери, доля. */
  lossShare: number
  /** H2 — ставка отгрузки полуфабриката. У M3 своя, у остальных 0. */
  shippingSemi: number
}

export interface Inputs {
  /** Месяц, за который должны быть актуальны месячные ставки. */
  currentMonth: string
  /** Месяц БДР, за который идёт расчёт. */
  calcMonth: string

  fxCny: Sourced
  fxUsd: Sourced

  dutySunOil: Sourced
  dutySunMeal: Sourced
  /** Экспортная пошлина РФ на ядро, П/Ф и 3 категорию, %. */
  dutyKernelPercent: Sourced

  /** Цены контрактов в валюте за тонну. */
  contracts: Record<ContractKey, Sourced>
  /** ЭКСПОРТНОЕ плечо, ₽/т. НДС 0 %, вычитается как есть. */
  logistics: Record<LogisticsKey, Sourced>

  /** Общие настройки расчёта. */
  serviceVatDivisor: number
  goodsVatDivisor: number
  taxRate: number
  moneyRate: number
  daysPerMonth: number
  /** ВНУТРЕННЕЕ плечо, ₽/т с НДС. */
  shipKernelAndCat3: number
  shipOil: number
  shipMeal: number
  /** Q3: экономия на топливе от лузги, ₽/т лузги. В выручку не входит. */
  huskFuelSaving: number

  /** Цепочка CZCE. Канон — цена контракта; котировка выводится из неё. */
  czce: { kChinaDuty: number; kChinaVat: number; portCNY: number; contractMonth: string }

  models: Record<ModelId, ModelInputs>
}

const now = '2026-08-03T14:20:00'

const s = (value: number, origin: Sourced['origin'], month?: string): Sourced => ({
  value,
  origin,
  at: now,
  month,
})

const MONTH = '2026-08'

/** БАЗА = рабочий эталон (C). Менять только вместе с эталоном. */
export const BASE: Inputs = {
  currentMonth: MONTH,
  calcMonth: '2026-10',

  fxCny: s(11.5, 'auto'),
  fxUsd: s(80, 'auto'),

  // 'setting', а не 'manual': это РЕКОНСТРУКЦИЯ эталона (C), а не то, что
  // кто-то ввёл сегодня. Пометка «вручную» блокировала бы автосбор навсегда —
  // он обязан не перебивать ручной ввод, а база ручным вводом не является.
  dutySunOil: s(7000, 'setting', MONTH),
  dutySunMeal: s(1015.91, 'setting', MONTH),
  dutyKernelPercent: s(6.5, 'manual'),

  contracts: {
    kernel: s(6500, 'manual'),
    semi: s(5700, 'manual'),
    cat3: s(4900, 'manual'),
    sunOil: s(8550, 'manual'),
    sunMeal: s(1950, 'manual'),
    rapeOilMY: s(7300, 'manual'),
    rapeOilIR: s(1050, 'manual'),
    rapeOilCN: s(8000, 'manual'),
    rapeMeal: s(2300, 'manual'),
  },
  logistics: {
    kernel: s(10000, 'manual', MONTH),
    semi: s(10500, 'manual', MONTH),
    cat3: s(10000, 'manual', MONTH),
    sunOil: s(12000, 'manual', MONTH),
    sunMeal: s(10500, 'manual', MONTH),
    rapeOilMY: s(15000, 'manual', MONTH),
    rapeOilIR: s(15000, 'manual', MONTH),
    rapeOilCN: s(12000, 'manual', MONTH),
    rapeMeal: s(10500, 'manual', MONTH),
  },

  serviceVatDivisor: 1.22,
  goodsVatDivisor: 1.1,
  taxRate: 0.25,
  moneyRate: 0.155,
  daysPerMonth: 27,
  shipKernelAndCat3: 1500,
  shipOil: 3300,
  shipMeal: 1100,
  huskFuelSaving: 0,

  czce: { kChinaDuty: 0.91, kChinaVat: 0.91, portCNY: 100, contractMonth: 'OIU-2026' },

  models: {
    M1: { intakeTonsPerDay: 90, purchaseWithVat: 30000, processingWithVat: 5000,
          yieldKernel: 0, yieldCat3: 0, yieldHusk: 0, yieldOil: 0.36, lossShare: 0.01, shippingSemi: 0 },
    M2: { intakeTonsPerDay: 105, purchaseWithVat: 27000, processingWithVat: 5000,
          yieldKernel: 0, yieldCat3: 0, yieldHusk: 0.13, yieldOil: 0.49, lossShare: 0.01, shippingSemi: 0 },
    M3: { intakeTonsPerDay: 140, purchaseWithVat: 27000, processingWithVat: 5000,
          yieldKernel: 0.4, yieldCat3: 0.03, yieldHusk: 0.3, yieldOil: 0, lossShare: 0, shippingSemi: 1500 },
    M4: { intakeTonsPerDay: 90, purchaseWithVat: 30000, processingWithVat: 5000,
          yieldKernel: 0, yieldCat3: 0, yieldHusk: 0, yieldOil: 0.36, lossShare: 0.01, shippingSemi: 0 },
    M5: { intakeTonsPerDay: 140, purchaseWithVat: 27000, processingWithVat: 5000,
          yieldKernel: 0.2, yieldCat3: 0, yieldHusk: 0.13, yieldOil: 0.49, lossShare: 0.01, shippingSemi: 0 },
  },
}

// ─────────────────────────────────────────────── Хранение

const KEY = 'bdr-pult:inputs:v1'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Глубокое слияние сохранённого поверх базы: новые поля получают значения базы. */
function merge(base: unknown, saved: unknown): unknown {
  if (saved === null || saved === undefined) return base
  if (typeof base !== 'object' || base === null) return saved
  if (Array.isArray(base)) return saved
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    if (k in out) out[k] = merge(out[k], v)
  }
  return out
}

export function loadInputs(): Inputs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return clone(BASE)
    return merge(clone(BASE), JSON.parse(raw)) as Inputs
  } catch {
    return clone(BASE)
  }
}

export function saveInputs(i: Inputs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(i))
  } catch {
    // приватный режим браузера — живём без сохранения
  }
}

export function clearInputs(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* пусто */
  }
}

/**
 * Когда набор параметров меняли в последний раз. Хранится отдельно от `Inputs`:
 * это отметка о работе с пультом, а не цифра расчёта, и в отличия от базы
 * она попадать не должна.
 */
const KEY_AT = 'bdr-pult:inputs-at:v1'

export function loadTouchedAt(): string | null {
  try {
    return localStorage.getItem(KEY_AT)
  } catch {
    return null
  }
}

export function saveTouchedAt(at: string | null): void {
  try {
    if (at === null) localStorage.removeItem(KEY_AT)
    else localStorage.setItem(KEY_AT, at)
  } catch {
    /* приватный режим браузера — живём без отметки */
  }
}

export const baseInputs = () => clone(BASE)

// ─────────────────────────────────────────────── База и рынок — разные вещи

/**
 * РЫНОЧНЫЕ ДАННЫЕ МЕСЯЦА — не параметры модели.
 *
 * Курсы и ставки пошлин приходят извне и описывают месяц, а не устройство
 * завода. Значения этих полей в `BASE` — часть РЕКОНСТРУКЦИИ эталона (C),
 * а не сегодняшний рынок: там пошлина на масло 7 000 ₽/т, тогда как факт
 * августа 2026 — 7 748 ₽/т по девяти независимым источникам.
 *
 * Отсюда два следствия, оба намеренные:
 *   1. «Вернуть базовые значения» эти поля НЕ трогает — иначе сброс молча
 *      вернул бы пульт к вымышленным ставкам;
 *   2. отличием от базы они не считаются — это не правка человека,
 *      а состояние рынка. Их происхождение показывается отдельно.
 *
 * `BASE` при этом неприкосновенна: она обязана воспроизводить эталон (C)
 * вечно, иначе сверка теряет смысл.
 */
export const MARKET_PATHS = ['fxCny', 'fxUsd', 'dutySunOil', 'dutySunMeal'] as const

const isMarketPath = (path: string) =>
  (MARKET_PATHS as readonly string[]).some((m) => path === m || path.startsWith(`${m}.`))

/** Путь к изменённому полю в человекочитаемом виде. Рыночные данные не в счёт. */
export function changedPaths(i: Inputs): string[] {
  const out: string[] = []
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      if (a !== b) out.push(path)
      return
    }
    for (const k of Object.keys(a as Record<string, unknown>)) {
      // `at` — служебная отметка времени, отличием не считается
      if (k === 'at') continue
      const next = path ? `${path}.${k}` : k
      if (isMarketPath(next)) continue
      walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], next)
    }
  }
  walk(BASE, i, '')
  return out
}

export const isChanged = (i: Inputs) => changedPaths(i).length > 0

/** Изменено ли конкретное поле. `path` вида 'fxCny.value' или 'models.M3.yieldKernel'. */
export function isFieldChanged(i: Inputs, path: string): boolean {
  if (isMarketPath(path)) return false
  const get = (o: unknown, p: string) =>
    p.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o)
  return get(BASE, path) !== get(i, path)
}

/**
 * Сброс к базе с сохранением рыночных данных месяца.
 * Параметры модели возвращаются к эталону (C), курсы и ставки остаются.
 */
export function resetToBaseKeepingMarket(current: Inputs): Inputs {
  const next = clone(BASE)
  for (const p of MARKET_PATHS) {
    next[p] = clone(current[p])
  }
  return next
}
