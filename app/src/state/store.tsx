/**
 * Хранилище пульта. Один провайдер на всё приложение.
 *
 * Любая правка входных данных немедленно пересчитывает все пять моделей:
 * результат — производная от `inputs`, отдельного состояния у него нет,
 * поэтому рассинхрон «поменяли параметр, а число осталось» невозможен.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BASE, changedPaths, clearInputs, isFieldChanged, loadInputs, loadTouchedAt,
  resetToBaseKeepingMarket, saveInputs, saveTouchedAt,
  type Inputs,
} from './inputs'
import { computeAll, type Computed } from './compute'
import { fingerprint } from './transfer'
import { useServerSync, type SyncApi } from './useSync'
import { useJournal, type JournalApi } from './useJournal'
import { useFx, type FxApi } from './useFx'
import { useDuties, type DutiesApi } from './useDuties'
import { EMPTY_PAYROLL, loadPayroll, savePayroll, type Payroll } from '../data/payroll'

interface Store {
  inputs: Inputs
  computed: Computed
  /** Точечная правка по пути: 'fxCny.value', 'models.M3.yieldKernel'. */
  set: (path: string, value: number | string | null) => void
  /** Вернуть всё к базовым значениям — ровно эталон (C). */
  resetAll: () => void
  /** Вернуть одно поле к базовому значению. */
  resetField: (path: string) => void
  /** Заменить набор целиком — применение файла параметров. */
  applyInputs: (next: Inputs) => void
  /**
   * Подставить значение, полученное автоматически. Отдельно от `set`:
   * `set` помечает правку как ручную, а подтянутый курс ручным не является.
   */
  setAuto: (path: string, value: number, at: string) => void
  /** Список изменённых полей. */
  changed: string[]
  isChangedField: (path: string) => boolean
  /** Отпечаток действующего набора, 8 знаков: на одних ли цифрах считаем. */
  fingerprint: string
  /** Когда набор меняли в последний раз, ISO. `null` — база не тронута. */
  touchedAt: string | null
  /** ФОТ живёт отдельно: своё хранилище и свой сброс — общий сброс его не трогает. */
  payroll: Payroll
  setPayroll: (field: 'project' | 'total', value: number | null) => void
  setPayrollAll: (p: Payroll) => void
  resetPayroll: () => void
  /** Обмен с хранилищем на сервере: состояние, настройки, разрешение расхождений. */
  sync: SyncApi
  /** Журнал расчётов — тоже на сервере. */
  journal: JournalApi
  /** Курсы валют, подтянутые сервером. */
  fx: FxApi
  /** Ставки пошлин, собранные сервером из вторичных источников. */
  duties: DutiesApi
}

const Ctx = createContext<Store | null>(null)

function setPath(obj: Inputs, path: string, value: unknown): Inputs {
  const keys = path.split('.')
  const next = structuredClone(obj) as unknown as Record<string, unknown>
  let cur: Record<string, unknown> = next
  for (let k = 0; k < keys.length - 1; k++) {
    cur[keys[k]] = { ...(cur[keys[k]] as Record<string, unknown>) }
    cur = cur[keys[k]] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  return next as unknown as Inputs
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], obj)
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState<Inputs>(loadInputs)
  const [touchedAt, setTouchedAt] = useState<string | null>(loadTouchedAt)

  useEffect(() => {
    saveInputs(inputs)
  }, [inputs])

  useEffect(() => {
    saveTouchedAt(touchedAt)
  }, [touchedAt])

  const touch = useCallback(() => setTouchedAt(new Date().toISOString()), [])

  const set = useCallback((path: string, value: number | string | null) => {
    touch()
    setInputs((prev) => {
      let next = setPath(prev, path, value)
      // Ручная правка помечает происхождение и время — курс перестаёт быть «авто».
      const parent = path.split('.').slice(0, -1).join('.')
      const leaf = path.split('.').at(-1)
      if (leaf === 'value' && parent) {
        const node = getPath(next, parent) as Record<string, unknown> | undefined
        if (node && 'origin' in node) {
          next = setPath(next, `${parent}.origin`, 'manual')
          next = setPath(next, `${parent}.at`, new Date().toISOString())
        }
      }
      return next
    })
  }, [touch])

  /**
   * Сброс возвращает к эталону (C) ПАРАМЕТРЫ МОДЕЛИ. Курсы и ставки пошлин
   * остаются: это данные месяца, а в базе на их месте лежит реконструкция
   * эталона. Иначе сброс молча вернул бы расчёт к вымышленным ставкам.
   */
  const resetAll = useCallback(() => {
    clearInputs()
    setInputs((prev) => resetToBaseKeepingMarket(prev))
    setTouchedAt(null)
  }, [])

  const resetField = useCallback((path: string) => {
    touch()
    setInputs((prev) => setPath(prev, path, getPath(BASE, path)))
  }, [touch])

  /** Применение файла целиком: набор либо заменяется весь, либо не трогается. */
  const applyInputs = useCallback((next: Inputs) => {
    touch()
    setInputs(structuredClone(next))
  }, [touch])

  const setAuto = useCallback((path: string, value: number, at: string) => {
    touch()
    setInputs((prev) => {
      let next = setPath(prev, `${path}.value`, value)
      next = setPath(next, `${path}.origin`, 'auto')
      return setPath(next, `${path}.at`, at)
    })
  }, [touch])

  const [payroll, setPayrollState] = useState<Payroll>(loadPayroll)
  useEffect(() => {
    savePayroll(payroll)
  }, [payroll])

  const setPayroll = useCallback((field: 'project' | 'total', value: number | null) => {
    setPayrollState((p) => ({ ...p, [field]: value, enteredAt: new Date().toISOString() }))
  }, [])
  const setPayrollAll = useCallback((p: Payroll) => setPayrollState({ ...p }), [])
  const resetPayroll = useCallback(() => setPayrollState({ ...EMPTY_PAYROLL }), [])

  const computed = useMemo(() => computeAll(inputs), [inputs])
  const changed = useMemo(() => changedPaths(inputs), [inputs])
  const isChangedField = useCallback((p: string) => isFieldChanged(inputs, p), [inputs])
  const fp = useMemo(() => fingerprint(inputs), [inputs])

  const sync = useServerSync(inputs, fp, applyInputs, touchedAt)
  const journal = useJournal(sync.config, inputs, computed, fp)
  const fx = useFx(sync.config, inputs, setAuto)
  const duties = useDuties(sync.config, inputs, setAuto, set)

  const value = useMemo<Store>(
    () => ({
      inputs, computed, set, resetAll, resetField, applyInputs, setAuto, changed, isChangedField,
      fingerprint: fp, touchedAt, payroll, setPayroll, setPayrollAll, resetPayroll, sync, journal, fx, duties,
    }),
    [
      inputs, computed, set, resetAll, resetField, applyInputs, setAuto, changed, isChangedField,
      fp, touchedAt, payroll, setPayroll, setPayrollAll, resetPayroll, sync, journal, fx, duties,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore вне StoreProvider')
  return v
}
