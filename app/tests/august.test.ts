/**
 * ФАКТ АВГУСТА 2026 — второй якорь, рядом с эталоном (C).
 *
 * Эталон (C) — реконструкция из книги: пошлина на масло 7 000 ₽/т,
 * на шрот 1 015,91 ₽/т. Это НЕ рынок, а фиксированный вход для сверки.
 *
 * Факт августа — настоящие ставки, объявленные Минсельхозом и собранные
 * из девяти независимых источников: масло 7 748 ₽/т, шрот 312,4 ₽/т.
 *
 * Контрольные значения ниже подтверждены владельцем модели. Они закрепляют
 * то, что эталон (C) закрепить не может: поведение расчёта на живых ставках.
 */

import { describe, expect, it } from 'vitest'
import { computeAll, ranked } from '../src/state/compute'
import { BASE, baseInputs, changedPaths, resetToBaseKeepingMarket } from '../src/state/inputs'
import { TOL_MONEY } from '../src/data/references'

/** Ставки августа 2026, подтверждённые автосбором. */
export const AUG_DUTY = { oil: 7748, meal: 312.4 }

const augustInputs = () => {
  const i = baseInputs()
  i.dutySunOil.value = AUG_DUTY.oil
  i.dutySunMeal.value = AUG_DUTY.meal
  return i
}

/** Подтверждено владельцем модели. */
const FACT = {
  M5: { revenue: 157494.83, net: 30879.37, margin: 19.61 },
  M3: { revenue: 147231.81, net: 24330.64, margin: 16.53 },
  M2: { revenue: 109286.01, net: 16662.56, margin: 15.25 },
}

const c = computeAll(augustInputs())
const by = (id: string) => c.models.find((m) => m.meta.id === id)!

describe('Факт августа 2026 даёт подтверждённые числа', () => {
  for (const id of ['M5', 'M3', 'M2'] as const) {
    it(`${id} — выручка, фин. результат и рентабельность`, () => {
      const m = by(id).result
      const e = FACT[id]
      expect(by(id).blockers, `${id} не должна быть заблокирована`).toHaveLength(0)
      expect(Math.abs(m.revenueTotal - e.revenue)).toBeLessThanOrEqual(TOL_MONEY)
      expect(Math.abs(m.netResult - e.net)).toBeLessThanOrEqual(TOL_MONEY)
      expect(Math.abs(m.margin! * 100 - e.margin)).toBeLessThanOrEqual(0.01)
    })
  }

  it('рейтинг на факте августа тот же, что на эталоне', () => {
    expect(ranked(c).map((m) => m.meta.id)).toEqual(['M5', 'M3', 'M2', 'M4', 'M1'])
  })

  it('M3 к ставкам МСХ не чувствительна — считает то же самое', () => {
    const onBase = computeAll(BASE).models.find((m) => m.meta.id === 'M3')!.result
    expect(Math.abs(by('M3').result.netResult - onBase.netResult)).toBeLessThanOrEqual(TOL_MONEY)
  })

  it('эффекты по маслу и шроту почти гасят друг друга у M2 и M5', () => {
    // Пошлина на масло +748, на шрот −703,51 — рост и снижение встречные.
    const onBase = computeAll(BASE)
    for (const id of ['M2', 'M5'] as const) {
      const was = onBase.models.find((m) => m.meta.id === id)!.result.netResult
      const now = by(id).result.netResult
      expect(Math.abs(now - was)).toBeLessThan(Math.abs(was) * 0.05)
    }
  })
})

describe('Эталон (C) остался неприкосновенным', () => {
  it('BASE по-прежнему несёт реконструкцию, а не рынок', () => {
    expect(BASE.dutySunOil.value).toBe(7000)
    expect(BASE.dutySunMeal.value).toBe(1015.91)
  })

  it('чистая база даёт эталон (C), а не факт августа', () => {
    const onBase = computeAll(BASE).models.find((m) => m.meta.id === 'M5')!.result
    expect(Math.abs(onBase.netResult - FACT.M5.net)).toBeGreaterThan(TOL_MONEY)
  })
})

describe('Сброс не возвращает пульт к вымышленным ставкам', () => {
  it('параметры модели откатываются, рыночные данные месяца остаются', () => {
    const i = augustInputs()
    i.models.M3.yieldKernel = 0.9
    i.serviceVatDivisor = 1.2

    const back = resetToBaseKeepingMarket(i)

    // Параметры модели вернулись к эталону
    expect(back.models.M3.yieldKernel).toBe(BASE.models.M3.yieldKernel)
    expect(back.serviceVatDivisor).toBe(BASE.serviceVatDivisor)
    // Ставки месяца уцелели
    expect(back.dutySunOil.value).toBe(AUG_DUTY.oil)
    expect(back.dutySunMeal.value).toBe(AUG_DUTY.meal)
  })

  it('после сброса расчёт идёт на фактических ставках августа', () => {
    const back = resetToBaseKeepingMarket(augustInputs())
    const m5 = computeAll(back).models.find((m) => m.meta.id === 'M5')!.result
    expect(Math.abs(m5.netResult - FACT.M5.net)).toBeLessThanOrEqual(TOL_MONEY)
  })

  it('курс, подтянутый автосбором, сбросом тоже не теряется', () => {
    const i = augustInputs()
    i.fxCny.value = 11.9485
    expect(resetToBaseKeepingMarket(i).fxCny.value).toBe(11.9485)
  })
})

describe('Рыночные данные правкой человека не считаются', () => {
  it('фактические ставки не помечают набор изменённым', () => {
    expect(changedPaths(augustInputs())).toHaveLength(0)
  })

  it('а правка параметра модели — помечает', () => {
    const i = augustInputs()
    i.models.M2.yieldOil = 0.5
    expect(changedPaths(i)).toEqual(['models.M2.yieldOil'])
  })
})
