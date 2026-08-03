/**
 * Поле ввода параметра. Правка мгновенно уходит в расчёт — кнопки «применить»
 * нет намеренно. Изменённое относительно базы помечается явно.
 */

import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { fmt } from '../domain/units'

interface Props {
  /** Путь в хранилище: 'fxCny.value', 'models.M3.yieldKernel'. */
  path: string
  label: string
  unit?: string
  /** Знаков после запятой при показе. */
  digits?: number
  /** Допустимый диапазон — подсказка и проверка. */
  min?: number
  max?: number
  hint?: string
  /** Показывать как справку без возможности правки. */
  readOnly?: boolean
  /** Откуда значение: подпись под полем. */
  source?: string
  size?: 'md' | 'sm'
}

export function Field({
  path, label, unit, digits = 2, min, max, hint, readOnly, source, size = 'md',
}: Props) {
  const { inputs, set, resetField, isChangedField } = useStore()
  const value = path
    .split('.')
    .reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], inputs) as number | null

  const [draft, setDraft] = useState<string>(value === null ? '' : String(value))
  useEffect(() => {
    setDraft(value === null ? '' : String(value))
  }, [value])

  const changed = isChangedField(path)
  const outOfRange =
    value !== null && ((min !== undefined && value < min) || (max !== undefined && value > max))

  const commit = (raw: string) => {
    setDraft(raw)
    const cleaned = raw.replace(/\s/g, '').replace(',', '.')
    if (cleaned === '') return set(path, null)
    const n = Number(cleaned)
    if (Number.isFinite(n)) set(path, n)
  }

  return (
    <label className={`fld fld--${size}${changed ? ' fld--changed' : ''}`}>
      <span className="fld-lbl">
        {label}
        {changed && (
          <button
            type="button"
            className="fld-reset"
            title="вернуть базовое значение"
            onClick={(e) => {
              e.preventDefault()
              resetField(path)
            }}
          >
            ↺
          </button>
        )}
      </span>

      {readOnly ? (
        <span className="fld-ro num">{value === null ? '—' : fmt(value, digits)}</span>
      ) : (
        <input
          className={`fld-inp num${outOfRange ? ' fld-inp--bad' : ''}`}
          inputMode="decimal"
          value={draft}
          placeholder="не задано"
          onChange={(e) => commit(e.target.value)}
        />
      )}

      <span className="fld-meta">
        {unit && <span className="fld-unit">{unit}</span>}
        {changed && <span className="fld-tag">изменено</span>}
        {readOnly && <span className="fld-tag fld-tag--ro">общий параметр</span>}
        {source && <span className="fld-src">{source}</span>}
      </span>

      {(hint || min !== undefined) && (
        <span className={`fld-hint${outOfRange ? ' fld-hint--bad' : ''}`}>
          {outOfRange ? '⚠ значение вне допустимого диапазона. ' : ''}
          {hint}
          {min !== undefined && max !== undefined && ` Допустимо ${fmt(min, digits)}…${fmt(max, digits)}.`}
        </span>
      )}
    </label>
  )
}
