/**
 * Живая часть синхронизации: обмен с сервером во времени.
 *
 * Решение «что делать» принимает чистая `decideOnLoad` из sync.ts — здесь
 * только выполнение: когда спросить, когда отправить, когда замолчать
 * и подождать. Кнопки «сохранить» нет: правка уходит на сервер сама.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiGetParams, apiPutParams, isConfigured, loadApiConfig, saveApiConfig, type ApiConfig,
} from './api'
import {
  INITIAL_SYNC, decideOnLoad, loadMark, saveMark,
  type ConflictState, type SyncMark, type SyncState,
} from './sync'
import type { Inputs } from './inputs'

/** Пауза после последней правки, чтобы не слать запрос на каждую цифру. */
const DEBOUNCE_MS = 800
/** Как часто пробовать достучаться, пока связи нет. */
const RETRY_MS = 60000

export interface SyncApi {
  config: ApiConfig
  setConfig: (c: ApiConfig) => void
  state: SyncState
  /** Проверить связь и подтянуть серверное состояние прямо сейчас. */
  refresh: () => void
  /** Выбор человека при расхождении. */
  resolveConflict: (keep: 'mine' | 'theirs') => void
}

export function useServerSync(
  inputs: Inputs,
  fp: string,
  applyInputs: (i: Inputs) => void,
  touchedAt: string | null,
): SyncApi {
  const [config, setConfigState] = useState<ApiConfig>(loadApiConfig)
  const [state, setState] = useState<SyncState>(INITIAL_SYNC)

  const markRef = useRef<SyncMark | null>(loadMark())
  // Свежие значения для отложенных вызовов: замыкание таймера не должно
  // отправить на сервер устаревший набор.
  const liveRef = useRef({ inputs, fp, config, touchedAt })
  liveRef.current = { inputs, fp, config, touchedAt }

  const setMark = (m: SyncMark | null) => {
    markRef.current = m
    saveMark(m)
  }

  /** Отправка набора. `force` — осознанное «оставить моё» при расхождении. */
  const push = useCallback(async (force = false, baseRevision?: number) => {
    const { inputs: i, fp: f, config: c } = liveRef.current
    if (!isConfigured(c)) return
    setState((s) => ({ ...s, status: 'busy' }))

    const res = await apiPutParams(c, {
      inputs: i,
      fingerprint: f,
      baseRevision: baseRevision ?? markRef.current?.revision ?? 0,
      force,
    })

    if (res.ok) {
      setMark({ revision: res.data.revision, fingerprint: res.data.fingerprint })
      setState({
        status: 'online',
        lastSavedAt: res.data.updatedAt,
        message: 'Изменения сохранены на сервере.',
        conflict: null,
      })
      return
    }

    if (res.reason === 'conflict' && res.server.inputs !== null) {
      const theirs = {
        inputs: res.server.inputs,
        fingerprint: res.server.fingerprint ?? '—',
        at: res.server.updatedAt,
        revision: res.server.revision,
      }
      const mine = { inputs: i, fingerprint: f, at: liveRef.current.touchedAt }
      setState((s) => ({
        status: 'conflict',
        lastSavedAt: s.lastSavedAt,
        message: res.message,
        conflict: { mine, theirs },
      }))
      return
    }

    setState((s) => ({
      ...s,
      status: res.reason === 'auth' ? 'auth' : res.reason === 'offline' ? 'offline' : 'online',
      message:
        res.reason === 'server'
          ? `Сервер не принял набор: ${res.message}`
          : res.message,
    }))
  }, [])

  const refresh = useCallback(async () => {
    const { config: c, fp: f, inputs: i, touchedAt: t } = liveRef.current
    if (!isConfigured(c)) {
      setState(INITIAL_SYNC)
      return
    }
    setState((s) => ({ ...s, status: 'busy' }))

    const res = await apiGetParams(c)
    if (!res.ok) {
      setState((s) => ({
        ...s,
        status: res.reason === 'auth' ? 'auth' : 'offline',
        message:
          res.reason === 'auth'
            ? res.message
            : 'Нет связи с сервером: работаю локально, изменения не сохранены.',
      }))
      return
    }

    const server = res.data
    const decision = decideOnLoad(server, markRef.current, f)

    if (decision.kind === 'push') {
      await push(false, server.revision)
      return
    }

    if (decision.kind === 'adopt' && server.inputs) {
      applyInputs(server.inputs)
      setMark({ revision: server.revision, fingerprint: server.fingerprint ?? f })
      setState({
        status: 'online',
        lastSavedAt: server.updatedAt,
        message: 'Взят набор с сервера — здесь он не менялся.',
        conflict: null,
      })
      return
    }

    if (decision.kind === 'idle') {
      setMark({ revision: server.revision, fingerprint: f })
      setState({
        status: 'online',
        lastSavedAt: server.updatedAt,
        message: 'Набор совпадает с серверным.',
        conflict: null,
      })
      return
    }

    setState({
      status: 'conflict',
      lastSavedAt: server.updatedAt,
      message: 'Набор менялся и здесь, и на другом компьютере.',
      conflict: {
        mine: { inputs: i, fingerprint: f, at: t },
        theirs: {
          inputs: server.inputs!,
          fingerprint: server.fingerprint ?? '—',
          at: server.updatedAt,
          revision: server.revision,
        },
      },
    })
  }, [applyInputs, push])

  const resolveConflict = useCallback((keep: 'mine' | 'theirs') => {
    setState((s) => {
      const c: ConflictState | null = s.conflict
      if (!c) return s
      if (keep === 'mine') {
        void push(true, c.theirs.revision)
      } else {
        applyInputs(c.theirs.inputs)
        setMark({ revision: c.theirs.revision, fingerprint: c.theirs.fingerprint })
      }
      return keep === 'theirs'
        ? {
            status: 'online',
            lastSavedAt: c.theirs.at,
            message: 'Взят набор с другого компьютера.',
            conflict: null,
          }
        : { ...s, status: 'busy', conflict: null }
    })
  }, [applyInputs, push])

  const setConfig = useCallback((c: ApiConfig) => {
    saveApiConfig(c)
    setConfigState(c)
    // Другой адрес или другой пользователь — прежняя отметка обмена
    // к новому хранилищу отношения не имеет.
    setMark(null)
  }, [])

  // Первый обмен и повтор при смене настроек подключения.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.base, config.user, config.pass])

  // Правка уходит на сервер сама, с паузой на «дописать число».
  useEffect(() => {
    if (!isConfigured(config)) return
    if (state.status === 'conflict' || state.status === 'auth') return
    // Ровно то, что уже лежит на сервере, отправлять незачем.
    if (markRef.current?.fingerprint === fp) return

    const t = setTimeout(() => void push(), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [fp, config, state.status, push])

  // Пока связи нет — тихо пробуем снова; вернулась сеть — пробуем сразу.
  useEffect(() => {
    if (state.status !== 'offline') return
    const t = setInterval(() => void refresh(), RETRY_MS)
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', onOnline)
    }
  }, [state.status, refresh])

  return { config, setConfig, state, refresh: () => void refresh(), resolveConflict }
}
