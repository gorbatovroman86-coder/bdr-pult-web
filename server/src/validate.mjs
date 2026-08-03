/**
 * Проверка входа НА СЕРВЕРЕ.
 *
 * Браузерная проверка защищает от опечатки, серверная — от всего остального:
 * до базы доходит только то, что имеет смысл. Проверяется форма набора,
 * числовые границы и месяцы; экономический смысл — забота расчётного ядра.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MODEL_IDS = ['M1', 'M2', 'M3', 'M4', 'M5']

const PRODUCT_KEYS = [
  'kernel', 'semi', 'cat3', 'sunOil', 'sunMeal',
  'rapeOilMY', 'rapeOilIR', 'rapeOilCN', 'rapeMeal',
]

/** Скаляры верхнего уровня: путь → допустимые границы. */
const SCALARS = {
  serviceVatDivisor: [1, 2],
  goodsVatDivisor: [1, 2],
  taxRate: [0, 1],
  moneyRate: [0, 2],
  daysPerMonth: [1, 31],
  shipKernelAndCat3: [0, 100000],
  shipOil: [0, 100000],
  shipMeal: [0, 100000],
  huskFuelSaving: [0, 100000],
}

/** Параметры со значением и происхождением: путь → границы значения. */
const SOURCED = {
  fxCny: [1, 100],
  fxUsd: [1, 1000],
  dutySunOil: [0, 100000],
  dutySunMeal: [0, 100000],
  dutyKernelPercent: [0, 100],
}

const MODEL_FIELDS = {
  intakeTonsPerDay: [0, 10000],
  purchaseWithVat: [0, 1000000],
  processingWithVat: [0, 1000000],
  yieldKernel: [0, 1],
  yieldCat3: [0, 1],
  yieldHusk: [0, 1],
  yieldOil: [0, 1],
  lossShare: [0, 1],
  shippingSemi: [0, 100000],
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function num(errs, v, path, [lo, hi], { nullable = false } = {}) {
  if (v === null && nullable) return
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errs.push(`${path}: не число`)
    return
  }
  if (v < lo || v > hi) errs.push(`${path}: ${v} вне ${lo}…${hi}`)
}

/** @returns {string[]} список причин отказа; пустой — набор годен. */
export function validateInputs(inputs) {
  const errs = []
  if (!isObj(inputs)) return ['набор не является объектом']

  if (!MONTH_RE.test(inputs.currentMonth ?? '')) errs.push('currentMonth: не месяц вида ГГГГ-ММ')
  if (!MONTH_RE.test(inputs.calcMonth ?? '')) errs.push('calcMonth: не месяц вида ГГГГ-ММ')

  for (const [key, range] of Object.entries(SCALARS)) num(errs, inputs[key], key, range)

  for (const [key, range] of Object.entries(SOURCED)) {
    const s = inputs[key]
    if (!isObj(s)) {
      errs.push(`${key}: нет раздела`)
      continue
    }
    num(errs, s.value, `${key}.value`, range, { nullable: true })
    if (s.month !== undefined && !MONTH_RE.test(s.month)) errs.push(`${key}.month: не месяц вида ГГГГ-ММ`)
  }

  for (const group of ['contracts', 'logistics']) {
    const g = inputs[group]
    if (!isObj(g)) {
      errs.push(`${group}: нет раздела`)
      continue
    }
    for (const k of PRODUCT_KEYS) {
      const s = g[k]
      if (!isObj(s)) {
        errs.push(`${group}.${k}: нет поля`)
        continue
      }
      num(errs, s.value, `${group}.${k}.value`, [0, 10000000], { nullable: true })
    }
  }

  const czce = inputs.czce
  if (!isObj(czce)) {
    errs.push('czce: нет раздела')
  } else {
    num(errs, czce.kChinaDuty, 'czce.kChinaDuty', [0.01, 2])
    num(errs, czce.kChinaVat, 'czce.kChinaVat', [0.01, 2])
    num(errs, czce.portCNY, 'czce.portCNY', [0, 100000])
    if (typeof czce.contractMonth !== 'string') errs.push('czce.contractMonth: не строка')
  }

  const models = inputs.models
  if (!isObj(models)) {
    errs.push('models: нет раздела')
  } else {
    for (const id of MODEL_IDS) {
      const m = models[id]
      if (!isObj(m)) {
        errs.push(`models.${id}: нет режима`)
        continue
      }
      for (const [field, range] of Object.entries(MODEL_FIELDS)) {
        num(errs, m[field], `models.${id}.${field}`, range)
      }
    }
  }

  return errs
}

const FP_RE = /^[0-9a-f]{6,8}$/

export function validateFingerprint(fp) {
  return typeof fp === 'string' && FP_RE.test(fp) ? [] : ['fingerprint: ожидалось 6–8 знаков 0-9a-f']
}

/** Запись журнала: форма + границы текстовых полей. ФОТ в журнал не принимается. */
export function validateJournalEntry(e) {
  const errs = []
  if (!isObj(e)) return ['запись не является объектом']

  if (typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) errs.push('at: не дата ISO')
  if (typeof e.comment !== 'string') errs.push('comment: не строка')
  else if (e.comment.length > 500) errs.push('comment: длиннее 500 знаков')
  if (typeof e.auto !== 'boolean') errs.push('auto: не булево')
  errs.push(...validateFingerprint(e.fingerprint))
  errs.push(...validateInputs(e.inputs))

  if (!Array.isArray(e.results)) errs.push('results: не список')
  else if (e.results.length !== MODEL_IDS.length) errs.push(`results: ожидалось ${MODEL_IDS.length} режимов`)

  // ФОТ — зарплатные данные, в журнале им не место ни под каким видом.
  if ('payroll' in e) errs.push('payroll: ФОТ в журнал не принимается')

  return errs
}
