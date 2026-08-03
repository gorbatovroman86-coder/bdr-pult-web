/**
 * БЛОК 3. Выбор лучшего базиса в M1.
 *
 * СВЕРХ БДР. В файле у листа «Масло (рапс, Иран, Малайзия)» формула цены
 * ОДНА — `B5 = (7300*C3-15000)*1,1`, то есть только Малайзия, в юанях.
 * Иранского контракта, курса USD/RUB и второй ставки логистики в книге нет.
 *
 * Сравнивается только МАСЛО. Жмых всегда идёт в Китай в юанях
 * (`B6 = (2300*C3-10500)*1,1`) и от базиса масла не зависит: в M1 и M4 он
 * идентичен.
 */

import type { DestinationId } from './types'

export interface BasisCandidate {
  destination: DestinationId
  contract: number
  currency: 'CNY' | 'USD'
  fx: number
  logisticsRubPerTon: number
  /** Нетто, ₽/т: контракт × курс − логистика. Пошлины на рапс нет. */
  net: number
}

export interface BasisChoice {
  winner: BasisCandidate
  loser: BasisCandidate
  gapRubPerTon: number
  /** Кросс USD/CNY, при котором базисы равны. */
  crossoverUsdPerCny: number
  /** Текущий кросс USD/CNY. */
  currentUsdPerCny: number
  /** Порог по доллару при текущем юане, ₽/долл. */
  thresholdUsdRub: number
  currentUsdRub: number
  /** Сколько рублей до переключения. Знак показывает сторону. */
  distanceRub: number
  /** Логистики по базисам равны — порог упрощается до отношения контрактов. */
  logisticsEqual: boolean
}

/**
 * Порог выводится ФОРМУЛОЙ, не зашивается константой.
 *
 * Общий случай:  1050 × USD − лог_IR  >  7300 × CNY − лог_MY
 * При равных логистиках они сокращаются:
 *     USD/CNY > 7300 / 1050 = 6,9524
 *     при CNY = 11,5 порог по доллару = 79,95 ₽/долл
 */
export function chooseBasis(a: BasisCandidate, b: BasisCandidate): BasisChoice {
  const [winner, loser] = a.net >= b.net ? [a, b] : [b, a]

  const usd = a.currency === 'USD' ? a : b
  const cny = a.currency === 'CNY' ? a : b
  const logisticsEqual = Math.abs(usd.logisticsRubPerTon - cny.logisticsRubPerTon) < 1e-9

  // Кросс, при котором нетбэки равны:
  //   contractUsd × USD − логUsd = contractCny × CNY − логCny
  //   USD = (contractCny × CNY − логCny + логUsd) / contractUsd
  const thresholdUsdRub =
    (cny.contract * cny.fx - cny.logisticsRubPerTon + usd.logisticsRubPerTon) / usd.contract

  return {
    winner,
    loser,
    gapRubPerTon: winner.net - loser.net,
    crossoverUsdPerCny: cny.contract / usd.contract,
    currentUsdPerCny: usd.fx / cny.fx,
    thresholdUsdRub,
    currentUsdRub: usd.fx,
    distanceRub: usd.fx - thresholdUsdRub,
    logisticsEqual,
  }
}
