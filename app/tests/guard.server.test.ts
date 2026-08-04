/**
 * Защита сервиса: частота обращений и «закрыто по умолчанию».
 *
 * Отдельно оговорено, чего эти проверки НЕ делают: перебор пароля идёт
 * на caddy и до сервиса не доходит. Здесь закрываются поток запросов
 * от того, кто пароль знает, и молчаливое открытие сервиса при ошибке
 * в конфиге caddy.
 */

import { describe, expect, it } from 'vitest'
// @ts-expect-error — серверные модули на чистом JS, типов у них нет намеренно
import { clientKey, createRateLimiter, hasAuth, needsAuthHeader } from '../../server/src/guard.mjs'

describe('Ограничение частоты обращений', () => {
  it('обычная работа пульта под ограничение не попадает', () => {
    const l = createRateLimiter({ limit: 120, windowMs: 60_000 })
    for (let n = 0; n < 60; n++) {
      expect(l.check('1.2.3.4', 1000 + n * 100).allowed).toBe(true)
    }
  })

  it('поток сверх предела отсекается', () => {
    const l = createRateLimiter({ limit: 5, windowMs: 1000 })
    for (let n = 0; n < 5; n++) expect(l.check('1.2.3.4', 100).allowed).toBe(true)
    expect(l.check('1.2.3.4', 100).allowed).toBe(false)
  })

  it('через окно счётчик отпускает', () => {
    const l = createRateLimiter({ limit: 2, windowMs: 1000 })
    l.check('1.2.3.4', 0)
    l.check('1.2.3.4', 0)
    expect(l.check('1.2.3.4', 0).allowed).toBe(false)
    expect(l.check('1.2.3.4', 2000).allowed).toBe(true)
  })

  it('один нарушитель не мешает остальным', () => {
    const l = createRateLimiter({ limit: 2, windowMs: 1000 })
    l.check('шумный', 0)
    l.check('шумный', 0)
    expect(l.check('шумный', 0).allowed).toBe(false)
    expect(l.check('тихий', 0).allowed).toBe(true)
  })

  it('память не растёт бесконечно — забытые адреса вычищаются', () => {
    const l = createRateLimiter({ limit: 10, windowMs: 1000 })
    for (let n = 0; n < 50; n++) l.check(`адрес-${n}`, 0)
    expect(l.size()).toBe(50)
    l.check('свежий', 5000)
    expect(l.size()).toBe(1)
  })
})

describe('Адрес обращающегося', () => {
  it('за caddy берётся первый в цепочке, дописанному дальше веры нет', () => {
    expect(clientKey({ 'x-forwarded-for': '203.0.113.7, 172.18.0.5' }, '172.18.0.5'))
      .toBe('203.0.113.7')
  })

  it('без заголовка — адрес сокета', () => {
    expect(clientKey({}, '172.18.0.5')).toBe('172.18.0.5')
  })

  it('неизвестный адрес не роняет проверку', () => {
    expect(clientKey({}, undefined)).toBe('неизвестен')
  })
})

describe('Закрыто по умолчанию', () => {
  it('запрос к данным без авторизации недопустим', () => {
    expect(needsAuthHeader('GET', '/params')).toBe(true)
    expect(needsAuthHeader('POST', '/journal')).toBe(true)
    expect(hasAuth({})).toBe(false)
  })

  it('предварительный запрос браузера авторизации не несёт по устройству', () => {
    expect(needsAuthHeader('OPTIONS', '/params')).toBe(false)
  })

  it('проверка здоровья открыта — данных она не отдаёт', () => {
    expect(needsAuthHeader('GET', '/health')).toBe(false)
  })

  it('заголовок с авторизацией распознаётся', () => {
    expect(hasAuth({ authorization: 'Basic abc' })).toBe(true)
    expect(hasAuth({ authorization: '   ' })).toBe(false)
  })
})
