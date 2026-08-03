/**
 * БЛОК 1. Выходы продукции и баланс массы.
 *
 * Перенос из БДР. Соответствие ячейкам (одинаково на всех пяти листах):
 *   F1 выход ЯДРО          — константа
 *   F3 выход 3 КАТЕГОРИЯ   — константа
 *   F4 выход ЛУЗГА         — константа
 *   F5 выход МАСЛО         — константа
 *   F2 выход ПОЛУФАБРИКАТ  — ФОРМУЛА `=1-F1-F3-F4`   (M2, M3, M5)
 *                            константа 0             (M1, M4)
 *   F6 выход ЖМЫХ          — ФОРМУЛА `=0,99-F5`      (M1, M2, M4, M5)
 *                            константа 0             (M3)
 *
 * `0,99−F5` обобщено до `(1 − потери) − F5`: при потерях 1 % даёт значения
 * файла, при 0 % даёт M3. Отдельного параметра потерь в БДР нет — он вынесен
 * по решению владельца (Q9), значения по умолчанию воспроизводят файл.
 */

import type { MassId, ProductId } from './types'

export interface YieldInput {
  /** F1, задаётся. */
  kernel: number
  /** F3, задаётся. */
  cat3: number
  /** F4, задаётся. */
  husk: number
  /** F5, задаётся. */
  oil: number
  /** Потери, доля. В файле зашиты в F6 как 1 %; у M3 — 0 %. */
  lossShare: number
  /** M1 и M4: F2 и F6 заданы константами, производных формул нет. */
  semiIsDerived: boolean
  /** M3: масло и жмых не производятся вовсе, строки 14–15 нулевые. */
  producesOilLine: boolean
}

export interface YieldSet {
  kernel: number
  semi: number
  cat3: number
  husk: number
  oil: number
  meal: number
}

/** F2 = 1 − F1 − F3 − F4 · F6 = (1 − потери) − F5 */
export function deriveYields(y: YieldInput): YieldSet {
  const semi = y.semiIsDerived ? 1 - y.kernel - y.cat3 - y.husk : 0
  const meal = y.producesOilLine ? 1 - y.lossShare - y.oil : 0
  return { kernel: y.kernel, semi, cat3: y.cat3, husk: y.husk, oil: y.oil, meal }
}

export interface MassSegmentCalc {
  id: MassId
  share: number
  tons: number
  monetized: boolean
  note?: string
}

export interface MassBalance {
  /** Первый передел: доли от тонны сырья, сумма ровно 1. */
  stage1: MassSegmentCalc[]
  /** Второй передел (M2, M5): доли от тонны полуфабриката, сумма ровно 1. */
  stage2?: { from: ProductId; segments: MassSegmentCalc[] }
}

/**
 * Физический баланс массы — основа «Раскладки тонны».
 *
 * Считается ВСЕГДА из выходов, независимо от того, есть ли в файле формула
 * в строке 13. У M3 строка 13 пустая, но 1 134,0 т/мес лузги физически
 * существуют — лента их показывает с подписью «не монетизируется».
 */
export function massBalance(
  y: YieldSet,
  rawTons: number,
  opts: { oilFromSemi: boolean; lossShare: number; huskMonetized: boolean },
): MassBalance {
  const seg = (id: MassId, share: number, tons: number, monetized: boolean, note?: string) =>
    ({ id, share, tons, monetized, note }) as MassSegmentCalc

  if (opts.oilFromSemi) {
    // M2, M5: сырьё → ядро + П/Ф + лузга, затем П/Ф → масло + жмых + потери.
    const stage1: MassSegmentCalc[] = []
    if (y.kernel > 0) stage1.push(seg('kernel', y.kernel, rawTons * y.kernel, true))
    stage1.push(seg('semi', y.semi, rawTons * y.semi, false, 'идёт в пресс'))
    if (y.cat3 > 0) stage1.push(seg('cat3', y.cat3, rawTons * y.cat3, true))
    if (y.husk > 0)
      stage1.push(
        seg('husk', y.husk, rawTons * y.husk, opts.huskMonetized, 'не монетизируется'),
      )

    const semiTons = rawTons * y.semi
    const stage2: MassSegmentCalc[] = [
      seg('oil', y.oil, semiTons * y.oil, true),
      seg('meal', y.meal, semiTons * y.meal, true),
    ]
    if (opts.lossShare > 0)
      stage2.push(seg('loss', opts.lossShare, semiTons * opts.lossShare, false, 'потери'))

    return { stage1, stage2: { from: 'semi', segments: stage2 } }
  }

  // M1, M3, M4: один передел.
  const stage1: MassSegmentCalc[] = []
  if (y.kernel > 0) stage1.push(seg('kernel', y.kernel, rawTons * y.kernel, true))
  if (y.semi > 0) stage1.push(seg('semi', y.semi, rawTons * y.semi, true))
  if (y.cat3 > 0) stage1.push(seg('cat3', y.cat3, rawTons * y.cat3, true))
  if (y.husk > 0)
    stage1.push(seg('husk', y.husk, rawTons * y.husk, opts.huskMonetized, 'не монетизируется'))
  if (y.oil > 0) stage1.push(seg('oil', y.oil, rawTons * y.oil, true))
  if (y.meal > 0) stage1.push(seg('meal', y.meal, rawTons * y.meal, true))
  if (opts.lossShare > 0 && y.oil > 0)
    stage1.push(seg('loss', opts.lossShare, rawTons * opts.lossShare, false, 'потери'))

  return { stage1 }
}
