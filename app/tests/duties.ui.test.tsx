// @vitest-environment happy-dom
/**
 * Экран ставок пошлин.
 *
 * Проверяются все состояния, в которых он обязан вести себя по-разному:
 * подтверждено, спор источников, тревога сторожа, один источник,
 * ставка не найдена. Молчаливого применения не должно быть ни в одном.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

const CFG = { base: 'https://пример.invalid/api', user: 'u', pass: 'p' }

const duty = (over: Record<string, unknown> = {}) => ({
  month: '2026-08', product: 'oil', rate: 7748,
  sources: ['zolnews', 'oilworldru'], status: 'confirmed',
  variants: [{ rate: 7748, sources: ['zolnews', 'oilworldru'] }],
  firstSeenAt: '2026-07-24T21:16:50Z',
  previousRate: null, history: [], alarm: false, alarmBasis: null, alarmMessage: '',
  autoApply: true, needsHuman: false,
  ...over,
})

/** Сеть: параметры пустые, журнал пуст, ставки — что передали. */
const serve = (rates: unknown[]) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/duties')) {
      return new Response(JSON.stringify({ rates, scannedAt: '2026-08-03T12:00:00.000Z', note: '' }), { status: 200 })
    }
    if (u.endsWith('/params') && init?.method === 'PUT') {
      return new Response(JSON.stringify({ fingerprint: 'aaaaaaaa', revision: 1, updatedAt: '2026-08-03T12:00:00.000Z' }), { status: 200 })
    }
    if (u.endsWith('/params')) {
      return new Response(JSON.stringify({ inputs: null, fingerprint: null, revision: 0, updatedAt: null }), { status: 200 })
    }
    if (u.endsWith('/journal')) return new Response(JSON.stringify({ entries: [] }), { status: 200 })
    return new Response(JSON.stringify({ rates: {} }), { status: 200 })
  }))
}

const openRates = async (u: ReturnType<typeof userEvent.setup>) =>
  u.click(screen.getByRole('button', { name: 'Ставки и курсы' }))

const dutyPanel = () => screen.getByText('Пошлины МСХ').closest('section')!

beforeEach(() => {
  window.location.hash = '/'
  localStorage.setItem('bdr-pult:api:v1', JSON.stringify(CFG))
})

describe('Подтверждённая ставка', () => {
  it('показана с продуктом, значением, месяцем и числом источников', async () => {
    serve([duty()])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const p = dutyPanel()
    await waitFor(() => expect(within(p).getByText('7 748,00')).toBeTruthy())
    expect(within(p).getByText(/2 источника: oilworldru, zolnews|2 источника/)).toBeTruthy()
    expect(within(p).getAllByText('август 2026').length).toBeGreaterThan(0)
  })

  it('применяется сама и помечается применённой', async () => {
    serve([duty()])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)
    await waitFor(() => expect(within(dutyPanel()).getByText('✅ применена')).toBeTruthy())
  })
})

describe('Источники разошлись', () => {
  const спор = duty({
    status: 'disputed', autoApply: false, needsHuman: true,
    variants: [
      { rate: 7748, sources: ['zolnews', 'oilworldru'] },
      { rate: 7000, sources: ['agrotrendru', 'agroinvestor'] },
    ],
  })

  it('молча не применяется, показаны оба значения с источниками', async () => {
    serve([спор])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const p = dutyPanel()
    await waitFor(() => expect(within(p).getByText(/Источники разошлись/)).toBeTruthy())
    expect(within(p).getByText('7 748,00 ₽/т')).toBeTruthy()
    expect(within(p).getByText('7 000,00 ₽/т')).toBeTruthy()
    expect(within(p).queryByText('✅ применена')).toBeNull()
  })

  it('выбор человека применяет именно выбранное значение', async () => {
    serve([спор])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const p = dutyPanel()
    await waitFor(() => expect(within(p).getByText(/Источники разошлись/)).toBeTruthy())
    await u.click(within(p).getByText('7 000,00 ₽/т').closest('button')!)

    const label = within(p).getAllByText('подсолнечное масло')
      .map((n) => n.closest('label')).find(Boolean)!
    expect((label.querySelector('input') as HTMLInputElement).value).toBe('7000')
  })
})

describe('Сторож неправдоподобия', () => {
  it('показывает оба значения и говорит, что пошлина плавающая', async () => {
    serve([duty({
      previousRate: 3294.2, history: [3294.2], alarm: true, alarmBasis: 'double',
      alarmMessage: 'Изменение к прошлому месяцу более чем вдвое (было 3294.2 ₽/т). Пошлина плавающая, кратные изменения для неё нормальны — это повод сверить с источником.',
      autoApply: false, needsHuman: true,
    })])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const p = dutyPanel()
    await waitFor(() => expect(within(p).getByText(/Сторож/)).toBeTruthy())
    expect(within(p).getByText(/было 3 294,20 ₽\/т → стало 7 748,00 ₽\/т/)).toBeTruthy()
    expect(within(p).getByText(/плавающая/)).toBeTruthy()
    expect(within(p).queryByText('✅ применена')).toBeNull()
  })
})

describe('Один источник', () => {
  it('применяется только по слову человека', async () => {
    serve([duty({ status: 'single', sources: ['zolnews'], autoApply: false, needsHuman: true })])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const p = dutyPanel()
    await waitFor(() => expect(within(p).getByText(/Подтверждено одним источником/)).toBeTruthy())
    expect(within(p).queryByText('✅ применена')).toBeNull()
  })
})

describe('Ставка не найдена', () => {
  it('названы продукты и остановленные модели', async () => {
    serve([])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const p = dutyPanel()
    await waitFor(() => expect(within(p).getByText(/не найдена/)).toBeTruthy())
    expect(within(p).getAllByText(/подсолнечное масло/).length).toBeGreaterThan(0)
  })

  it('ручной ввод остаётся доступен как резерв', async () => {
    serve([])
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const p = dutyPanel()
    await waitFor(() => expect(within(p).getByText(/не найдена/)).toBeTruthy())
    const label = within(p).getAllByText('подсолнечное масло')
      .map((n) => n.closest('label')).find(Boolean)
    expect(label?.querySelector('input')).toBeTruthy()
    expect(within(p).getByText(/Страница МСХ/)).toBeTruthy()
  })
})
