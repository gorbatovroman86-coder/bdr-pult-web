/**
 * Мелкие общие элементы: значки происхождения, панели, значения, предупреждения.
 * Значок никогда не заменяет слово — только сопровождает.
 */

import type { ReactNode } from 'react'
import type { Origin, Warning } from '../domain/types'

const ORIGIN_MARK: Record<Origin, { icon: string; word: string }> = {
  auto: { icon: '🔄', word: 'авто' },
  manual: { icon: '✋', word: 'вручную' },
  file: { icon: '📄', word: 'из файла' },
  setting: { icon: '⚙️', word: 'настройка' },
}

export function OriginMark({ origin, note }: { origin: Origin; note?: string }) {
  const m = ORIGIN_MARK[origin]
  return (
    <span className={`om om--${origin}`} title={`${m.word}${note ? ` · ${note}` : ''}`}>
      <span aria-hidden="true">{m.icon}</span>
      <span className="om-word">{m.word}</span>
      {note && <span className="om-note">{note}</span>}
    </span>
  )
}

export function Panel({
  title,
  aside,
  children,
  tone = 'plain',
}: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  tone?: 'plain' | 'quiet' | 'alert'
}) {
  return (
    <section className={`panel panel--${tone}`}>
      {(title || aside) && (
        <header className="panel-hd">
          {title && <h2 className="panel-title">{title}</h2>}
          {aside && <div className="panel-aside">{aside}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  unit,
  hint,
  size = 'md',
}: {
  label: string
  value: string
  unit?: string
  hint?: ReactNode
  size?: 'md' | 'lg'
}) {
  return (
    <div className={`stat stat--${size}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

const WARN_MARK: Record<Warning['kind'], { icon: string; word: string }> = {
  discrepancy: { icon: '⚠', word: 'расхождение с файлом' },
  unmonetized: { icon: '⚠', word: 'не монетизируется' },
  'beyond-bdr': { icon: '➕', word: 'сверх БДР' },
  simplification: { icon: '⚠', word: 'упрощение' },
}

export function WarnLine({ w }: { w: Warning }) {
  const m = WARN_MARK[w.kind]
  return (
    <li className={`warn warn--${w.kind}`}>
      <span className="warn-icon" aria-hidden="true">
        {m.icon}
      </span>
      <span className="warn-body">
        <span className="warn-kind">{m.word}.</span> {w.text}
      </span>
      {w.ref && <span className="warn-ref num">{w.ref}</span>}
    </li>
  )
}

export function Tag({ children, tone = 'quiet' }: { children: ReactNode; tone?: 'quiet' | 'decide' | 'alert' | 'ok' }) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}
