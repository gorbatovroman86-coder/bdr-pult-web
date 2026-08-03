/**
 * Сторож палитры.
 *
 * Диаграммы читают цвета из токенов темы, но им нужен запасной набор
 * на случай, когда DOM ещё или уже недоступен. Этот тест не даёт запасному
 * набору разойтись с tokens.css: разъехавшиеся диаграммы заметит не тот,
 * кто менял цвет, и не сразу.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COST, MATTER } from '../src/charts/palette'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, '../src/theme/tokens.css'), 'utf8')

/** Все объявления `--имя: значение;` из :root. */
const declared: Record<string, string> = {}
for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  declared[m[1]] = m[2].trim()
}

describe('Запасной набор цветов совпадает с tokens.css', () => {
  const CHART_TOKENS = [
    'decide', 'decide-soft', 'alert', 'ok',
    'ink', 'ink2', 'ink3', 'line', 'line2', 'panel', 'panel2',
    'kernel', 'semi', 'cat3', 'husk', 'oil', 'meal', 'loss', 'raw',
    'cost-raw', 'cost-processing', 'cost-shipping', 'cost-interest', 'cost-tax',
  ]

  it('каждый цвет диаграмм объявлен токеном темы', () => {
    for (const name of CHART_TOKENS) {
      expect(declared[name], `токен --${name} не объявлен в tokens.css`).toBeTruthy()
    }
  })

  it('вещество берётся из токенов', () => {
    for (const key of ['kernel', 'semi', 'cat3', 'husk', 'oil', 'meal', 'loss', 'raw']) {
      expect(MATTER[key], `MATTER.${key}`).toBe(declared[key])
    }
  })

  it('затраты берутся из токенов', () => {
    for (const key of ['raw', 'processing', 'shipping', 'interest', 'tax']) {
      expect(COST[key], `COST.${key}`).toBe(declared[`cost-${key}`])
    }
  })

  it('ни один цвет не пустой — пустой fill даёт чёрную фигуру', () => {
    for (const key of ['kernel', 'oil', 'meal', 'husk', 'loss', 'raw', 'semi', 'cat3']) {
      expect(MATTER[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
    for (const key of ['raw', 'processing', 'shipping', 'interest', 'tax']) {
      expect(COST[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
