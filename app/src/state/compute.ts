/**
 * Сборка: входные данные → расчётное ядро → то, что показывает пульт.
 *
 * ЧИСТАЯ функция. Ни React, ни localStorage, ни модульного состояния —
 * поэтому её можно звать из тестов и сверять с эталонами.
 */

import { calcMonth, type EngineParams, type EngineResult, type NetPrices } from '../domain/engine'
import { chooseBasis, type BasisCandidate, type BasisChoice } from '../domain/basis'
import { contractToQuote, netback, quoteToContract, type Duty } from '../domain/pricing'
import { engineBlockers, negativePriceWarnings } from '../domain/guards'
import { validateModel, type Blocker, type ParamState } from '../domain/validation'
import type { ModelId, RawId, Warning } from '../domain/types'
import type { ContractKey, Inputs } from './inputs'

export interface ModelMeta {
  id: ModelId
  name: string
  /** Имя листа книги. У M3 — с концевым пробелом. */
  sheet: string
  raw: RawId
  /** M2 и M5: масло и жмых считаются от полуфабриката. */
  oilFromSemi: boolean
  /** У листа «Ядро » строки 13 нет вовсе. */
  huskRowPresent: boolean
  /** M3 не производит ни масла, ни жмыха. */
  producesOilLine: boolean
  /** Какие цены применяются к продуктам этой модели. */
  priceKeys: Partial<Record<'kernel' | 'semi' | 'cat3' | 'oil' | 'meal', ContractKey>>
}

export const META: Record<ModelId, ModelMeta> = {
  M1: {
    id: 'M1', name: 'Масло рапс, Иран / Малайзия', sheet: 'Масло (рапс, Иран, Малайзия)',
    raw: 'rapeseed', oilFromSemi: false, huskRowPresent: true, producesOilLine: true,
    priceKeys: { oil: 'rapeOilMY', meal: 'rapeMeal' }, // масло уточняется выбором базиса
  },
  M2: {
    id: 'M2', name: 'Масло через ядро', sheet: 'Масло (через ядро)',
    raw: 'sunflower', oilFromSemi: true, huskRowPresent: true, producesOilLine: true,
    priceKeys: { oil: 'sunOil', meal: 'sunMeal' },
  },
  M3: {
    id: 'M3', name: 'Ядро', sheet: 'Ядро ',
    raw: 'sunflower', oilFromSemi: false, huskRowPresent: false, producesOilLine: false,
    priceKeys: { kernel: 'kernel', semi: 'semi', cat3: 'cat3' },
  },
  M4: {
    id: 'M4', name: 'Масло рапс, Китай', sheet: 'Масло (рапс, Китай)',
    raw: 'rapeseed', oilFromSemi: false, huskRowPresent: true, producesOilLine: true,
    priceKeys: { oil: 'rapeOilCN', meal: 'rapeMeal' },
  },
  M5: {
    id: 'M5', name: 'Ядро + масло', sheet: 'Ядро+масло',
    raw: 'sunflower', oilFromSemi: true, huskRowPresent: true, producesOilLine: true,
    priceKeys: { kernel: 'kernel', oil: 'sunOil', meal: 'sunMeal' },
  },
}

export const MODEL_IDS: ModelId[] = ['M1', 'M2', 'M3', 'M4', 'M5']

/** Какая пошлина применяется к продукту. */
function dutyFor(key: ContractKey, i: Inputs): Duty {
  if (key === 'kernel' || key === 'semi' || key === 'cat3') {
    const p = i.dutyKernelPercent.value
    return p === null ? { kind: 'none' } : { kind: 'percent', percent: p }
  }
  if (key === 'sunOil') {
    const v = i.dutySunOil.value
    return v === null ? { kind: 'none' } : { kind: 'perTon', rubPerTon: v }
  }
  if (key === 'sunMeal') {
    const v = i.dutySunMeal.value
    return v === null ? { kind: 'perTon', rubPerTon: NaN } : { kind: 'perTon', rubPerTon: v }
  }
  return { kind: 'none' } // рапс — пошлины нет
}

const CURRENCY_OF: Record<ContractKey, 'CNY' | 'USD'> = {
  kernel: 'CNY', semi: 'CNY', cat3: 'CNY',
  sunOil: 'CNY', sunMeal: 'CNY',
  rapeOilMY: 'CNY', rapeOilIR: 'USD', rapeOilCN: 'CNY', rapeMeal: 'CNY',
}

/** Нетто-цена по ключу продукта, ₽/т. `null` = не посчитать. */
export function netPrice(key: ContractKey, i: Inputs): number | null {
  const contract = i.contracts[key].value
  const log = i.logistics[key].value
  const fx = CURRENCY_OF[key] === 'USD' ? i.fxUsd.value : i.fxCny.value
  if (contract === null || log === null || fx === null) return null
  return netback({
    contract,
    currency: CURRENCY_OF[key],
    fx,
    duty: dutyFor(key, i),
    logisticsRubPerTon: log,
  })
}

export function toEngineParams(id: ModelId, i: Inputs): EngineParams {
  const m = i.models[id]
  const meta = META[id]
  return {
    intakeTonsPerDay: m.intakeTonsPerDay,
    daysPerMonth: i.daysPerMonth,
    purchaseWithVat: m.purchaseWithVat,
    processingWithVat: m.processingWithVat,
    moneyRate: i.moneyRate,
    oilFromSemi: meta.oilFromSemi,
    huskRowPresent: meta.huskRowPresent,
    shipping: {
      semi: m.shippingSemi,
      kernelAndCat3: i.shipKernelAndCat3,
      oil: i.shipOil,
      meal: i.shipMeal,
    },
    yields: {
      kernel: m.yieldKernel,
      cat3: m.yieldCat3,
      husk: m.yieldHusk,
      oil: m.yieldOil,
      lossShare: m.lossShare,
      // У M1 и M4 F2 задана константой 0 — производной формулы нет.
      semiIsDerived: id === 'M2' || id === 'M3' || id === 'M5',
      producesOilLine: meta.producesOilLine,
    },
  }
}

export interface ComputedModel {
  meta: ModelMeta
  params: EngineParams
  result: EngineResult
  prices: NetPrices
  /** Ключ контракта по каждому продукту — для раскрытия цены. */
  priceKeys: ModelMeta['priceKeys']
  blockers: Blocker[]
  warnings: Warning[]
  basis?: BasisChoice
}

export interface Computed {
  models: ComputedModel[]
  basis: BasisChoice | null
  /** Нетто-цены по всем ключам — для экрана исходных данных. */
  net: Partial<Record<ContractKey, number | null>>
  czce: { contract: number | null; quote: number | null; roundtrip: number | null }
}

function paramStates(i: Inputs): Record<string, ParamState> {
  const p = (id: string, label: string, v: Sourcedish, monthly: boolean): ParamState => ({
    id: id as never,
    label,
    value: v.value,
    monthly,
    effectiveMonth: v.month,
  })
  type Sourcedish = { value: number | null; month?: string }
  const L = (k: ContractKey, label: string) => p(`logistics:${k}`, label, i.logistics[k], true)
  return {
    fxCny: p('fxCny', 'курс CNY/RUB', i.fxCny, false),
    fxUsd: p('fxUsd', 'курс USD/RUB', i.fxUsd, false),
    dutySunOil: p('dutySunOil', 'пошлина на подсолнечное масло', i.dutySunOil, true),
    dutySunMeal: p('dutySunMeal', 'пошлина на подсолнечный жмых', i.dutySunMeal, true),
    dutyKernelPercent: p('dutyKernelPercent', 'экспортная пошлина на ядро, П/Ф и 3 кат', i.dutyKernelPercent, false),
    czceQuote: { id: 'czceQuote' as never, label: 'котировка CZCE', value: i.contracts.rapeOilCN.value, monthly: false },
    'logistics:kernel': L('kernel', 'логистика ядра'),
    'logistics:semi': L('semi', 'логистика П/Ф'),
    'logistics:cat3': L('cat3', 'логистика 3 категории'),
    'logistics:oil': L('sunOil', 'логистика масла'),
    'logistics:meal': L('rapeMeal', 'логистика жмыха'),
  }
}

function warningsFor(id: ModelId, r: EngineResult): Warning[] {
  const w: Warning[] = []
  const fmtT = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  const husk = r.tons.husk ?? 0

  if (r.soldTonsAsInFile > r.rawTons) {
    w.push({
      kind: 'discrepancy',
      text: `П/Ф ${fmtT(r.tons.semi ?? 0)} т/мес учтён в «Продажа, т», но не продаётся и цены не имеет`,
      ref: 'D1',
    })
  }
  if (husk > 0 && (r.revenue.husk ?? 0) === 0) {
    w.push({
      kind: 'unmonetized',
      text: `Лузга ${fmtT(husk)} т/мес не монетизируется: сжигается на своём котле`,
      ref: 'Q3',
    })
  }
  if (id === 'M3') {
    w.push({
      kind: 'simplification',
      text: 'Не прессует, но платит ту же ставку переработки, что и двухпередельные режимы',
      ref: 'Q5',
    })
  }
  if (id === 'M1' || id === 'M4') {
    w.push({ kind: 'discrepancy', text: 'Столбец L (авг.2027) заполнен только в строках тонн: годовой ИТОГО не сходится сам с собой', ref: 'D3 · Q10' })
    w.push({ kind: 'discrepancy', text: 'ДЗ = 0, потому что считается только по ядру. Капитал и процент занижены', ref: 'D4' })
  }
  if (id === 'M1') {
    w.push({ kind: 'beyond-bdr', text: 'Иранский базис и выбор лучшего из двух — сверх БДР, в файле формула цены одна', ref: '➕' })
  }
  return w
}

/** Главная сборка. Всё производное считается здесь и нигде больше. */
export function computeAll(i: Inputs): Computed {
  const net: Partial<Record<ContractKey, number | null>> = {}
  for (const k of Object.keys(i.contracts) as ContractKey[]) net[k] = netPrice(k, i)

  // ── Базис M1: считаются оба, берётся лучший
  let basis: BasisChoice | null = null
  const nIR = net.rapeOilIR
  const nMY = net.rapeOilMY
  if (nIR !== null && nIR !== undefined && nMY !== null && nMY !== undefined) {
    const ir: BasisCandidate = {
      destination: 'IR', contract: i.contracts.rapeOilIR.value ?? 0, currency: 'USD',
      fx: i.fxUsd.value ?? 0, logisticsRubPerTon: i.logistics.rapeOilIR.value ?? 0, net: nIR,
    }
    const my: BasisCandidate = {
      destination: 'MY', contract: i.contracts.rapeOilMY.value ?? 0, currency: 'CNY',
      fx: i.fxCny.value ?? 0, logisticsRubPerTon: i.logistics.rapeOilMY.value ?? 0, net: nMY,
    }
    basis = chooseBasis(ir, my)
  }

  const states = paramStates(i)

  const models: ComputedModel[] = MODEL_IDS.map((id) => {
    const meta = META[id]
    const params = toEngineParams(id, i)

    const prices: NetPrices = {}
    const keys = { ...meta.priceKeys }
    if (id === 'M1' && basis) keys.oil = basis.winner.destination === 'IR' ? 'rapeOilIR' : 'rapeOilMY'
    for (const [product, key] of Object.entries(keys) as [keyof NetPrices, ContractKey][]) {
      const v = net[key]
      if (v !== null && v !== undefined) prices[product] = v
    }

    const result = calcMonth(params, prices, {
      serviceVatDivisor: i.serviceVatDivisor,
      goodsVatDivisor: i.goodsVatDivisor,
      taxRate: i.taxRate,
    }, { huskFuelSavingRubPerTon: i.huskFuelSaving })

    const blockers: Blocker[] = [
      ...validateModel(id, states, i.currentMonth, { iranBasisEnabled: true }),
      ...engineBlockers(params, prices).map((x) => ({
        paramId: x.code as never,
        label: x.code,
        reason: 'not-set' as const,
        message: x.message,
      })),
    ]

    return {
      meta, params, result, prices, priceKeys: keys, blockers,
      warnings: [
        ...warningsFor(id, result),
        ...negativePriceWarnings(prices).map((text) => ({ kind: 'discrepancy' as const, text, ref: '⚠' })),
      ],
      basis: id === 'M1' && basis ? basis : undefined,
    }
  })

  const contractCN = i.contracts.rapeOilCN.value
  return {
    models,
    basis,
    net,
    czce: {
      contract: contractCN,
      quote: contractCN === null ? null : contractToQuote(contractCN, i.czce),
      roundtrip:
        contractCN === null
          ? null
          : quoteToContract({ quote: contractToQuote(contractCN, i.czce), ...i.czce }),
    },
  }
}

/** Отсортированные по фин. результату, заблокированные — в конце. */
export function ranked(c: Computed, by: 'net' | 'perTon' | 'margin' = 'net'): ComputedModel[] {
  const key = (m: ComputedModel) =>
    by === 'net' ? m.result.netResult
    : by === 'perTon' ? m.result.netPerRawTon
    : (m.result.margin ?? -Infinity)
  return [...c.models].sort((a, b) => {
    const ab = a.blockers.length > 0 ? 1 : 0
    const bb = b.blockers.length > 0 ? 1 : 0
    if (ab !== bb) return ab - bb
    return key(b) - key(a)
  })
}
