/**
 * Сторожа граничных входов. ЭТАП 5, сценарий 7.
 * Приложение не должно ни падать, ни показывать правдоподобное число там,
 * где расчёт невозможен.
 */

import { describe, expect, it } from 'vitest'
import { calcMonth, SETTINGS_WORKING, type EngineParams } from '../src/domain/engine'
import { engineBlockers, negativePriceWarnings } from '../src/domain/guards'
import { byId } from '../src/data/models'

const M3 = byId('M3').params
const M5 = byId('M5').params
const P3 = { kernel: 59891.25, semi: 50789.25, cat3: 42687.25 }

const mod = (p: EngineParams, y: Partial<EngineParams['yields']>): EngineParams => ({
  ...p,
  yields: { ...p.yields, ...y },
})

describe('Сумма выходов больше 1', () => {
  const bad = mod(M3, { kernel: 0.5, cat3: 0.3, husk: 0.4 })

  it('расчёт останавливается и называет причину', () => {
    const b = engineBlockers(bad, P3)
    expect(b.length).toBeGreaterThan(0)
    expect(b[0].code).toBe('yield-derived-negative')
    expect(b[0].message).toContain('больше 100 %')
  })

  it('без сторожа получалось бы правдоподобное враньё: −756 т П/Ф', () => {
    const r = calcMonth(bad, P3, SETTINGS_WORKING)
    expect(r.tons.semi).toBeLessThan(0) // ровно то, что нельзя показывать
    expect(r.margin).toBeGreaterThan(0) // и выглядело бы как нормальные 5 %
  })
})

describe('Нулевая выручка', () => {
  it('рентабельность НЕ ОПРЕДЕЛЕНА, а не ноль', () => {
    const r = calcMonth(M3, { kernel: 0, semi: 0, cat3: 0 }, SETTINGS_WORKING)
    expect(r.revenueTotal).toBe(0)
    expect(r.margin).toBeNull()
    expect(r.netResult).toBeLessThan(0)
  })

  it('заданный ноль — не блокировка: это осознанное значение', () => {
    expect(engineBlockers(M3, { kernel: 0, semi: 0, cat3: 0 })).toHaveLength(0)
  })
})

describe('Цены', () => {
  it('незаданная цена продаваемого продукта останавливает расчёт', () => {
    const b = engineBlockers(M3, { kernel: 59891.25 }) // нет П/Ф и 3 кат
    expect(b.map((x) => x.code)).toContain('price-missing')
    expect(b.some((x) => x.message.includes('полуфабрикат'))).toBe(true)
    expect(b.some((x) => x.message.includes('3 категория'))).toBe(true)
  })

  it('лузге цена не нужна: по решению владельца не продаётся', () => {
    expect(engineBlockers(M3, P3).some((x) => x.message.includes('лузга'))).toBe(false)
  })

  it('нечисловая цена ловится как отсутствие курса', () => {
    const b = engineBlockers(M3, { ...P3, kernel: NaN })
    expect(b.map((x) => x.code)).toContain('not-finite')
    expect(b.some((x) => x.message.includes('курс'))).toBe(true)
  })
})

describe('Отрицательный нетбэк', () => {
  it('считается, но помечается громко', () => {
    const w = negativePriceWarnings({ oil: -13850, meal: 10909.09 })
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('отрицательная')
    expect(w[0]).toContain('в убыток')
  })

  it('блокировкой не является: арифметика верна', () => {
    expect(engineBlockers(M5, { kernel: 59891.25, oil: -13850, meal: 10909.09 })).toHaveLength(0)
  })
})

describe('Допустимые граничные значения проходят', () => {
  it('выход 100 % по ядру', () => {
    const full = mod(M3, { kernel: 1, cat3: 0, husk: 0 })
    expect(engineBlockers(full, { kernel: 59891.25 })).toHaveLength(0)
    expect(calcMonth(full, { kernel: 59891.25 }, SETTINGS_WORKING).tons.semi).toBeUndefined()
  })

  it('выход за пределами 0…100 % отвергается', () => {
    expect(engineBlockers(mod(M3, { kernel: 1.4 }), P3).some((x) => x.code === 'yield-out-of-range')).toBe(true)
    expect(engineBlockers(mod(M3, { cat3: -0.1 }), P3).some((x) => x.code === 'yield-out-of-range')).toBe(true)
  })

  it('пять рабочих моделей проходят сторожа чисто', () => {
    for (const id of ['M1', 'M2', 'M3', 'M4', 'M5'] as const) {
      const p = byId(id).params
      const prices =
        id === 'M3' ? P3
        : id === 'M5' ? { kernel: 59891.25, oil: 79325, meal: 10909.09 }
        : { oil: 79325, meal: 10909.09 }
      expect(engineBlockers(p, prices), id).toHaveLength(0)
    }
  })
})
