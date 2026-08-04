/**
 * Разговор с хранилищем на сервере.
 *
 * АДРЕС СЕРВИСА В КОД НЕ ЗАШИТ. Он берётся из переменной сборки, а если её
 * не задали — из настройки в браузере. В публичном репозитории адреса нет
 * и быть не должно.
 *
 * Ни один вызов отсюда не бросает исключение наружу: недоступный сервер —
 * это штатное состояние пульта, а не сбой. Возвращается разобранный результат,
 * и приложение продолжает работать на локальных данных.
 */

import type { Inputs } from './inputs'

const KEY = 'bdr-pult:api:v1'

export interface ApiConfig {
  /** Полный адрес до сервиса, включая путевой префикс. Пусто — работаем локально. */
  base: string
  user: string
  /**
   * Пароль basic auth. Хранится в браузере владельца: браузер не умеет
   * подставлять basic auth в межсайтовый fetch сам. Это осознанный размен,
   * записан в ОГРАНИЧЕНИЯ.md.
   */
  pass: string
}

const EMPTY: ApiConfig = { base: '', user: '', pass: '' }

const BUILT_IN_BASE = typeof __API_BASE__ === 'string' ? __API_BASE__ : ''

export function loadApiConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY, base: BUILT_IN_BASE }
    const p = JSON.parse(raw) as Partial<ApiConfig>
    return {
      base: typeof p.base === 'string' && p.base ? p.base : BUILT_IN_BASE,
      user: typeof p.user === 'string' ? p.user : '',
      pass: typeof p.pass === 'string' ? p.pass : '',
    }
  } catch {
    return { ...EMPTY, base: BUILT_IN_BASE }
  }
}

export function saveApiConfig(c: ApiConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* приватный режим браузера */
  }
}

export const isConfigured = (c: ApiConfig) => c.base.trim() !== ''

// ─────────────────────────────────────────────── Результат вызова

export type Fail =
  /** До сервера не достучались: он выключен, сети нет, домен не отвечает. */
  | { ok: false; reason: 'offline'; message: string }
  /** Логин или пароль не подошли. */
  | { ok: false; reason: 'auth'; message: string }
  /** Набор изменён с другого компьютера — решать человеку. */
  | { ok: false; reason: 'conflict'; server: ServerParams; message: string }
  /** Сервер ответил отказом: не принял данные или сломался. */
  | { ok: false; reason: 'server'; message: string; details?: string[] }

export type Result<T> = { ok: true; data: T } | Fail

export interface ServerParams {
  inputs: Inputs | null
  fingerprint: string | null
  revision: number
  updatedAt: string | null
}

export interface SavedParams {
  fingerprint: string
  revision: number
  updatedAt: string
}

export interface FxRate {
  value: number
  rateDate: string
  source: 'moex' | 'cbr'
  fetchedAt: string
}

/** Одна строка списка журнала — без полного тела расчёта. */
export interface JournalRow {
  id: string
  at: string
  auto: boolean
  comment: string
  fingerprint: string
  leader: { id: string; net: number } | null
  results: { id: string; net: number }[] | null
  blocked: string[]
}

const TIMEOUT_MS = 12000

async function call<T>(c: ApiConfig, method: string, path: string, body?: unknown): Promise<Result<T>> {
  if (!isConfigured(c)) {
    return { ok: false, reason: 'offline', message: 'Адрес сервера не задан — работаю локально.' }
  }
  const url = c.base.replace(/\/+$/, '') + path

  let res: Response
  try {
    res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(c.user ? { Authorization: `Basic ${btoa(unescape(encodeURIComponent(`${c.user}:${c.pass}`)))}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, reason: 'offline', message: 'Сервер не отвечает.' }
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'auth', message: 'Сервер не принял логин или пароль.' }
  }

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    return { ok: false, reason: 'server', message: `Сервер ответил ${res.status} без разбираемого тела.` }
  }

  if (res.status === 409) {
    const p = payload as { server: ServerParams }
    return {
      ok: false,
      reason: 'conflict',
      server: p.server,
      message: 'Набор параметров изменён с другого компьютера.',
    }
  }

  if (!res.ok) {
    const p = payload as { error?: string; details?: string[] }
    return {
      ok: false,
      reason: 'server',
      message: p.error ?? `Сервер ответил ${res.status}.`,
      details: p.details,
    }
  }

  return { ok: true, data: payload as T }
}

// ─────────────────────────────────────────────── Операции

export const apiHealth = (c: ApiConfig) => call<{ ok: boolean; at: string }>(c, 'GET', '/health')

export const apiGetParams = (c: ApiConfig) => call<ServerParams>(c, 'GET', '/params')

export const apiPutParams = (
  c: ApiConfig,
  p: { inputs: Inputs; fingerprint: string; baseRevision: number; force?: boolean },
) => call<SavedParams>(c, 'PUT', '/params', p)

export const apiListJournal = (c: ApiConfig) =>
  call<{ entries: JournalRow[] }>(c, 'GET', '/journal')

export const apiGetEntry = (c: ApiConfig, id: string) =>
  call<Record<string, unknown>>(c, 'GET', `/journal/${encodeURIComponent(id)}`)

export const apiPostEntry = (c: ApiConfig, entry: unknown) =>
  call<{ id: string; duplicate: boolean }>(c, 'POST', '/journal', entry)

export const apiDeleteEntry = (c: ApiConfig, id: string) =>
  call<{ deleted: string }>(c, 'DELETE', `/journal/${encodeURIComponent(id)}`)

export const apiGetFx = (c: ApiConfig) =>
  call<{ rates: Partial<Record<'CNY' | 'USD', FxRate>> }>(c, 'GET', '/fx')

/** Ставка пошлины, сведённая сервером из вторичных источников. */
export interface DutyRate {
  month: string
  product: 'oil' | 'meal'
  rate: number
  /** Каналы, подтвердившие именно это значение. */
  sources: string[]
  status: 'confirmed' | 'single' | 'disputed'
  /** Все встреченные значения — спор не прячется. */
  variants: { rate: number; sources: string[] }[]
  firstSeenAt: string
  previousRate: number | null
  history: number[]
  alarm: boolean
  alarmBasis: 'double' | 'history' | null
  alarmMessage: string
  autoApply: boolean
  needsHuman: boolean
}

export const apiGetDuties = (c: ApiConfig) =>
  call<{ rates: DutyRate[]; scannedAt: string; note: string }>(c, 'GET', '/duties')
