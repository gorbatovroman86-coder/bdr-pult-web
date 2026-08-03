/**
 * МАТЕРИАЛЬНЫЙ БАЛАНС. Поток массы по выбранному режиму.
 *
 * Строится ИЗ ВЫХОДОВ ДВИЖКА, а не из поля «Продажа, т» — поэтому сумма
 * ветвей физически не может превысить вход. Это и делает двойной счёт тонн
 * видимым: в М2 и М5 полуфабрикат уходит в пресс отдельным узлом, а не
 * встаёт в один ряд с проданным.
 */

import { PRODUCT_LABEL_FULL, type MassId } from '../domain/types'
import { share, tons } from '../domain/units'
import type { ComputedModel } from '../state/compute'
import { C, MATTER } from './palette'

const W = 900
const H = 420
const NODE_W = 15
const PAD = 3

interface Flow {
  id: MassId
  /** Доля от тонны сырья. */
  frac: number
  tons: number
  monetized: boolean
  note?: string
}

/** Лента между двумя вертикальными отрезками. */
function ribbon(x0: number, y0: number, x1: number, y1: number, th: number) {
  const cx = (x0 + x1) / 2
  return [
    `M ${x0} ${y0}`,
    `C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`,
    `L ${x1} ${y1 + th}`,
    `C ${cx} ${y1 + th}, ${cx} ${y0 + th}, ${x0} ${y0 + th}`,
    'Z',
  ].join(' ')
}

export function SankeyBalance({ c }: { c: ComputedModel }) {
  const r = c.result
  const b = r.balance
  const raw = r.rawTons

  const stage1: Flow[] = b.stage1.map((s) => ({
    id: s.id,
    frac: s.share,
    tons: s.tons,
    monetized: s.monetized,
    note: s.note,
  }))
  const pressed = b.stage2
  const semiFrac = pressed ? (stage1.find((s) => s.id === pressed.from)?.frac ?? 0) : 0
  const stage2: Flow[] = pressed
    ? pressed.segments.map((s) => ({
        id: s.id,
        frac: s.share * semiFrac, // доля от СЫРЬЯ, а не от полуфабриката
        tons: s.tons,
        monetized: s.monetized,
        note: s.note,
      }))
    : []

  const cols = pressed ? 3 : 2
  const colX = (i: number) => (i * (W - NODE_W)) / (cols - 1)
  const scale = (frac: number) => frac * (H - PAD * (stage1.length + 1))

  // раскладка первого передела
  let y = PAD
  const s1 = stage1.map((f) => {
    const h = Math.max(2, scale(f.frac))
    const item = { ...f, y, h }
    y += h + PAD
    return item
  })

  // раскладка второго передела — выровнена по узлу полуфабриката
  const semiNode = s1.find((f) => f.id === pressed?.from)
  let y2 = semiNode ? semiNode.y : PAD
  const s2 = stage2.map((f) => {
    const h = Math.max(2, scale(f.frac))
    const item = { ...f, y: y2, h }
    y2 += h + 1
    return item
  })

  const label = (id: MassId) => PRODUCT_LABEL_FULL[id]

  return (
    <div className="sankey">
      <div className="xscroll">
        <svg viewBox={`0 0 ${W} ${H + 46}`} className="sankey-svg" role="img"
          aria-label={`Материальный баланс режима ${c.meta.id}: из тонны сырья ${s1
            .map((f) => `${label(f.id)} ${share(f.frac)} процента`)
            .join(', ')}`}>
          {/* вход */}
          <rect x={0} y={PAD} width={NODE_W} height={H - PAD} rx={3} fill={MATTER.raw} />
          <text x={0} y={H + 18} className="sankey-cap">сырьё</text>
          <text x={0} y={H + 34} className="sankey-num">{tons(raw)} т · 100,0 %</text>

          {/* первый передел */}
          {s1.map((f) => (
            <g key={f.id}>
              <path
                d={ribbon(NODE_W, f.y, colX(1), f.y, f.h)}
                fill={MATTER[f.id]}
                opacity={f.monetized ? 0.72 : 0.4}
              />
              <rect x={colX(1)} y={f.y} width={NODE_W} height={f.h} rx={3} fill={MATTER[f.id]} />
              {f.h > 15 && (
                <>
                  <text x={colX(1) + NODE_W + 8} y={f.y + f.h / 2 - 2} className="sankey-node">
                    {label(f.id)}
                  </text>
                  <text x={colX(1) + NODE_W + 8} y={f.y + f.h / 2 + 12} className="sankey-node-num">
                    {share(f.frac)} % · {tons(f.tons)} т
                    {!f.monetized && f.id === 'husk' ? ' · не монетизируется' : ''}
                    {f.id === 'semi' && pressed ? ' · идёт в пресс' : ''}
                  </text>
                </>
              )}
            </g>
          ))}

          {/* второй передел */}
          {pressed &&
            s2.map((f) => (
              <g key={f.id}>
                <path
                  d={ribbon(colX(1) + NODE_W, f.y, colX(2), f.y, f.h)}
                  fill={MATTER[f.id]}
                  opacity={f.monetized ? 0.72 : 0.4}
                />
                <rect x={colX(2)} y={f.y} width={NODE_W} height={f.h} rx={3} fill={MATTER[f.id]} />
                {f.h > 13 && (
                  <>
                    <text x={colX(2) - 8} y={f.y + f.h / 2 - 2} className="sankey-node sankey-node--r">
                      {label(f.id)}
                    </text>
                    <text x={colX(2) - 8} y={f.y + f.h / 2 + 12} className="sankey-node-num sankey-node--r">
                      {share(f.frac)} % от сырья · {tons(f.tons)} т
                    </text>
                  </>
                )}
              </g>
            ))}

          <text x={colX(1)} y={H + 18} className="sankey-cap">первый передел</text>
          {pressed && (
            <text x={W - 4} y={H + 18} className="sankey-cap sankey-node--r">
              пресс из полуфабриката
            </text>
          )}
        </svg>
      </div>

      <ul className="legend">
        {[...s1, ...s2].map((f) => (
          <li key={`${f.id}-${f.y}`} className="legend-item">
            <span className="legend-dot" style={{ background: MATTER[f.id], opacity: f.monetized ? 1 : 0.5 }} aria-hidden="true" />
            {label(f.id)} <span className="num">{share(f.frac)} %</span>
            {!f.monetized && <span className="legend-note">{f.note ?? 'не продаётся'}</span>}
          </li>
        ))}
      </ul>

      <p className="fld-hint">
        Ширина потока пропорциональна массе. Сумма ветвей равна входу по построению —
        баланс считается из выходов движка, а не из поля «Продажа, т», где в М2 и М5
        полуфабрикат учтён наравне с проданным и сумма превышает переработанное сырьё.
        {c.meta.producesOilLine
          ? ''
          : ' Потерь в этом режиме нет: сумма выходов ровно 100 %.'}
      </p>
    </div>
  )
}

export const SANKEY_STROKE = C.line
