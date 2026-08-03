/**
 * Цвета для диаграмм.
 *
 * Recharts и SVG кладут цвет в атрибут, где `var(--…)` не работает,
 * поэтому здесь литералы. Значения совпадают с токенами темы —
 * менять надо в двух местах, это осознанная цена.
 *
 * Правило темы сохранено: ТЁПЛОЕ = вещество, ХОЛОДНОЕ = деньги и решения.
 */

export const C = {
  decide: '#3f687d',
  decideSoft: '#7d9db0',
  alert: '#b8493a',
  ok: '#43764e',
  ink: '#24281f',
  ink2: '#62665a',
  ink3: '#979a8c',
  line: '#dbd4c5',
  line2: '#e8e2d5',
  panel: '#fcfaf5',
  panel2: '#f2eee4',
}

/** Вещество — только там, где изображается масса или продукт. */
export const MATTER: Record<string, string> = {
  kernel: '#d9b45e',
  semi: '#be9440',
  cat3: '#8e6b2c',
  husk: '#a9a294',
  oil: '#c9861a',
  meal: '#7a5c3a',
  loss: '#cfc8b8',
  raw: '#b7ac93',
}

/** Затраты — холодная и приглушённая шкала: это деньги, а не вещество. */
export const COST: Record<string, string> = {
  raw: '#8f9a8a',
  processing: '#a8b0a2',
  shipping: '#c2c7bc',
  interest: '#6e8794',
  tax: '#3f687d',
}

/** Тёмный текст на светлых заливках. */
export const DARK_ON = new Set(['kernel', 'husk', 'loss', 'raw', 'shipping', 'processing'])
