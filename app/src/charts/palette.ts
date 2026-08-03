/**
 * Цвета для диаграмм — ИЗ ДИЗАЙН-ТОКЕНОВ, а не из литералов.
 *
 * SVG и Recharts кладут цвет в атрибут, где `var(--…)` не работает. Поэтому
 * значения не дублируются вручную, а ЧИТАЮТСЯ из тех же переменных темы
 * в рантайме: источник истины один — tokens.css. Сменится тема — диаграммы
 * поедут вместе с интерфейсом, а не отдельно от него.
 *
 * Правило темы сохранено: ТЁПЛОЕ = вещество, ХОЛОДНОЕ = деньги и решения.
 */

/**
 * ЕДИНСТВЕННОЕ место с литералами, и вот почему они здесь нужны.
 *
 * Значения читаются из DOM, а DOM есть не всегда: в тестах (vitest без
 * окружения браузера) и в самый первый кадр, пока стили не применились,
 * `getComputedStyle` вернёт пустую строку. Отдать в SVG пустой `fill`
 * нельзя — фигура станет чёрной. Поэтому здесь лежит запасной набор,
 * совпадающий с tokens.css один в один.
 *
 * Эти значения НЕ являются вторым источником истины: если они разойдутся
 * с tokens.css, тест `palette.test.ts` это поймает — он сверяет их
 * с настоящим CSS-файлом.
 */
const FALLBACK: Record<string, string> = {
  decide: '#3f687d',
  'decide-soft': '#7d9db0',
  alert: '#b8493a',
  ok: '#43764e',
  ink: '#24281f',
  ink2: '#62665a',
  ink3: '#979a8c',
  line: '#dbd4c5',
  line2: '#e8e2d5',
  panel: '#fcfaf5',
  panel2: '#f2eee4',
  kernel: '#d9b45e',
  semi: '#be9440',
  cat3: '#8e6b2c',
  husk: '#a9a294',
  oil: '#c9861a',
  meal: '#7a5c3a',
  loss: '#cfc8b8',
  raw: '#b7ac93',
  'cost-raw': '#8f9a8a',
  'cost-processing': '#a8b0a2',
  'cost-shipping': '#c2c7bc',
  'cost-interest': '#6e8794',
  'cost-tax': '#3f687d',
}

/** Токены читаются один раз: getComputedStyle на каждую заливку — дорого. */
let cache: Record<string, string> | null = null

function tokens(): Record<string, string> {
  if (cache) return cache
  const out: Record<string, string> = { ...FALLBACK }
  if (typeof window !== 'undefined' && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(document.documentElement)
    for (const name of Object.keys(FALLBACK)) {
      const v = cs.getPropertyValue(`--${name}`).trim()
      if (v) out[name] = v
    }
  }
  cache = out
  return out
}

/** Сбросить кэш — нужен тестам и смене темы на ходу. */
export function resetPaletteCache(): void {
  cache = null
}

const t = (name: string) => tokens()[name]

/**
 * Токены общего назначения. Обращение ленивое: значение берётся в момент
 * отрисовки, когда стили уже применены.
 */
export const C = {
  get decide() { return t('decide') },
  get decideSoft() { return t('decide-soft') },
  get alert() { return t('alert') },
  get ok() { return t('ok') },
  get ink() { return t('ink') },
  get ink2() { return t('ink2') },
  get ink3() { return t('ink3') },
  get line() { return t('line') },
  get line2() { return t('line2') },
  get panel() { return t('panel') },
  get panel2() { return t('panel2') },
}

/** Вещество — только там, где изображается масса или продукт. */
export const MATTER: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_, k: string) => t(k),
  has: (_, k: string) => k in FALLBACK,
  ownKeys: () => ['kernel', 'semi', 'cat3', 'husk', 'oil', 'meal', 'loss', 'raw'],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
})

/** Затраты — холодная и приглушённая шкала: это деньги, а не вещество. */
export const COST: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_, k: string) => t(`cost-${k}`),
  has: (_, k: string) => `cost-${k}` in FALLBACK,
  ownKeys: () => ['raw', 'processing', 'shipping', 'interest', 'tax'],
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
})

/** Тёмный текст на светлых заливках. */
export const DARK_ON = new Set(['kernel', 'husk', 'loss', 'raw', 'shipping', 'processing'])
