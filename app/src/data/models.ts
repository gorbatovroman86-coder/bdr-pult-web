/**
 * Пять наборов параметров. Значения — строки 1–6 соответствующих листов
 * книги «БДР (мотивация).xlsx», снимок SNAPSHOT-2026-08-03.xlsx.
 *
 * Общее для всех: N1 = 27, J1 = 0,155, H1 = 5 000, H3 = 1 500, H5 = 3 300,
 * H6 = 1 100. Различия сведены в таблицу ниже.
 */

import type { ModelId, RawId } from '../domain/types'
import type { EngineParams } from '../domain/engine'

export interface ModelMeta {
  id: ModelId
  name: string
  /** Имя листа. У M3 — с концевым пробелом, это важно для карты формул. */
  sheet: string
  raw: RawId
  params: EngineParams
}

const COMMON = {
  daysPerMonth: 27, // N1
  processingWithVat: 5000, // H1 — параметр по модели, у всех 5 000
  moneyRate: 0.155, // J1
  shipping: { semi: 0, kernelAndCat3: 1500, oil: 3300, meal: 1100 }, // H2, H3, H5, H6
}

export const MODEL_META: ModelMeta[] = [
  {
    id: 'M1',
    name: 'Масло рапс, Иран / Малайзия',
    sheet: 'Масло (рапс, Иран, Малайзия)',
    raw: 'rapeseed',
    params: {
      ...COMMON,
      intakeTonsPerDay: 90, // L1
      purchaseWithVat: 30000, // D1
      oilFromSemi: false,
      huskRowPresent: true, // строка 13 есть, но 3 кат = 0 → лузга 0
      yields: {
        kernel: 0, // F1
        cat3: 0, // F3
        husk: 0, // F4
        oil: 0.36, // F5
        lossShare: 0.01, // зашито в F6 = 0,99 − F5
        semiIsDerived: false, // F2 задана константой 0
        producesOilLine: true,
      },
    },
  },
  {
    id: 'M2',
    name: 'Масло через ядро',
    sheet: 'Масло (через ядро)',
    raw: 'sunflower',
    params: {
      ...COMMON,
      intakeTonsPerDay: 105,
      purchaseWithVat: 27000,
      oilFromSemi: true, // строки 14–15 умножаются ещё и на F2
      huskRowPresent: true,
      yields: {
        kernel: 0,
        cat3: 0,
        husk: 0.13,
        oil: 0.49,
        lossShare: 0.01,
        semiIsDerived: true, // F2 = 1 − F1 − F3 − F4 = 0,87
        producesOilLine: true,
      },
    },
  },
  {
    id: 'M3',
    name: 'Ядро',
    sheet: 'Ядро ', // ← концевой пробел в имени листа
    raw: 'sunflower',
    params: {
      ...COMMON,
      intakeTonsPerDay: 140,
      purchaseWithVat: 27000,
      oilFromSemi: false,
      huskRowPresent: false, // строка 13 в листе «Ядро » ПУСТА целиком
      shipping: { semi: 1500, kernelAndCat3: 1500, oil: 3300, meal: 1100 }, // H2 = 1500
      yields: {
        kernel: 0.4,
        cat3: 0.03,
        husk: 0.3,
        oil: 0,
        lossShare: 0, // потерь нет: сумма выходов ровно 1
        semiIsDerived: true, // F2 = 1 − 0,40 − 0,03 − 0,30 = 0,27
        producesOilLine: false, // F6 задана константой 0
      },
    },
  },
  {
    id: 'M4',
    name: 'Масло рапс, Китай',
    sheet: 'Масло (рапс, Китай)',
    raw: 'rapeseed',
    params: {
      ...COMMON,
      intakeTonsPerDay: 90,
      purchaseWithVat: 30000,
      oilFromSemi: false,
      huskRowPresent: true,
      yields: {
        kernel: 0,
        cat3: 0,
        husk: 0,
        oil: 0.36,
        lossShare: 0.01,
        semiIsDerived: false,
        producesOilLine: true,
      },
    },
  },
  {
    id: 'M5',
    name: 'Ядро + масло',
    sheet: 'Ядро+масло',
    raw: 'sunflower',
    params: {
      ...COMMON,
      intakeTonsPerDay: 140,
      purchaseWithVat: 27000,
      oilFromSemi: true,
      huskRowPresent: true,
      yields: {
        kernel: 0.2,
        cat3: 0,
        husk: 0.13,
        oil: 0.49,
        lossShare: 0.01,
        semiIsDerived: true, // F2 = 1 − 0,20 − 0 − 0,13 = 0,67
        producesOilLine: true,
      },
    },
  },
]

export const byId = (id: ModelId): ModelMeta => {
  const m = MODEL_META.find((x) => x.id === id)
  if (!m) throw new Error(`Нет модели ${id}`)
  return m
}
