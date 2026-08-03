/**
 * Синхронизация с хранилищем на сервере.
 *
 * Правило одно: НИЧЕГО НЕ ЗАТИРАТЬ МОЛЧА. Если и на сервере, и здесь цифры
 * менялись с момента последнего обмена — пульт не выбирает за человека,
 * а показывает оба состояния со временем правки и спрашивает.
 *
 * localStorage остаётся кэшем: при недоступном сервере пульт продолжает
 * считать на локальных данных и честно говорит, что не сохраняет.
 */

import { fingerprint } from './transfer'
import { BASE, type Inputs } from './inputs'
import type { ServerParams } from './api'

/** Что этот браузер в последний раз успешно обменял с сервером. */
export interface SyncMark {
  revision: number
  fingerprint: string
}

const KEY = 'bdr-pult:synced:v1'

export function loadMark(): SyncMark | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<SyncMark>
    if (typeof p.revision !== 'number' || typeof p.fingerprint !== 'string') return null
    return { revision: p.revision, fingerprint: p.fingerprint }
  } catch {
    return null
  }
}

export function saveMark(m: SyncMark | null): void {
  try {
    if (m === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* приватный режим браузера */
  }
}

// ─────────────────────────────────────────────── Решение при загрузке

export type LoadDecision =
  /** Сервер пуст или отстал от нас — отправляем своё. */
  | { kind: 'push' }
  /** Здесь ничего не меняли, а на сервере новее — берём серверное. */
  | { kind: 'adopt' }
  /** Цифры и там и там одни — только запоминаем ревизию. */
  | { kind: 'idle' }
  /** Меняли с двух сторон и цифры разные — решает человек. */
  | { kind: 'conflict' }

/**
 * Чистое решение: что делать с тем, что пришло с сервера.
 *
 * @param server   что лежит на сервере
 * @param mark     что этот браузер обменял в последний раз, `null` — никогда
 * @param localFp  отпечаток набора, который сейчас в пульте
 */
export function decideOnLoad(
  server: ServerParams,
  mark: SyncMark | null,
  localFp: string,
): LoadDecision {
  // На сервере пусто — там ещё ничего не заводили, отдаём своё.
  if (server.revision === 0 || server.inputs === null) return { kind: 'push' }

  // Цифры совпали — спорить не о чем, чем бы дело ни кончилось раньше.
  if (server.fingerprint === localFp) return { kind: 'idle' }

  if (mark === null) {
    // Браузер здесь впервые. Нетронутая база — не «правка», её не жалко:
    // берём серверное. Если же тут уже что-то ввели — это спор.
    return fingerprint(BASE) === localFp ? { kind: 'adopt' } : { kind: 'conflict' }
  }

  const serverMoved = server.revision !== mark.revision
  const localMoved = localFp !== mark.fingerprint

  if (!serverMoved && !localMoved) return { kind: 'idle' }
  if (!serverMoved) return { kind: 'push' }
  if (!localMoved) return { kind: 'adopt' }
  return { kind: 'conflict' }
}

// ─────────────────────────────────────────────── Состояние для экрана

export type SyncStatus =
  /** Адрес сервера не задан — пульт работает как раньше, только локально. */
  | 'off'
  /** Идёт обмен. */
  | 'busy'
  /** Всё сохранено на сервере. */
  | 'online'
  /** Сервера нет: считаем локально, изменения не сохранены. */
  | 'offline'
  /** Логин или пароль не подошли. */
  | 'auth'
  /** Расхождение с другим компьютером, ждём выбора человека. */
  | 'conflict'

export interface ConflictState {
  /** Что сейчас в пульте. */
  mine: { inputs: Inputs; fingerprint: string; at: string | null }
  /** Что лежит на сервере. */
  theirs: { inputs: Inputs; fingerprint: string; at: string | null; revision: number }
}

export interface SyncState {
  status: SyncStatus
  /** Когда в последний раз успешно сохранили на сервер. */
  lastSavedAt: string | null
  message: string
  conflict: ConflictState | null
}

export const INITIAL_SYNC: SyncState = {
  status: 'off',
  lastSavedAt: null,
  message: 'Адрес сервера не задан — работаю локально.',
  conflict: null,
}

/** Короткая подпись для индикатора в шапке. */
export function syncLabel(s: SyncState): string {
  switch (s.status) {
    case 'off': return 'только этот браузер'
    case 'busy': return 'сохраняю…'
    case 'online': return 'сохранено на сервере'
    case 'offline': return 'нет связи, локально'
    case 'auth': return 'нет доступа'
    case 'conflict': return 'расхождение'
  }
}
