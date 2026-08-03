/**
 * Курсы валют: их тянет сервер, приложение забирает готовое.
 *
 * Подтянутый курс подставляется ТОЛЬКО туда, где значение до сих пор было
 * автоматическим. Введённое руками не трогается никогда: подменённый курс
 * не должен выдаваться за официальный — ни в расчёте, ни на экране.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGetFx, isConfigured, type ApiConfig, type FxRate } from './api'
import type { Inputs } from './inputs'

export type FxCode = 'CNY' | 'USD'

export interface FxApi {
  rates: Partial<Record<FxCode, FxRate>>
  /** Когда в последний раз удалось получить курсы с сервера. */
  fetchedAt: string | null
  busy: boolean
  message: string
  refresh: () => void
}

/** Курс считается несвежим через сутки — тогда о возрасте говорим вслух. */
const STALE_MS = 24 * 60 * 60 * 1000

export function isStale(r: FxRate | undefined, now = Date.now()): boolean {
  if (!r) return false
  const t = Date.parse(r.fetchedAt)
  return Number.isFinite(t) && now - t > STALE_MS
}

export const SOURCE_LABEL: Record<string, string> = {
  moex: 'Мосбиржа',
  cbr: 'ЦБ РФ',
}

const PATH: Record<FxCode, string> = { CNY: 'fxCny', USD: 'fxUsd' }

export function useFx(
  config: ApiConfig,
  inputs: Inputs,
  setAuto: (path: string, value: number, at: string) => void,
): FxApi {
  const [rates, setRates] = useState<Partial<Record<FxCode, FxRate>>>({})
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const live = useRef({ config, inputs })
  live.current = { config, inputs }

  const refresh = useCallback(async () => {
    const c = live.current.config
    if (!isConfigured(c)) {
      setMessage('Курсы тянет сервер. Адрес не задан — курсы вводятся вручную.')
      return
    }
    setBusy(true)
    const res = await apiGetFx(c)
    setBusy(false)

    if (!res.ok) {
      // Последнее полученное значение остаётся на экране с отметкой возраста.
      setMessage(
        res.reason === 'offline'
          ? 'Сервер не отвечает: показываю последний полученный курс.'
          : res.message,
      )
      return
    }

    setRates(res.data.rates)
    setFetchedAt(new Date().toISOString())
    setMessage('')

    // Подставляем только там, где курс не подменён вручную.
    for (const code of ['CNY', 'USD'] as FxCode[]) {
      const r = res.data.rates[code]
      if (!r) continue
      const cur = live.current.inputs[PATH[code] as 'fxCny' | 'fxUsd']
      if (cur.origin === 'manual') continue
      if (cur.value === r.value) continue
      setAuto(PATH[code], r.value, r.fetchedAt)
    }
  }, [setAuto])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.base, config.user, config.pass])

  return { rates, fetchedAt, busy, message, refresh: () => void refresh() }
}
