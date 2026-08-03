/**
 * БЛОК 9б. Блокировки — ПО ГРАФУ ЗАВИСИМОСТЕЙ, не по списку моделей.
 *
 * Модель блокируется тогда и только тогда, когда не задан или устарел
 * параметр, который ФАКТИЧЕСКИ входит в её расчёт.
 *
 * Из этого следует, а не назначается вручную:
 *   ставки МСХ (подсолн. масло, подсолн. жмых)  → M2, M5
 *   экспортная пошлина 6,5 % (ядро, П/Ф, 3 кат) → M3, M5
 *   курс USD                                     → M1 (иранский базис)
 *   курс CNY                                     → все
 *   котировка CZCE                               → M4
 * M5 потребляет обе группы пошлин → блокируется по любой из них.
 * M3 по ставкам МСХ НЕ блокируется: подсолнечник у неё сырьё на входе,
 * а ставка МСХ применяется к продукту на выходе.
 */

import type { ModelId, ProductId } from './types'

/** Устаревающий параметр расчёта. */
export type ParamId =
  | 'fxCny'
  | 'fxUsd'
  | 'dutySunOil'
  | 'dutySunMeal'
  | 'dutyKernelPercent'
  | 'czceQuote'
  | `logistics:${string}`

export interface ParamState {
  id: ParamId
  label: string
  value: number | null
  /** Месяц действия для месячных параметров: '2026-08'. */
  effectiveMonth?: string
  /** Месячный параметр устаревает при смене месяца. */
  monthly: boolean
}

export interface Blocker {
  paramId: ParamId
  label: string
  reason: 'not-set' | 'stale-month'
  message: string
}

/** Какие продукты продаёт модель — отсюда и растёт граф. */
const SELLS: Record<ModelId, ProductId[]> = {
  M1: ['oil', 'meal'],
  M2: ['oil', 'meal'],
  M3: ['kernel', 'semi', 'cat3'],
  M4: ['oil', 'meal'],
  M5: ['kernel', 'oil', 'meal'],
}

/** Сырьё определяет, какая пошлина применяется к маслу и жмыху. */
const RAW: Record<ModelId, 'rapeseed' | 'sunflower'> = {
  M1: 'rapeseed',
  M2: 'sunflower',
  M3: 'sunflower',
  M4: 'rapeseed',
  M5: 'sunflower',
}

/** Параметры, которые реально входят в расчёт модели. */
export function requiredParams(id: ModelId, opts: { iranBasisEnabled: boolean }): ParamId[] {
  const need = new Set<ParamId>(['fxCny'])
  const sells = SELLS[id]
  const sunflower = RAW[id] === 'sunflower'

  for (const p of sells) {
    if (p === 'oil' || p === 'meal') {
      if (sunflower) {
        // месячная ставка МСХ в рублях на тонну
        need.add(p === 'oil' ? 'dutySunOil' : 'dutySunMeal')
      }
      // рапс: пошлины нет
    }
    if (p === 'kernel' || p === 'semi' || p === 'cat3') {
      // экспортная пошлина РФ 6,5 % множителем
      need.add('dutyKernelPercent')
    }
    need.add(`logistics:${p}` as ParamId)
  }

  if (id === 'M4') need.add('czceQuote')
  if (id === 'M1' && opts.iranBasisEnabled) need.add('fxUsd')

  return [...need]
}

export function validateModel(
  id: ModelId,
  params: Record<string, ParamState>,
  currentMonth: string,
  opts: { iranBasisEnabled: boolean } = { iranBasisEnabled: true },
): Blocker[] {
  const out: Blocker[] = []
  for (const pid of requiredParams(id, opts)) {
    const st = params[pid]
    if (!st) continue
    if (st.value === null) {
      out.push({
        paramId: pid,
        label: st.label,
        reason: 'not-set',
        message: `Не задан параметр «${st.label}»`,
      })
      continue
    }
    if (st.monthly && st.effectiveMonth !== currentMonth) {
      out.push({
        paramId: pid,
        label: st.label,
        reason: 'stale-month',
        message: `«${st.label}» задан за другой месяц. Прошлым месяцем не считаю и старым значением не подменяю`,
      })
    }
  }
  return out
}
