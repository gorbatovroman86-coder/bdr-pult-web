/**
 * Журнал расчётов.
 *
 * Главная проверяемая функция — сравнение двух записей: что поменяли
 * во входных данных и как это сдвинуло результат. Ради неё запись хранит
 * весь вход целиком, и это тоже проверяется.
 */

import { describe, expect, it } from 'vitest'
import {
  compareEntries, entryId, journalFilename, journalToCsv, makeEntry, makeJournalBundle,
  mergeJournal, parseJournalBundle, shouldAutoSave,
} from '../src/state/journal'
import { computeAll } from '../src/state/compute'
import { BASE, baseInputs } from '../src/state/inputs'
import { fingerprint } from '../src/state/transfer'
import { REF_C, TOL_MONEY } from '../src/data/references'

const T0 = '2026-08-03T10:00:00.000Z'
const T1 = '2026-08-05T10:00:00.000Z'

const entryAt = (now: string, inputs = baseInputs(), comment = '') =>
  makeEntry(inputs, computeAll(inputs), { now, comment, auto: false })

describe('Запись расчёта', () => {
  const e = entryAt(T0, baseInputs(), 'базовый прогон')

  it('сохраняет результат всех пяти режимов и совпадает с эталоном (C)', () => {
    expect(e.results).toHaveLength(5)
    const m5 = e.results.find((r) => r.id === 'M5')!
    expect(Math.abs(m5.net - REF_C.M5.net)).toBeLessThanOrEqual(TOL_MONEY)
    expect(Math.abs(m5.revenue - REF_C.M5.revenue)).toBeLessThanOrEqual(TOL_MONEY)
  })

  it('запоминает лидера, базис M1 и отпечаток набора', () => {
    expect(e.leader?.id).toBe('M5')
    expect(e.basis?.destination).toBe('IR')
    expect(e.basis?.fx).toBe(80)
    expect(e.fingerprint).toBe(fingerprint(BASE))
  })

  it('хранит весь вход целиком — иначе сравнение невозможно', () => {
    expect(e.inputs.models.M3.yieldKernel).toBe(0.4)
    expect(e.inputs.contracts.sunOil.value).toBe(8550)
  })

  it('ФОТ в запись не попадает', () => {
    expect(JSON.stringify(e)).not.toContain('payroll')
  })

  it('идентификатор сортируется как время и годится для адреса', () => {
    const a = entryId(T0, 'aaaaaaaa')
    const b = entryId(T1, 'bbbbbbbb')
    expect(a < b).toBe(true)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('заблокированные режимы названы вместе с параметром', () => {
    const i = baseInputs()
    i.dutySunOil.month = '2026-07'
    i.dutySunMeal.month = '2026-07'
    const blocked = entryAt(T0, i)
    expect(blocked.blocked.join(' ')).toContain('M2')
    expect(blocked.blocked.join(' ')).toContain('подсолнечное масло')
    expect(blocked.results.find((r) => r.id === 'M2')!.blockedBy).toBeTruthy()
    expect(blocked.results.find((r) => r.id === 'M3')!.blockedBy).toBeNull()
  })
})

describe('Автосохранение раз в сутки', () => {
  const fp = fingerprint(BASE)

  it('первый расчёт записывается сразу', () => {
    expect(shouldAutoSave({ now: T0, lastEntryAt: null, knownFingerprints: [], currentFingerprint: fp }))
      .toBe(true)
  })

  it('уже записанный набор второй раз не пишется никогда', () => {
    expect(shouldAutoSave({ now: T1, lastEntryAt: T0, knownFingerprints: [fp], currentFingerprint: fp }))
      .toBe(false)
  })

  it('в тот же день второй записи не делаем', () => {
    expect(shouldAutoSave({
      now: '2026-08-03T20:00:00.000Z', lastEntryAt: T0,
      knownFingerprints: ['aaaaaaaa'], currentFingerprint: fp,
    })).toBe(false)
  })

  it('через сутки при изменившихся параметрах — пишем', () => {
    expect(shouldAutoSave({
      now: '2026-08-04T10:00:01.000Z', lastEntryAt: T0,
      knownFingerprints: ['aaaaaaaa'], currentFingerprint: fp,
    })).toBe(true)
  })
})

describe('Сравнение двух записей — то, ради чего журнал ведётся', () => {
  const older = entryAt(T0)
  const newerInputs = baseInputs()
  newerInputs.contracts.sunOil.value = 9000
  const newer = entryAt(T1, newerInputs)

  const cmp = compareEntries(older, newer)

  it('называет изменённый параметр со старым и новым значением', () => {
    expect(cmp.inputDiffs).toHaveLength(1)
    expect(cmp.inputDiffs[0].label).toBe('контракт · подсолн. масло')
    expect(cmp.inputDiffs[0].from).toBe(8550)
    expect(cmp.inputDiffs[0].to).toBe(9000)
  })

  it('показывает сдвиг по каждому режиму', () => {
    const m2 = cmp.shifts.find((s) => s.id === 'M2')!
    const m1 = cmp.shifts.find((s) => s.id === 'M1')!
    expect(m2.delta).toBeGreaterThan(0) // подсолнечное масло подорожало
    expect(m1.delta).toBeCloseTo(0, 6) // рапсовый режим не задет
    expect(cmp.shifts).toHaveLength(5)
  })

  it('сдвиг равен разнице сохранённых результатов, а не пересчёту', () => {
    const m2new = newer.results.find((r) => r.id === 'M2')!.net
    const m2old = older.results.find((r) => r.id === 'M2')!.net
    expect(cmp.shifts.find((s) => s.id === 'M2')!.delta).toBeCloseTo(m2new - m2old, 9)
  })
})

describe('Выгрузка журнала', () => {
  const entries = [entryAt(T0, baseInputs(), 'первый'), (() => {
    const i = baseInputs()
    i.fxCny.value = 12
    return entryAt(T1, i, 'курс вырос')
  })()]

  it('CSV: строка на каждый режим каждой записи', () => {
    const csv = journalToCsv(entries)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(1 + entries.length * 5)
    expect(lines[0]).toContain('фин. результат')
  })

  it('CSV начинается с BOM — иначе Excel ломает кириллицу', () => {
    expect(journalToCsv(entries).charCodeAt(0)).toBe(0xfeff)
  })

  it('CSV экранирует точку с запятой в комментарии', () => {
    const tricky = entryAt(T0, baseInputs(), 'цена; и ещё "кавычки"')
    expect(journalToCsv([tricky])).toContain('"цена; и ещё ""кавычки"""')
  })

  it('имена файлов с датой', () => {
    expect(journalFilename(T0, 'json')).toBe('bdr-journal-2026-08-03.json')
    expect(journalFilename(T0, 'csv')).toBe('bdr-journal-2026-08-03.csv')
  })

  it('JSON проходит круг выгрузка → загрузка без потерь', () => {
    const text = JSON.stringify(makeJournalBundle(entries, T1), null, 2)
    const res = parseJournalBundle(text)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.entries).toHaveLength(2)
    expect(res.entries[0].inputs.contracts.sunOil.value).toBe(8550)
  })

  it('чужой или битый файл отклоняется понятной ошибкой', () => {
    expect(parseJournalBundle('{не json').ok).toBe(false)
    expect(parseJournalBundle('{"kind":"другое"}').ok).toBe(false)
    const wrongVersion = JSON.stringify({ ...makeJournalBundle(entries, T1), schemaVersion: 42 })
    const r = parseJournalBundle(wrongVersion)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('42')
  })

  it('неполная запись в файле — отказ целиком, частично не применяем', () => {
    const broken = JSON.parse(JSON.stringify(makeJournalBundle(entries, T1)))
    delete broken.entries[1].inputs
    const r = parseJournalBundle(JSON.stringify(broken))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('запись 2')
  })
})

describe('Слияние журналов без дублей', () => {
  const a = entryAt(T0, baseInputs(), 'первый')
  const bInputs = baseInputs()
  bInputs.fxCny.value = 12
  const b = entryAt(T1, bInputs, 'второй')

  it('та же запись из другого файла не удваивается', () => {
    const r = mergeJournal([a], [a, b])
    expect(r.added).toBe(1)
    expect(r.skipped).toBe(1)
    expect(r.merged).toHaveLength(2)
  })

  it('повторный импорт того же файла ничего не добавляет', () => {
    const once = mergeJournal([], [a, b])
    const twice = mergeJournal(once.merged, [a, b])
    expect(twice.added).toBe(0)
    expect(twice.merged).toHaveLength(2)
  })

  it('после слияния записи идут от свежих к старым', () => {
    const r = mergeJournal([], [a, b])
    expect(r.merged.map((e) => e.at)).toEqual([T1, T0])
  })
})
