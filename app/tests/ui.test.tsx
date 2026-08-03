// @vitest-environment happy-dom
/**
 * АВТОТЕСТЫ ИНТЕРФЕЙСА.
 *
 * Проверяется то, что видит и делает человек: правка поля, сброс, блокировки,
 * состояние обмена с сервером. Сеть подменена — живой сервис не трогается.
 *
 * Чего эти тесты НЕ проверяют: вёрстку. happy-dom не считает раскладку,
 * поэтому переносы, ширины и поведение на узком экране остаются
 * на ручной проверке управляемым браузером.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { BASE, baseInputs } from '../src/state/inputs'
import { computeAll } from '../src/state/compute'
import { fingerprint } from '../src/state/transfer'
import { REF_C, TOL_MONEY } from '../src/data/references'

/** Без адреса сервера пульт работает как раньше — локально. */
const offline = () => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('сети нет')
  }))
}

const goto = (hash: string) => {
  window.location.hash = hash
}

const openRates = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(screen.getByRole('button', { name: 'Ставки и курсы' }))
}

/** Поле внутри конкретной панели: подписи повторяются в шапке и в таблицах. */
const fieldIn = (panelTitle: string, label: string) => {
  const panel = screen.getByText(panelTitle).closest('section')!
  return within(panel).getByText(label).closest('label')!.querySelector('input') as HTMLInputElement
}

const fxField = (label: string) => fieldIn('Курсы валют', label)

/**
 * Ввод значения в числовое поле.
 *
 * `userEvent.clear` + `type` здесь не годится: у поля есть черновик, и очистка
 * до него не доходит — значение дописывается к прежнему (11,5 + 13 = 11,513).
 * `fireEvent.change` подменяет значение целиком, как это делает браузер
 * при вставке.
 */
const setValue = (input: HTMLInputElement, v: string) =>
  fireEvent.change(input, { target: { value: v } })

beforeEach(() => {
  goto('/')
  offline()
})

describe('Экран сравнения показывает то же, что считает ядро', () => {
  it('вердикт называет лидера и его результат из эталона (C)', async () => {
    render(<App />)
    const c = computeAll(BASE)
    const best = c.models.find((m) => m.meta.id === 'M5')!
    expect(Math.abs(best.result.netResult - REF_C.M5.net)).toBeLessThanOrEqual(TOL_MONEY)

    const verdict = await screen.findByText(/Выгоднее всего/)
    expect(verdict.textContent).toContain('M5')
  })

  it('отпечаток набора виден на экране сравнения', async () => {
    render(<App />)
    expect(await screen.findByText('отпечаток набора')).toBeTruthy()
    expect(screen.getAllByText(fingerprint(BASE)).length).toBeGreaterThan(0)
  })

  it('на базе параметры помечены базовыми', async () => {
    render(<App />)
    expect(await screen.findByText('рабочий эталон')).toBeTruthy()
  })
})

describe('Правка параметра пересчитывает все модели немедленно', () => {
  it('рост курса CNY меняет результат и помечает набор изменённым', async () => {
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    setValue(fxField('CNY / RUB'), '13')

    // Экран сравнения обязан увидеть правку без всякой кнопки «применить».
    await u.click(screen.getByRole('button', { name: 'Сравнение' }))
    expect(await screen.findByText('отличаются от базы')).toBeTruthy()

    const withFx = baseInputs()
    withFx.fxCny.value = 13
    expect(screen.getAllByText(fingerprint(withFx)).length).toBeGreaterThan(0)
  })

  it('кнопка «Вернуть базовые значения» возвращает ровно эталон (C)', async () => {
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    setValue(fxField('CNY / RUB'), '13')
    expect(await screen.findByText('Внесены изменения')).toBeTruthy()

    await u.click(screen.getByRole('button', { name: 'Вернуть базовые значения' }))

    await u.click(screen.getByRole('button', { name: 'Сравнение' }))
    expect(await screen.findByText('рабочий эталон')).toBeTruthy()
    expect(screen.getAllByText(fingerprint(BASE)).length).toBeGreaterThan(0)
  })
})

describe('ФОТ и параметры расчёта не задевают друг друга', () => {
  it('сброс ФОТ не трогает параметры расчёта', async () => {
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    setValue(fxField('CNY / RUB'), '13')

    await u.click(screen.getByText('Настройки расчёта — меняются редко'))
    const payroll = screen.getByText('ФОТ «проект»').closest('label')!.querySelector('input')!
    await u.type(payroll, '123')
    await u.click(await screen.findByRole('button', { name: 'Очистить ФОТ' }))

    // Курс остался изменённым: у ФОТ своя кнопка и своё хранилище.
    expect(fxField('CNY / RUB').value).toBe('13')
  })

  it('общий сброс не трогает ФОТ', async () => {
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)
    await u.click(screen.getByText('Настройки расчёта — меняются редко'))

    const payroll = screen.getByText('ФОТ «проект»').closest('label')!.querySelector('input')!
    await u.type(payroll, '123')

    setValue(fxField('CNY / RUB'), '13')
    await u.click(await screen.findByRole('button', { name: 'Вернуть базовые значения' }))

    expect((screen.getByText('ФОТ «проект»').closest('label')!.querySelector('input') as HTMLInputElement).value)
      .toBe('123')
  })
})

describe('Блокировки видны на экране и называют параметр', () => {
  it('просроченный месяц ставок останавливает M2 и M5, а M3 считает', async () => {
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const month = screen.getByText('месяц действия ставок').closest('label')!.querySelector('select')!
    await u.selectOptions(month, '2026-07')

    const box = await screen.findByText(/Расчёт остановлен/)
    expect(box.textContent).toContain('M2')
    expect(box.textContent).toContain('M5')
    expect(box.textContent).not.toContain('M3')
  })

  it('в сводной таблице заблокированная модель называет конкретный параметр', async () => {
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)
    const month = screen.getByText('месяц действия ставок').closest('label')!.querySelector('select')!
    await u.selectOptions(month, '2026-07')

    await u.click(screen.getByRole('button', { name: 'Сравнение' }))
    const panel = (await screen.findByText('Сводная таблица')).closest('section')!
    // Строка заблокированной модели обязана называть параметр, а не просто «⛔».
    const blockedRows = [...panel.querySelectorAll('tr.tr-muted')]
    expect(blockedRows.length).toBe(2)
    const texts = blockedRows.map((r) => r.textContent ?? '')
    expect(texts.some((t) => t.includes('M2') && t.includes('подсолнечное масло'))).toBe(true)
    expect(texts.some((t) => t.includes('M5'))).toBe(true)
  })
})

describe('Базис M1 переключается через порог курса', () => {
  it('курс доллара ниже порога уводит M1 на Малайзию, выше — на Иран', async () => {
    const u = userEvent.setup()
    render(<App />)
    await openRates(u)

    const usd = fxField('USD / RUB')
    setValue(usd, '79.9')
    expect(usd.value).toBe('79.9')

    const low = baseInputs()
    low.fxUsd.value = 79.9
    expect(computeAll(low).basis!.winner.destination).toBe('MY')
    // Отпечаток на экране подтверждает, что в расчёт ушёл именно этот курс.
    await u.click(screen.getByRole('button', { name: 'Сравнение' }))
    expect(screen.getAllByText(fingerprint(low)).length).toBeGreaterThan(0)

    await openRates(u)
    setValue(fxField('USD / RUB'), '80')
    const high = baseInputs()
    high.fxUsd.value = 80
    expect(computeAll(high).basis!.winner.destination).toBe('IR')
    await u.click(screen.getByRole('button', { name: 'Сравнение' }))
    expect(screen.getAllByText(fingerprint(high)).length).toBeGreaterThan(0)
  })
})

describe('Общий параметр в карточке режима не редактируется', () => {
  it('в карточке M3 общие параметры показаны справкой без полей ввода', async () => {
    // Открываем адресом: на экране сравнения кнопка «M3» в столбцах
    // выбирает режим для разборов, а карточку открывает ссылка в таблице.
    goto('/model/M3')
    render(<App />)

    const head = await screen.findByText('Общие параметры — действуют на все пять режимов')
    const table = head.parentElement!.querySelector('table')!
    // Ни одного поля ввода: общий параметр правится только на экране ставок,
    // иначе человек думает, что правит один режим, а меняет все пять.
    expect(table.querySelectorAll('input, select, textarea')).toHaveLength(0)
    expect(within(head.closest('section')!).getByText(/справка, а не поля ввода/)).toBeTruthy()
  })
})

describe('Состояние обмена с сервером всегда на экране', () => {
  it('без заданного адреса пульт честно говорит, что работает локально', async () => {
    render(<App />)
    expect(await screen.findByText('только этот браузер')).toBeTruthy()
  })

  it('сервер не отвечает — пульт не падает и сообщает о работе локально', async () => {
    localStorage.setItem(
      'bdr-pult:api:v1',
      JSON.stringify({ base: 'https://пример.invalid/api', user: 'u', pass: 'p' }),
    )
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('сети нет')
    }))

    render(<App />)
    expect(await screen.findByText('нет связи, локально')).toBeTruthy()
    // Расчёт при этом продолжает работать.
    expect(screen.getByText(/Выгоднее всего/)).toBeTruthy()
  })

  it('сервер принял набор — показано «сохранено на сервере»', async () => {
    localStorage.setItem(
      'bdr-pult:api:v1',
      JSON.stringify({ base: 'https://пример.invalid/api', user: 'u', pass: 'p' }),
    )
    const saved = { fingerprint: fingerprint(BASE), revision: 1, updatedAt: '2026-08-03T10:00:00.000Z' }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url)
      if (path.endsWith('/params') && init?.method === 'PUT') {
        return new Response(JSON.stringify(saved), { status: 200 })
      }
      if (path.endsWith('/params')) {
        return new Response(JSON.stringify({ inputs: null, fingerprint: null, revision: 0, updatedAt: null }), { status: 200 })
      }
      return new Response(JSON.stringify({ entries: [], rates: {} }), { status: 200 })
    }))

    render(<App />)
    await waitFor(() => expect(screen.getByText('сохранено на сервере')).toBeTruthy())
  })

  it('расхождение двух компьютеров показывает оба состояния и не затирает', async () => {
    const theirs = baseInputs()
    theirs.fxCny.value = 12

    localStorage.setItem(
      'bdr-pult:api:v1',
      JSON.stringify({ base: 'https://пример.invalid/api', user: 'u', pass: 'p' }),
    )
    // Этот браузер уже обменивался и с тех пор правил у себя.
    localStorage.setItem('bdr-pult:synced:v1', JSON.stringify({ revision: 1, fingerprint: 'ffffffff' }))

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/params')) {
        return new Response(JSON.stringify({
          inputs: theirs, fingerprint: fingerprint(theirs), revision: 7,
          updatedAt: '2026-08-03T09:00:00.000Z',
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ entries: [], rates: {} }), { status: 200 })
    }))

    render(<App />)
    expect(await screen.findByText(/менялся с двух компьютеров/)).toBeTruthy()
    expect(screen.getAllByText(fingerprint(BASE)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(fingerprint(theirs)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Оставить это' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Взять серверное' })).toBeTruthy()
  })
})
