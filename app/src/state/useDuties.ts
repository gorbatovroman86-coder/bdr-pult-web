/**
 * Ставки пошлин, собранные сервером из вторичных источников.
 *
 * Применяется САМО только то, что подтверждено двумя и более независимыми
 * источниками и не подняло тревогу сторожа. Всё спорное ждёт человека —
 * молча не применяется ничего.
 *
 * Ставку, введённую руками, автосбор не перебивает.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGetDuties, isConfigured, type ApiConfig, type DutyRate } from './api'
import type { Inputs } from './inputs'

/** Продукт в терминах сборщика → поле пульта. */
export const DUTY_PATH: Record<string, 'dutySunOil' | 'dutySunMeal'> = {
  oil: 'dutySunOil',
  meal: 'dutySunMeal',
}

export const DUTY_LABEL: Record<string, string> = {
  oil: 'подсолнечное масло',
  meal: 'подсолнечный шрот (жмых)',
}

export interface DutiesApi {
  rates: DutyRate[]
  scannedAt: string | null
  note: string
  busy: boolean
  message: string
  available: boolean
  refresh: () => void
  /** Применить конкретную ставку — осознанное действие человека. */
  apply: (r: DutyRate) => void
  /** Ставки за нужный месяц, которых сборщик не нашёл. */
  missing: string[]
}

export function useDuties(
  config: ApiConfig,
  inputs: Inputs,
  setAuto: (path: string, value: number, at: string) => void,
  setMonth: (path: string, month: string) => void,
): DutiesApi {
  const [rates, setRates] = useState<DutyRate[]>([])
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const live = useRef({ config, inputs })
  live.current = { config, inputs }
  const applied = useRef(new Set<string>())

  const apply = useCallback((r: DutyRate) => {
    const path = DUTY_PATH[r.product]
    if (!path) return
    setAuto(path, r.rate, r.firstSeenAt)
    setMonth(`${path}.month`, r.month)
    applied.current.add(`${r.month}|${r.product}|${r.rate}`)
  }, [setAuto, setMonth])

  const refresh = useCallback(async () => {
    const c = live.current.config
    if (!isConfigured(c)) {
      setMessage('Ставки собирает сервер. Адрес не задан — остаётся ручной ввод.')
      return
    }
    setBusy(true)
    const res = await apiGetDuties(c)
    setBusy(false)
    if (!res.ok) {
      setMessage(
        res.reason === 'offline'
          ? 'Сервер не отвечает: показываю последнее, что удалось получить.'
          : res.message,
      )
      return
    }

    // Ответ неожиданной формы не должен ронять экран: ставки — не тот повод,
    // чтобы весь пульт перестал считать.
    const got = Array.isArray(res.data?.rates) ? res.data.rates : []
    setRates(got)
    setScannedAt(typeof res.data?.scannedAt === 'string' ? res.data.scannedAt : null)
    setNote(typeof res.data?.note === 'string' ? res.data.note : '')
    setMessage('')

    // Подставляем сами только бесспорное и только за нужный месяц.
    const i = live.current.inputs
    for (const r of got) {
      if (!r.autoApply || r.month !== i.currentMonth) continue
      const path = DUTY_PATH[r.product]
      if (!path) continue
      const cur = i[path]
      if (cur.origin === 'manual') continue // ручное автосбор не перебивает
      if (cur.value === r.rate && cur.month === r.month) continue
      apply(r)
    }
  }, [apply])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.base, config.user, config.pass])

  // Чего не хватает за нужный месяц — по этому пульт и встаёт.
  const missing = (['oil', 'meal'] as const).filter(
    (p) => !rates.some((r) => r.product === p && r.month === inputs.currentMonth),
  )

  return {
    rates, scannedAt, note, busy, message,
    available: isConfigured(config),
    refresh: () => void refresh(),
    apply,
    missing,
  }
}
