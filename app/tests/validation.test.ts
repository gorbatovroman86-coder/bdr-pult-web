import { describe, expect, it } from 'vitest'
import { requiredParams, validateModel, type ParamState } from '../src/domain/validation'

const P = (id: string, label: string, value: number | null, monthly = false, month?: string): ParamState =>
  ({ id: id as never, label, value, monthly, effectiveMonth: month })

describe('Граф зависимостей: что блокирует что', () => {
  const opts = { iranBasisEnabled: true }

  it('ставки МСХ нужны M2 и M5, но НЕ M3', () => {
    for (const id of ['M2', 'M5'] as const) {
      expect(requiredParams(id, opts)).toContain('dutySunOil')
      expect(requiredParams(id, opts)).toContain('dutySunMeal')
    }
    expect(requiredParams('M3', opts)).not.toContain('dutySunOil')
    expect(requiredParams('M3', opts)).not.toContain('dutySunMeal')
  })

  it('экспортная пошлина 6,5 % нужна M3 и M5', () => {
    expect(requiredParams('M3', opts)).toContain('dutyKernelPercent')
    expect(requiredParams('M5', opts)).toContain('dutyKernelPercent')
    expect(requiredParams('M2', opts)).not.toContain('dutyKernelPercent')
  })

  it('M5 использует обе группы пошлин', () => {
    const need = requiredParams('M5', opts)
    expect(need).toContain('dutySunOil')
    expect(need).toContain('dutyKernelPercent')
  })

  it('рапсовым моделям пошлины не нужны вовсе', () => {
    for (const id of ['M1', 'M4'] as const) {
      const need = requiredParams(id, opts)
      expect(need).not.toContain('dutySunOil')
      expect(need).not.toContain('dutyKernelPercent')
    }
  })

  it('курс USD нужен только M1 и только при включённом иранском базисе', () => {
    expect(requiredParams('M1', { iranBasisEnabled: true })).toContain('fxUsd')
    expect(requiredParams('M1', { iranBasisEnabled: false })).not.toContain('fxUsd')
    expect(requiredParams('M4', opts)).not.toContain('fxUsd')
  })
})

describe('Устаревание месячных ставок', () => {
  const base = {
    fxCny: P('fxCny', 'курс CNY', 11.5),
    fxUsd: P('fxUsd', 'курс USD', 80),
    dutySunOil: P('dutySunOil', 'пошлина на подсолнечное масло', 7000, true, '2026-07'),
    dutySunMeal: P('dutySunMeal', 'пошлина на подсолнечный жмых', 1015.91, true, '2026-07'),
    dutyKernelPercent: P('dutyKernelPercent', 'экспортная пошлина на ядро', 6.5),
    czceQuote: P('czceQuote', 'котировка CZCE', 9781.43),
    'logistics:oil': P('logistics:oil', 'логистика масла', 12000, true, '2026-08'),
    'logistics:meal': P('logistics:meal', 'логистика жмыха', 10500, true, '2026-08'),
    'logistics:kernel': P('logistics:kernel', 'логистика ядра', 10000, true, '2026-08'),
    'logistics:semi': P('logistics:semi', 'логистика П/Ф', 10500, true, '2026-08'),
    'logistics:cat3': P('logistics:cat3', 'логистика 3 кат', 10000, true, '2026-08'),
  } as Record<string, ParamState>

  it('просроченные ставки МСХ останавливают M2 и M5, но не M3', () => {
    expect(validateModel('M2', base, '2026-08')).toHaveLength(2)
    expect(validateModel('M5', base, '2026-08')).toHaveLength(2)
    expect(validateModel('M3', base, '2026-08')).toHaveLength(0)
    expect(validateModel('M1', base, '2026-08')).toHaveLength(0)
    expect(validateModel('M4', base, '2026-08')).toHaveLength(0)
  })

  it('заблокированная модель называет конкретный параметр', () => {
    const b = validateModel('M2', base, '2026-08')
    expect(b[0].label).toContain('подсолнечное масло')
    expect(b[0].reason).toBe('stale-month')
  })

  it('незаданный параметр отличается от заданного нулём', () => {
    const withNull = { ...base, dutyKernelPercent: P('dutyKernelPercent', 'экспортная пошлина на ядро', null) }
    const withZero = { ...base, dutyKernelPercent: P('dutyKernelPercent', 'экспортная пошлина на ядро', 0) }
    expect(validateModel('M3', withNull, '2026-08')[0].reason).toBe('not-set')
    expect(validateModel('M3', withZero, '2026-08')).toHaveLength(0)
  })
})
