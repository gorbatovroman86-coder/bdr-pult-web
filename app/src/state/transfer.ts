/**
 * ПЕРЕДАЧА НАБОРА ПАРАМЕТРОВ ФАЙЛОМ.
 *
 * Общего хранилища у пульта нет: параметры живут в браузере каждого.
 * Пока это так, единственный честный способ считать на одних цифрах —
 * передать набор файлом и увидеть, чем он отличается от текущего.
 *
 * ЧИСТЫЙ модуль: ни React, ни localStorage, ни сети — всё проверяется тестами.
 */

import { BASE, type Inputs } from './inputs'
import { EMPTY_PAYROLL, type Payroll } from '../data/payroll'

/** Версия формата файла. Меняется, когда старый файл перестаёт читаться. */
export const SCHEMA_VERSION = 1

/** Метка сборки: короткий git sha, подставляется при сборке (см. vite.config.ts). */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

const KIND = 'bdr-pult-params'

export interface Bundle {
  kind: typeof KIND
  schemaVersion: number
  /** Версия приложения, которым сделана выгрузка. */
  appVersion: string
  /** Когда выгружено, ISO. */
  exportedAt: string
  /** Месяц действия ставок МСХ на момент выгрузки. */
  ratesMonth: string
  /** Отпечаток набора — совпадает у тех, кто считает на одних цифрах. */
  fingerprint: string
  inputs: Inputs
  /** ФОТ выгружается только по явной галочке: это зарплатные данные. */
  payroll?: Payroll
}

// ─────────────────────────────────────────────── Отпечаток набора

/**
 * Из отпечатка исключены `at` и `origin`: это отметки «когда и откуда взято»,
 * а не цифры. Два человека с одинаковыми числами обязаны увидеть один
 * отпечаток, даже если один курс подтянул автоматом, а другой ввёл руками.
 */
const SKIP = new Set(['at', 'origin'])

function canon(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'nan'
  if (typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  const o = v as Record<string, unknown>
  // Ключ со значением `undefined` и отсутствующий ключ — одно и то же:
  // JSON.stringify выбрасывает такие поля, и после круга «выгрузка → файл →
  // загрузка» отпечаток обязан остаться прежним.
  const keys = Object.keys(o).filter((k) => !SKIP.has(k) && o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`
}

/** FNV-1a, 8 шестнадцатеричных знаков. Годится, чтобы сверить набор глазами. */
export function fingerprint(i: Inputs): string {
  const s = canon(i)
  let h = 0x811c9dc5
  for (let n = 0; n < s.length; n++) {
    h ^= s.charCodeAt(n)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ─────────────────────────────────────────────── Выгрузка

export function makeBundle(
  inputs: Inputs,
  opts: { now: string; payroll?: Payroll },
): Bundle {
  const b: Bundle = {
    kind: KIND,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: opts.now,
    ratesMonth: inputs.dutySunOil.month ?? '',
    fingerprint: fingerprint(inputs),
    inputs,
  }
  if (opts.payroll) b.payroll = opts.payroll
  return b
}

/** bdr-params-2026-08-03.json */
export function bundleFilename(iso: string): string {
  return `bdr-params-${iso.slice(0, 10)}.json`
}

// ─────────────────────────────────────────────── Проверка файла

/**
 * Диапазоны для полей, где неверное значение молча испортит ответ.
 * Проверяются только заданные; `null` — законное «не задано».
 */
const RANGE: Record<string, [number, number]> = {
  'fxCny.value': [1, 100],
  'fxUsd.value': [1, 1000],
  'dutySunOil.value': [0, 100000],
  'dutySunMeal.value': [0, 100000],
  'dutyKernelPercent.value': [0, 100],
  serviceVatDivisor: [1, 2],
  goodsVatDivisor: [1, 2],
  taxRate: [0, 1],
  moneyRate: [0, 2],
  daysPerMonth: [1, 31],
  shipKernelAndCat3: [0, 100000],
  shipOil: [0, 100000],
  shipMeal: [0, 100000],
  huskFuelSaving: [0, 100000],
  'czce.kChinaDuty': [0.01, 2],
  'czce.kChinaVat': [0.01, 2],
  'czce.portCNY': [0, 100000],
}

/** Диапазоны полей модели — одни и те же для всех пяти. */
const MODEL_RANGE: Record<string, [number, number]> = {
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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Полнота: в файле обязаны быть все ключи базы, и того же типа. */
function checkShape(base: unknown, got: unknown, path: string, errs: string[]): void {
  if (base === null || typeof base !== 'object') {
    if (got === undefined) {
      errs.push(`нет поля «${path}»`)
      return
    }
    if (base === null) return
    // База не хранит null в скалярах, кроме Sourced.value — тот описан отдельно.
    if (typeof got !== typeof base) {
      errs.push(`поле «${path}»: ожидалось ${typeof base}, в файле ${typeof got}`)
    }
    return
  }
  if (got === null || typeof got !== 'object') {
    errs.push(`нет раздела «${path || 'корень'}»`)
    return
  }
  const b = base as Record<string, unknown>
  const g = got as Record<string, unknown>
  for (const k of Object.keys(b)) {
    // Sourced.value законно бывает null — «параметр не задан».
    if (k === 'value' && 'origin' in b) {
      if (!(k in g)) errs.push(`нет поля «${path}.value»`)
      else if (g[k] !== null && typeof g[k] !== 'number') errs.push(`поле «${path}.value» не число`)
      continue
    }
    if (k === 'month') continue // необязательное
    checkShape(b[k], g[k], path ? `${path}.${k}` : k, errs)
  }
}

function checkRanges(i: Inputs, errs: string[]): void {
  const get = (p: string) =>
    p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], i)

  for (const [path, [lo, hi]] of Object.entries(RANGE)) {
    const v = get(path)
    if (v === null || v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errs.push(`«${path}»: не число`)
    } else if (v < lo || v > hi) {
      errs.push(`«${path}» = ${v}: вне допустимого ${lo}…${hi}`)
    }
  }

  for (const id of Object.keys(BASE.models)) {
    for (const [field, [lo, hi]] of Object.entries(MODEL_RANGE)) {
      const v = get(`models.${id}.${field}`)
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errs.push(`«models.${id}.${field}»: не число`)
      } else if (v < lo || v > hi) {
        errs.push(`«models.${id}.${field}» = ${v}: вне допустимого ${lo}…${hi}`)
      }
    }
  }

  for (const k of Object.keys(BASE.contracts)) {
    for (const group of ['contracts', 'logistics'] as const) {
      const v = get(`${group}.${k}.value`)
      if (v === null || v === undefined) continue
      if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`«${group}.${k}»: не число`)
      else if (v < 0 || v > 10000000) errs.push(`«${group}.${k}» = ${v}: вне допустимого 0…10 000 000`)
    }
  }

  if (!MONTH_RE.test(i.currentMonth)) errs.push(`«currentMonth» = ${i.currentMonth}: не месяц вида ГГГГ-ММ`)
  if (!MONTH_RE.test(i.calcMonth)) errs.push(`«calcMonth» = ${i.calcMonth}: не месяц вида ГГГГ-ММ`)
}

export type ParseResult =
  | { ok: true; bundle: Bundle; warnings: string[] }
  | { ok: false; errors: string[] }

/**
 * Разбор и проверка файла. Частично ничего не применяем: либо набор целиком
 * годен, либо возвращается список причин отказа.
 */
export function parseBundle(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['Файл не читается как JSON — вероятно, повреждён.'] }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Файл не похож на набор параметров пульта.'] }
  }
  const o = raw as Record<string, unknown>

  if (o.kind !== KIND) {
    return { ok: false, errors: ['Это не файл параметров пульта БДР: нет метки «bdr-pult-params».'] }
  }
  if (o.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `Версия формата ${String(o.schemaVersion)}, пульт читает ${SCHEMA_VERSION}. Файл сделан другой версией пульта.`,
      ],
    }
  }

  const errs: string[] = []
  checkShape(BASE, o.inputs, '', errs)
  if (errs.length > 0) {
    return { ok: false, errors: ['Набор неполный, ничего не применяю:', ...errs.slice(0, 12)] }
  }

  const inputs = o.inputs as Inputs
  checkRanges(inputs, errs)
  if (errs.length > 0) {
    return { ok: false, errors: ['Значения вне допустимых границ, ничего не применяю:', ...errs.slice(0, 12)] }
  }

  const warnings: string[] = []
  const actual = fingerprint(inputs)
  if (typeof o.fingerprint === 'string' && o.fingerprint !== actual) {
    warnings.push(
      `Отпечаток в файле (${o.fingerprint}) не совпадает с пересчитанным (${actual}): файл правили вручную после выгрузки.`,
    )
  }

  let payroll: Payroll | undefined
  if (o.payroll !== undefined && o.payroll !== null && typeof o.payroll === 'object') {
    const p = o.payroll as Partial<Payroll>
    payroll = {
      project: typeof p.project === 'number' ? p.project : null,
      total: typeof p.total === 'number' ? p.total : null,
      enteredAt: typeof p.enteredAt === 'string' ? p.enteredAt : null,
    }
  }

  return {
    ok: true,
    warnings,
    bundle: {
      kind: KIND,
      schemaVersion: SCHEMA_VERSION,
      appVersion: typeof o.appVersion === 'string' ? o.appVersion : '—',
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      ratesMonth: typeof o.ratesMonth === 'string' ? o.ratesMonth : (inputs.dutySunOil.month ?? ''),
      fingerprint: actual,
      inputs,
      ...(payroll ? { payroll } : {}),
    },
  }
}

// ─────────────────────────────────────────────── Сравнение перед применением

export interface Diff {
  path: string
  label: string
  from: number | string | null
  to: number | string | null
}

const SEG: Record<string, string> = {
  currentMonth: 'текущий месяц',
  calcMonth: 'месяц расчёта',
  fxCny: 'курс CNY/RUB',
  fxUsd: 'курс USD/RUB',
  dutySunOil: 'пошлина МСХ · подсолн. масло',
  dutySunMeal: 'пошлина МСХ · подсолн. жмых',
  dutyKernelPercent: 'экспортная пошлина на ядро, П/Ф, 3 кат',
  contracts: 'контракт',
  logistics: 'логистика',
  kernel: 'ядро',
  semi: 'полуфабрикат',
  cat3: '3 категория',
  sunOil: 'подсолн. масло',
  sunMeal: 'подсолн. жмых',
  rapeOilMY: 'рапс. масло, Малайзия',
  rapeOilIR: 'рапс. масло, Иран',
  rapeOilCN: 'рапс. масло, Китай',
  rapeMeal: 'рапс. жмых',
  serviceVatDivisor: 'НДС услуг, делитель',
  goodsVatDivisor: 'НДС товара, делитель',
  taxRate: 'налог на прибыль',
  moneyRate: '% пользования деньгами',
  daysPerMonth: 'суток в месяце',
  shipKernelAndCat3: 'отгрузка ядра и 3 кат',
  shipOil: 'отгрузка масла',
  shipMeal: 'отгрузка жмыха',
  huskFuelSaving: 'экономия на топливе от лузги',
  czce: 'CZCE',
  kChinaDuty: 'пошлина КНР',
  kChinaVat: 'НДС КНР',
  portCNY: 'порт',
  contractMonth: 'месяц контракта',
  models: 'режим',
  intakeTonsPerDay: 'заход сырья, т/сут',
  purchaseWithVat: 'закуп сырья, ₽/т',
  processingWithVat: 'переработка, ₽/т',
  yieldKernel: 'выход ядра',
  yieldCat3: 'выход 3 категории',
  yieldHusk: 'выход лузги',
  yieldOil: 'выход масла',
  lossShare: 'потери',
  shippingSemi: 'отгрузка П/Ф',
  month: 'месяц действия',
}

export function labelFor(path: string): string {
  return path
    .split('.')
    .filter((s) => s !== 'value')
    .map((s) => SEG[s] ?? s)
    .join(' · ')
}

/** Чем файл отличается от того, что сейчас в пульте. `at` и `origin` — не отличия. */
export function diffInputs(current: Inputs, next: Inputs): Diff[] {
  const out: Diff[] = []
  const walk = (a: unknown, b: unknown, path: string) => {
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      if (a !== b) {
        out.push({
          path,
          label: labelFor(path),
          from: a as Diff['from'],
          to: b as Diff['to'],
        })
      }
      return
    }
    for (const k of Object.keys(a as Record<string, unknown>)) {
      if (SKIP.has(k)) continue
      walk(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
      )
    }
  }
  walk(current, next, '')
  return out
}

/** Отличается ли ФОТ из файла от текущего. */
export function payrollDiffers(current: Payroll, next: Payroll | undefined): boolean {
  if (!next) return false
  const c = current ?? EMPTY_PAYROLL
  return c.project !== next.project || c.total !== next.total
}
