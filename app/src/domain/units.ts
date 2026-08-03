/**
 * Единый формат чисел и единиц по всему приложению.
 * Разделитель разрядов — узкий неразрывный пробел, десятичный — запятая.
 * Правила см. ДИЗАЙН-МАКЕТЫ.md §2.
 */

const NNBSP = ' ' // узкий неразрывный пробел

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP)
}

/** Базовое форматирование с фиксированным числом знаков после запятой. */
export function fmt(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—'
  const negative = value < 0
  const fixed = Math.abs(value).toFixed(digits)
  const [int, frac] = fixed.split('.')
  const body = frac ? `${group(int)},${frac}` : group(int)
  return negative ? `−${body}` : body
}

/** Тонны — 1 знак. */
export const tons = (v: number) => fmt(v, 1)

/** Тысячи рублей — 2 знака. */
export const kRub = (v: number) => fmt(v, 2)

/** Рубли (полные, для капитала) — без дробной части. */
export const rub = (v: number) => fmt(v, 0)

/** Рубли за тонну — 2 знака. */
export const rubPerTon = (v: number) => fmt(v, 2)

/** Проценты из доли — 2 знака. `null` = не определено, показываем «—». */
export const pct = (v: number | null) => (v === null ? '—' : fmt(v * 100, 2))

/** Доля выхода из доли — 1 знак. */
export const share = (v: number) => fmt(v * 100, 1)

/** Курс CNY — 4 знака. */
export const fxCny = (v: number) => fmt(v, 4)

/** Курс USD — 2 знака. */
export const fxUsd = (v: number) => fmt(v, 2)

/** Со знаком: для отклонений и отрывов. */
export function signed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return fmt(0, digits)
  return (value > 0 ? '+' : '') + fmt(value, digits)
}

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

/** '2026-08' → 'август 2026' */
export function monthName(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/** '2026-10' → 'окт.2026' */
export function monthShort(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MONTHS_SHORT[Number(m) - 1]}.${y}`
}

/** ISO-дата → '03.08.2026, 14:20' */
export function dateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** ISO-дата → '03.08.2026' */
export function dateOnly(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}
