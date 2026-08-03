/**
 * Контрольные значения из технического задания. Регрессия переноса формул.
 * Все суммы — тыс.₽ за месяц, рентабельность — доля.
 */

export interface RefRow {
  revenue: number
  cost: number
  shipping: number
  interest: number
  tax: number
  net: number
  margin: number
}

/** (A) «Как в Excel»: C5 = 0,8636…, НДС услуг 1,2, цены по формулам файла. */
export const REF_A: Record<string, RefRow> = {
  M1: { revenue: 84735.32, cost: 76397.73, shipping: 3809.03, interest: 1412.44, tax: 779.03, net: 2337.09, margin: 0.0276 },
  M2: { revenue: 91283.55, cost: 81398.86, shipping: 4454.0, interest: 1483.06, tax: 986.91, net: 2960.72, margin: 0.0324 },
  M3: { revenue: 123476.98, cost: 108531.82, shipping: 3307.5, interest: 3059.31, tax: 2144.59, net: 6433.76, margin: 0.0521 },
  M4: { revenue: 94401.86, cost: 76397.73, shipping: 3809.03, interest: 1412.44, tax: 3195.67, net: 9587.0, margin: 0.1016 },
  M5: { revenue: 131804.4, cost: 108531.82, shipping: 5518.45, interest: 2518.36, tax: 3808.94, net: 11426.83, margin: 0.0867 },
}

/** (B) Промежуточный: C5 = 1, НДС услуг 1,2, жмых 12 000 ₽/т с НДС. */
export const REF_B: Record<string, Pick<RefRow, 'revenue' | 'net' | 'margin'>> = {
  M2: { revenue: 109322.43, net: 16489.88, margin: 0.1508 },
  M3: { revenue: 147231.81, net: 24096.33, margin: 0.1637 },
  M5: { revenue: 157532.23, net: 30645.92, margin: 0.1945 },
}

/**
 * (C) Рабочий: все принятые решения, НДС услуг 22 %, курс CNY 11,5, USD 80,00,
 * пошлины подсолнечника — реконструкция из файла (масло 7 000, жмых 1 015,91).
 */
export const REF_C: Record<string, RefRow> = {
  'M1-MY': { revenue: 84735.32, cost: 76231.74, shipping: 3746.58, interest: 1412.44, tax: 836.14, net: 2508.41, margin: 0.0296 },
  'M1-IR-80': { revenue: 84779.05, cost: 76231.74, shipping: 3746.58, interest: 1412.44, tax: 847.07, net: 2541.22, margin: 0.03 },
  'M1-IR-82': { revenue: 86616.13, cost: 76231.74, shipping: 3746.58, interest: 1412.44, tax: 1306.34, net: 3919.03, margin: 0.0452 },
  M4: { revenue: 94401.85, cost: 76231.74, shipping: 3746.58, interest: 1412.44, tax: 3252.77, net: 9758.32, margin: 0.1034 },
  M2: { revenue: 109322.42, cost: 81205.22, shipping: 4380.98, interest: 1483.06, tax: 5563.29, net: 16689.88, margin: 0.1527 },
  M3: { revenue: 147231.81, cost: 108273.62, shipping: 3253.28, interest: 3264.06, tax: 8110.21, net: 24330.64, margin: 0.1653 },
  M5: { revenue: 157532.23, cost: 108273.62, shipping: 5427.99, interest: 2620.73, tax: 10302.47, net: 30907.41, margin: 0.1962 },
}

/** Нетто-цены эталона (C), ₽/т — из ТЗ, для отдельной проверки цепочки цен. */
export const REF_C_NET_PRICES = {
  rapeMeal: 15950.0,
  sunOil: 79325.0,
  sunMeal: 10909.09,
  kernel: 59891.25,
  semi: 50789.25,
  cat3: 42687.25,
}

/** Допуск сверки: 0,01 тыс.₽ по деньгам, 0,01 п.п. по рентабельности. */
export const TOL_MONEY = 0.011
export const TOL_MARGIN = 0.0001
