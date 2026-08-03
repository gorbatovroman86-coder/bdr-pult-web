/**
 * Журнал во времени: чтение с сервера, запись, автосохранение раз в сутки.
 *
 * Журнал живёт на сервере — в этом весь смысл: он должен быть виден
 * с любого компьютера. Без связи журнал доступен только на чтение того,
 * что успели загрузить, и об этом говорится прямо.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiDeleteEntry, apiGetEntry, apiListJournal, apiPostEntry, isConfigured,
  type ApiConfig, type JournalRow,
} from './api'
import { makeEntry, shouldAutoSave, type JournalEntry } from './journal'
import type { Inputs } from './inputs'
import type { Computed } from './compute'

export interface JournalApi {
  rows: JournalRow[]
  /** Полные записи, подтянутые по требованию: список их не содержит. */
  full: Record<string, JournalEntry>
  busy: boolean
  message: string
  available: boolean
  refresh: () => void
  load: (id: string) => Promise<JournalEntry | null>
  save: (comment: string, auto?: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Приём записей из файла: те, которых нет, уходят на сервер. */
  importEntries: (entries: JournalEntry[]) => Promise<{ added: number; skipped: number }>
}

export function useJournal(
  config: ApiConfig,
  inputs: Inputs,
  computed: Computed,
  fp: string,
): JournalApi {
  const [rows, setRows] = useState<JournalRow[]>([])
  const [full, setFull] = useState<Record<string, JournalEntry>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const live = useRef({ config, inputs, computed, fp })
  live.current = { config, inputs, computed, fp }
  const autoTried = useRef(false)

  const available = isConfigured(config)

  const refresh = useCallback(async () => {
    const c = live.current.config
    if (!isConfigured(c)) {
      setRows([])
      setMessage('Журнал хранится на сервере. Адрес не задан — журнала нет.')
      return
    }
    setBusy(true)
    const res = await apiListJournal(c)
    setBusy(false)
    if (!res.ok) {
      setMessage(
        res.reason === 'offline'
          ? 'Нет связи с сервером: журнал не загружен.'
          : res.message,
      )
      return
    }
    setRows(res.data.entries)
    setMessage(res.data.entries.length === 0 ? 'Журнал пуст — ни одного расчёта ещё не сохранено.' : '')
  }, [])

  const load = useCallback(async (id: string): Promise<JournalEntry | null> => {
    const c = live.current.config
    const have = full[id]
    if (have) return have
    const res = await apiGetEntry(c, id)
    if (!res.ok) {
      setMessage(res.message)
      return null
    }
    const e = res.data as unknown as JournalEntry
    setFull((f) => ({ ...f, [id]: e }))
    return e
  }, [full])

  const post = useCallback(async (entry: JournalEntry) => {
    const res = await apiPostEntry(live.current.config, entry)
    if (!res.ok) {
      // Сервер отказался принять запись — показываем, что именно ему не понравилось.
      const why = res.reason === 'server' && res.details?.length ? `: ${res.details.join('; ')}` : ''
      setMessage(`${res.message}${why}`)
      return false
    }
    if (res.data.duplicate) {
      setMessage('Такой набор параметров уже записан — второй записи не создаю.')
      return false
    }
    return true
  }, [])

  const save = useCallback(async (comment: string, auto = false) => {
    const { inputs: i, computed: c } = live.current
    if (!isConfigured(live.current.config)) {
      setMessage('Журнал хранится на сервере. Задайте адрес, иначе записывать некуда.')
      return
    }
    setBusy(true)
    const entry = makeEntry(i, c, { now: new Date().toISOString(), comment, auto })
    const ok = await post(entry)
    setBusy(false)
    if (ok) {
      setMessage(auto ? 'Расчёт сохранён автоматически.' : 'Расчёт сохранён.')
      await refresh()
    }
  }, [post, refresh])

  const remove = useCallback(async (id: string) => {
    setBusy(true)
    const res = await apiDeleteEntry(live.current.config, id)
    setBusy(false)
    if (!res.ok) {
      setMessage(res.message)
      return
    }
    setFull((f) => {
      const n = { ...f }
      delete n[id]
      return n
    })
    await refresh()
  }, [refresh])

  const importEntries = useCallback(async (entries: JournalEntry[]) => {
    setBusy(true)
    let added = 0
    let skipped = 0
    for (const e of entries) {
      const res = await apiPostEntry(live.current.config, e)
      if (res.ok && !res.data.duplicate) added++
      else skipped++
    }
    setBusy(false)
    await refresh()
    setMessage(`Из файла добавлено записей: ${added}, пропущено как уже имеющиеся: ${skipped}.`)
    return { added, skipped }
  }, [refresh])

  // Загрузка журнала при подключении к серверу.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.base, config.user, config.pass])

  // Автосохранение раз в сутки — один раз за сеанс, после того как список получен.
  useEffect(() => {
    if (!available || busy || autoTried.current || rows.length === 0) return
    autoTried.current = true
    const need = shouldAutoSave({
      now: new Date().toISOString(),
      lastEntryAt: rows[0]?.at ?? null,
      knownFingerprints: rows.map((r) => r.fingerprint),
      currentFingerprint: live.current.fp,
    })
    if (need) void save('', true)
  }, [available, busy, rows, save])

  return { rows, full, busy, message, available, refresh: () => void refresh(), load, save, remove, importEntries }
}
