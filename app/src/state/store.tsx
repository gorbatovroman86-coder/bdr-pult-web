/**
 * Хранилище пульта. Один провайдер на всё приложение.
 *
 * Любая правка входных данных немедленно пересчитывает все пять моделей:
 * результат — производная от `inputs`, отдельного состояния у него нет,
 * поэтому рассинхрон «поменяли параметр, а число осталось» невозможен.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BASE, baseInputs, changedPaths, clearInputs, isFieldChanged, loadInputs, saveInputs,
  type Inputs,
} from './inputs'
import { computeAll, type Computed } from './compute'

interface Store {
  inputs: Inputs
  computed: Computed
  /** Точечная правка по пути: 'fxCny.value', 'models.M3.yieldKernel'. */
  set: (path: string, value: number | string | null) => void
  /** Вернуть всё к базовым значениям — ровно эталон (C). */
  resetAll: () => void
  /** Вернуть одно поле к базовому значению. */
  resetField: (path: string) => void
  /** Список изменённых полей. */
  changed: string[]
  isChangedField: (path: string) => boolean
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

  useEffect(() => {
    saveInputs(inputs)
  }, [inputs])

  const set = useCallback((path: string, value: number | string | null) => {
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
  }, [])

  const resetAll = useCallback(() => {
    clearInputs()
    setInputs(baseInputs())
  }, [])

  const resetField = useCallback((path: string) => {
    setInputs((prev) => setPath(prev, path, getPath(BASE, path)))
  }, [])

  const computed = useMemo(() => computeAll(inputs), [inputs])
  const changed = useMemo(() => changedPaths(inputs), [inputs])
  const isChangedField = useCallback((p: string) => isFieldChanged(inputs, p), [inputs])

  const value = useMemo<Store>(
    () => ({ inputs, computed, set, resetAll, resetField, changed, isChangedField }),
    [inputs, computed, set, resetAll, resetField, changed, isChangedField],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore вне StoreProvider')
  return v
}
