/**
 * ДИНАМИКА ФИН. РЕЗУЛЬТАТА по сохранённым расчётам.
 *
 * Точки — только там, где расчёт действительно сохраняли. Между точками
 * линия проведена как связь, а не как утверждение о промежуточных днях:
 * пульт не знает, что было между записями, и не делает вид, что знает.
 *
 * Заблокированные в тот день модели разрыва не образуют — точки просто нет.
 */

import { useMemo } from 'react'
import type { JournalRow } from '../state/api'
import { kRub, dateOnly } from '../domain/units'
import { C } from './palette'

const MODEL_COLORS: Record<string, () => string> = {
  M1: () => C.decideSoft,
  M2: () => C.ok,
  M3: () => C.decide,
  M4: () => C.ink3,
  M5: () => C.alert,
}

const W = 720
const H = 240
const PAD = { top: 14, right: 14, bottom: 30, left: 62 }

export function JournalDynamics({ rows }: { rows: JournalRow[] }) {
  const model = useMemo(() => {
    // Список приходит от свежих к старым — для оси времени нужен обратный.
    const ordered = [...rows].reverse()
    const times = ordered.map((r) => Date.parse(r.at))

    const series = new Map<string, { x: number; y: number }[]>()
    for (const r of ordered) {
      for (const res of r.results ?? []) {
        if (!Number.isFinite(res.net)) continue
        const arr = series.get(res.id) ?? []
        arr.push({ x: Date.parse(r.at), y: res.net })
        series.set(res.id, arr)
      }
    }

    const ys = [...series.values()].flat().map((p) => p.y)
    if (ys.length === 0 || times.length < 2) return null

    const minX = Math.min(...times)
    const maxX = Math.max(...times)
    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys)
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1

    const px = (x: number) => PAD.left + ((x - minX) / spanX) * (W - PAD.left - PAD.right)
    const py = (y: number) => H - PAD.bottom - ((y - minY) / spanY) * (H - PAD.top - PAD.bottom)

    return { series, px, py, minX, maxX, minY, maxY }
  }, [rows])

  if (!model) {
    return <p className="note">Для графика нужны хотя бы два сохранённых расчёта.</p>
  }

  const { series, px, py, minX, maxX, minY, maxY } = model
  const ticks = [minY, minY + (maxY - minY) / 2, maxY]

  return (
    <div className="jdyn">
      <div className="xscroll">
        <svg
          className="jdyn-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Динамика финансового результата по режимам"
        >
          {ticks.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={py(v)} y2={py(v)}
                stroke={C.line2} strokeWidth={1}
              />
              <text x={PAD.left - 8} y={py(v) + 4} textAnchor="end" fontSize={10} fill={C.ink3}>
                {kRub(v)}
              </text>
            </g>
          ))}

          {/* Нулевая линия отдельно: переход через ноль — это смена смысла. */}
          {minY < 0 && maxY > 0 && (
            <line
              x1={PAD.left} x2={W - PAD.right} y1={py(0)} y2={py(0)}
              stroke={C.ink3} strokeWidth={1} strokeDasharray="3 3"
            />
          )}

          {[...series.entries()].map(([id, pts]) => {
            const color = MODEL_COLORS[id]?.() ?? C.ink2
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)},${py(p.y)}`).join(' ')
            return (
              <g key={id}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                {pts.map((p, i) => (
                  <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3} fill={color} />
                ))}
              </g>
            )
          })}

          <text x={PAD.left} y={H - 10} fontSize={10} fill={C.ink3}>
            {dateOnly(new Date(minX).toISOString())}
          </text>
          <text x={W - PAD.right} y={H - 10} fontSize={10} fill={C.ink3} textAnchor="end">
            {dateOnly(new Date(maxX).toISOString())}
          </text>
        </svg>
      </div>

      <ul className="jdyn-legend">
        {[...series.keys()].map((id) => (
          <li key={id}>
            <span className="jdyn-swatch" style={{ background: MODEL_COLORS[id]?.() ?? C.ink2 }} />
            <span className="num">{id}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
