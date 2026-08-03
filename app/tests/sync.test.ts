/**
 * Решение при загрузке: брать серверное, отправлять своё или спросить человека.
 *
 * Это самое опасное место всей синхронизации: ошибка здесь молча стирает
 * чужую работу. Поэтому решение вынесено в чистую функцию и разобрано
 * по всем четырём случаям.
 */

import { describe, expect, it } from 'vitest'
import { decideOnLoad } from '../src/state/sync'
import { fingerprint } from '../src/state/transfer'
import { BASE, baseInputs } from '../src/state/inputs'
import type { ServerParams } from '../src/state/api'

const FP_BASE = fingerprint(BASE)

const changed = (v: number) => {
  const i = baseInputs()
  i.fxCny.value = v
  return { inputs: i, fp: fingerprint(i) }
}

const server = (over: Partial<ServerParams> = {}): ServerParams => ({
  inputs: baseInputs(),
  fingerprint: FP_BASE,
  revision: 1,
  updatedAt: '2026-08-03T10:00:00.000Z',
  ...over,
})

describe('Пустой сервер', () => {
  it('заводим его своим набором', () => {
    expect(decideOnLoad(server({ inputs: null, fingerprint: null, revision: 0, updatedAt: null }), null, FP_BASE))
      .toEqual({ kind: 'push' })
  })
})

describe('Цифры совпали — спорить не о чем', () => {
  it('одинаковый отпечаток даёт покой при любой истории', () => {
    expect(decideOnLoad(server(), null, FP_BASE)).toEqual({ kind: 'idle' })
    expect(decideOnLoad(server({ revision: 9 }), { revision: 1, fingerprint: 'ffffffff' }, FP_BASE))
      .toEqual({ kind: 'idle' })
  })
})

describe('Браузер здесь впервые', () => {
  it('нетронутая база уступает серверу', () => {
    const s = changed(12)
    expect(decideOnLoad(server({ inputs: s.inputs, fingerprint: s.fp }), null, FP_BASE))
      .toEqual({ kind: 'adopt' })
  })

  it('но уже введённые здесь цифры молча не стираются', () => {
    const mine = changed(13)
    const theirs = changed(12)
    expect(decideOnLoad(server({ inputs: theirs.inputs, fingerprint: theirs.fp }), null, mine.fp))
      .toEqual({ kind: 'conflict' })
  })
})

describe('Браузер уже обменивался с сервером', () => {
  const mark = { revision: 5, fingerprint: FP_BASE }

  it('ничего не двигалось — покой', () => {
    expect(decideOnLoad(server({ revision: 5 }), mark, FP_BASE)).toEqual({ kind: 'idle' })
  })

  it('правили только здесь — отправляем своё', () => {
    const mine = changed(13)
    expect(decideOnLoad(server({ revision: 5 }), mark, mine.fp)).toEqual({ kind: 'push' })
  })

  it('правили только там — берём серверное', () => {
    const theirs = changed(12)
    expect(decideOnLoad(server({ revision: 6, inputs: theirs.inputs, fingerprint: theirs.fp }), mark, FP_BASE))
      .toEqual({ kind: 'adopt' })
  })

  it('правили с двух сторон и цифры разные — решает человек', () => {
    const mine = changed(13)
    const theirs = changed(12)
    expect(decideOnLoad(server({ revision: 6, inputs: theirs.inputs, fingerprint: theirs.fp }), mark, mine.fp))
      .toEqual({ kind: 'conflict' })
  })

  it('правили с двух сторон, но пришли к одному — спора нет', () => {
    const same = changed(12)
    expect(decideOnLoad(server({ revision: 6, inputs: same.inputs, fingerprint: same.fp }), mark, same.fp))
      .toEqual({ kind: 'idle' })
  })
})
