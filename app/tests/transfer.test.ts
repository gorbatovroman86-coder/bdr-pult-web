/**
 * Передача набора параметров файлом.
 *
 * Главное здесь — КТ-1: выгрузка, прогнанная через JSON и загруженная заново,
 * обязана дать ровно эталон (C) и тот же отпечаток. Если это перестанет
 * выполняться, двое перестанут считать на одних цифрах, не заметив этого.
 */

import { describe, expect, it } from 'vitest'
import {
  SCHEMA_VERSION, bundleFilename, diffInputs, fingerprint, labelFor, makeBundle, parseBundle,
} from '../src/state/transfer'
import { BASE, baseInputs } from '../src/state/inputs'
import { computeAll } from '../src/state/compute'
import { REF_C, TOL_MONEY } from '../src/data/references'

const NOW = '2026-08-03T14:20:00.000Z'
const roundtrip = (text: string) => parseBundle(text)
const asFile = (b: unknown) => JSON.stringify(b, null, 2)

describe('Отпечаток набора', () => {
  it('на одних и тех же цифрах повторяем', () => {
    expect(fingerprint(BASE)).toBe(fingerprint(baseInputs()))
    expect(fingerprint(BASE)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('любая изменённая цифра меняет отпечаток', () => {
    const i = baseInputs()
    i.fxCny.value = 11.51
    expect(fingerprint(i)).not.toBe(fingerprint(BASE))

    const j = baseInputs()
    j.models.M3.yieldKernel = 0.41
    expect(fingerprint(j)).not.toBe(fingerprint(BASE))
  })

  it('отметки «когда и откуда взято» отпечаток не меняют', () => {
    const i = baseInputs()
    i.fxCny.at = '2027-01-01T00:00:00.000Z'
    i.fxCny.origin = 'manual'
    expect(fingerprint(i)).toBe(fingerprint(BASE))
  })

  it('перестановка ключей отпечаток не меняет', () => {
    const i = baseInputs()
    const reordered = JSON.parse(
      JSON.stringify({ models: i.models, ...i }),
    ) as typeof i
    expect(fingerprint(reordered)).toBe(fingerprint(BASE))
  })
})

describe('КТ-1: экспорт → файл → импорт даёт ровно эталон (C)', () => {
  const bundle = makeBundle(baseInputs(), { now: NOW })
  const res = roundtrip(asFile(bundle))

  it('файл принимается без ошибок и предупреждений', () => {
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings).toHaveLength(0)
  })

  it('отпечаток после круга совпадает', () => {
    expect(res.ok && res.bundle.fingerprint).toBe(fingerprint(BASE))
  })

  it('расчёт по загруженному набору совпадает с эталоном (C)', () => {
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const c = computeAll(res.bundle.inputs)
    const MAP: Record<string, string> = { M1: 'M1-IR-80', M2: 'M2', M3: 'M3', M4: 'M4', M5: 'M5' }
    for (const id of ['M1', 'M2', 'M3', 'M4', 'M5']) {
      const m = c.models.find((x) => x.meta.id === id)!
      expect(m.blockers, `${id} не должна быть заблокирована`).toHaveLength(0)
      expect(Math.abs(m.result.netResult - REF_C[MAP[id]].net)).toBeLessThanOrEqual(TOL_MONEY)
    }
  })

  it('отличий от текущего набора нет — применять нечего', () => {
    expect(res.ok && diffInputs(BASE, res.bundle.inputs)).toHaveLength(0)
  })

  it('имя файла с датой выгрузки', () => {
    expect(bundleFilename(NOW)).toBe('bdr-params-2026-08-03.json')
  })

  it('в выгрузке есть версия схемы, версия сборки, дата и месяц ставок', () => {
    expect(bundle.schemaVersion).toBe(SCHEMA_VERSION)
    expect(bundle.appVersion).toBeTruthy()
    expect(bundle.exportedAt).toBe(NOW)
    expect(bundle.ratesMonth).toBe(BASE.dutySunOil.month)
  })
})

describe('ФОТ уезжает в файл только по явной галочке', () => {
  const payroll = { project: 1234, total: 5678, enteredAt: NOW }

  it('без галочки поля payroll в файле нет вовсе', () => {
    const b = makeBundle(baseInputs(), { now: NOW })
    expect('payroll' in b).toBe(false)
    expect(asFile(b)).not.toContain('1234')
  })

  it('с галочкой ФОТ выгружается и читается обратно', () => {
    const b = makeBundle(baseInputs(), { now: NOW, payroll })
    const res = roundtrip(asFile(b))
    expect(res.ok && res.bundle.payroll).toEqual(payroll)
  })
})

describe('Битый или чужой файл: понятная ошибка, ничего не применяется', () => {
  const bad = (text: string) => {
    const r = parseBundle(text)
    expect(r.ok).toBe(false)
    return r.ok ? [] : r.errors
  }

  it('не JSON', () => {
    expect(bad('{это не json')[0]).toContain('не читается как JSON')
  })

  it('JSON, но не набор параметров', () => {
    expect(bad('{"a":1}')[0]).toContain('не файл параметров')
  })

  it('другая версия схемы', () => {
    const b = makeBundle(baseInputs(), { now: NOW })
    const text = asFile({ ...b, schemaVersion: 99 })
    expect(bad(text)[0]).toContain('Версия формата 99')
  })

  it('неполный набор — назван недостающий раздел', () => {
    const b = makeBundle(baseInputs(), { now: NOW })
    const broken = JSON.parse(asFile(b))
    delete broken.inputs.models.M3
    const errs = bad(JSON.stringify(broken))
    expect(errs[0]).toContain('Набор неполный')
    expect(errs.join(' ')).toContain('models.M3')
  })

  it('нет отдельного поля — тоже отказ', () => {
    const b = makeBundle(baseInputs(), { now: NOW })
    const broken = JSON.parse(asFile(b))
    delete broken.inputs.moneyRate
    expect(bad(JSON.stringify(broken)).join(' ')).toContain('moneyRate')
  })

  it('значение вне допустимого диапазона', () => {
    const i = baseInputs()
    i.fxCny.value = 500
    const errs = bad(asFile(makeBundle(i, { now: NOW })))
    expect(errs[0]).toContain('вне допустимых границ')
    expect(errs.join(' ')).toContain('fxCny.value')
  })

  it('выход больше единицы не принимается', () => {
    const i = baseInputs()
    i.models.M2.yieldOil = 1.4
    expect(bad(asFile(makeBundle(i, { now: NOW }))).join(' ')).toContain('models.M2.yieldOil')
  })

  it('месяц не вида ГГГГ-ММ не принимается', () => {
    const i = baseInputs()
    i.currentMonth = 'август'
    expect(bad(asFile(makeBundle(i, { now: NOW }))).join(' ')).toContain('currentMonth')
  })
})

describe('Правка файла руками видна', () => {
  it('несовпадение отпечатка — предупреждение, но набор годен', () => {
    const b = makeBundle(baseInputs(), { now: NOW })
    const edited = JSON.parse(asFile(b))
    edited.inputs.fxCny.value = 12.5 // цифру поменяли, отпечаток в файле остался прежним
    const res = parseBundle(JSON.stringify(edited))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings[0]).toContain('правили вручную')
    expect(res.bundle.fingerprint).not.toBe(b.fingerprint)
  })
})

describe('Сравнение до применения', () => {
  it('перечисляет ровно изменённые поля со старым и новым значением', () => {
    const next = baseInputs()
    next.fxCny.value = 12
    next.models.M5.purchaseWithVat = 28000

    const d = diffInputs(BASE, next)
    expect(d.map((x) => x.path).sort()).toEqual([
      'fxCny.value',
      'models.M5.purchaseWithVat',
    ])
    const fx = d.find((x) => x.path === 'fxCny.value')!
    expect(fx.from).toBe(11.5)
    expect(fx.to).toBe(12)
  })

  it('отметки времени и происхождения отличиями не считаются', () => {
    const next = baseInputs()
    next.fxCny.at = '2027-05-05T00:00:00.000Z'
    next.fxCny.origin = 'file'
    expect(diffInputs(BASE, next)).toHaveLength(0)
  })

  it('поля названы по-русски, а не путями', () => {
    expect(labelFor('fxCny.value')).toBe('курс CNY/RUB')
    expect(labelFor('models.M5.purchaseWithVat')).toBe('режим · M5 · закуп сырья, ₽/т')
    expect(labelFor('contracts.sunOil.value')).toBe('контракт · подсолн. масло')
    expect(labelFor('dutySunOil.month')).toBe('пошлина МСХ · подсолн. масло · месяц действия')
  })
})

describe('Месяц ставок из файла', () => {
  it('в выгрузке сохраняется месяц действия ставок МСХ', () => {
    const i = baseInputs()
    i.dutySunOil.month = '2026-07'
    i.dutySunMeal.month = '2026-07'
    const b = makeBundle(i, { now: NOW })
    expect(b.ratesMonth).toBe('2026-07')

    const res = parseBundle(asFile(b))
    expect(res.ok && res.bundle.ratesMonth).toBe('2026-07')
  })

  it('просроченный месяц импорт не запрещает, но блокировки срабатывают', () => {
    const i = baseInputs()
    i.dutySunOil.month = '2026-07'
    i.dutySunMeal.month = '2026-07'
    const res = parseBundle(asFile(makeBundle(i, { now: NOW })))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const blocked = computeAll(res.bundle.inputs)
      .models.filter((m) => m.blockers.length > 0)
      .map((m) => m.meta.id)
    expect(blocked.sort()).toEqual(['M2', 'M5'])
  })
})
