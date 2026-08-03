/**
 * Второй уровень экрана: маржинальность, структура выручки, структура затрат,
 * путь от выручки к прибыли.
 */

import { PRODUCT_LABEL_FULL, type ProductId } from '../domain/types'
import { kRub, pct, signed, tons } from '../domain/units'
import type { ComputedModel } from '../state/compute'
import { C, COST, DARK_ON, MATTER } from './palette'

/** Горизонтальные полосы рентабельности — общая шкала для всех режимов. */
export function MarginChart({ rows }: { rows: ComputedModel[] }) {
  const live = rows.filter((m) => m.blockers.length === 0 && m.result.margin !== null)
  if (live.length === 0) return null
  const max = Math.max(...live.map((m) => m.result.margin ?? 0), 0.01)

  return (
    <div className="hbars">
      {live.map((m, i) => (
        <div key={m.meta.id} className="hbar">
          <span className="hbar-lbl">
            <span className="num b">{m.meta.id}</span> {m.meta.name}
          </span>
          <span className="hbar-track">
            <span
              className="hbar-fill"
              style={{
                width: `${((m.result.margin ?? 0) / max) * 100}%`,
                background: i === 0 ? C.decide : C.decideSoft,
              }}
            />
          </span>
          <span className="hbar-val num">{pct(m.result.margin)} %</span>
        </div>
      ))}
    </div>
  )
}

const REV_ORDER: ProductId[] = ['kernel', 'semi', 'cat3', 'oil', 'meal', 'husk']

/** Структура выручки: доли продуктов внутри каждого режима. */
export function RevenueStructure({ rows }: { rows: ComputedModel[] }) {
  const live = rows.filter((m) => m.blockers.length === 0 && m.result.revenueTotal > 0)
  if (live.length === 0) return null

  return (
    <>
      <div className="stack">
        {live.map((m) => {
          const total = m.result.revenueTotal
          const parts = REV_ORDER.map((p) => ({ p, v: m.result.revenue[p] ?? 0 })).filter((x) => x.v > 0)
          return (
            <div key={m.meta.id} className="stack-row">
              <span className="stack-lbl">
                <span className="num b">{m.meta.id}</span>
                <span className="stack-total num">{kRub(total)}</span>
              </span>
              <span className="stack-bar">
                {parts.map(({ p, v }) => {
                  const w = (v / total) * 100
                  return (
                    <span
                      key={p}
                      className="stack-seg"
                      style={{
                        width: `${w}%`,
                        background: MATTER[p],
                        color: DARK_ON.has(p) ? C.ink : '#fff',
                      }}
                      title={`${PRODUCT_LABEL_FULL[p]}: ${kRub(v)} тыс.₽ · ${pct(v / total)} %`}
                    >
                      {w >= 12 && <span className="stack-seg-t num">{pct(v / total)}</span>}
                    </span>
                  )
                })}
              </span>
            </div>
          )
        })}
      </div>
      <Legend
        items={REV_ORDER.filter((p) => live.some((m) => (m.result.revenue[p] ?? 0) > 0)).map((p) => ({
          key: p,
          color: MATTER[p],
          label: PRODUCT_LABEL_FULL[p],
        }))}
      />
    </>
  )
}

const COST_PARTS = [
  { key: 'raw', label: 'сырьё' },
  { key: 'processing', label: 'переработка' },
  { key: 'shipping', label: 'отгрузка' },
  { key: 'interest', label: '% пользования' },
  { key: 'tax', label: 'налог' },
] as const

/** Структура затрат: из чего складывается всё, что вычитается из выручки. */
export function CostStructure({ rows, inputsVat }: { rows: ComputedModel[]; inputsVat: number }) {
  const live = rows.filter((m) => m.blockers.length === 0)
  if (live.length === 0) return null

  return (
    <>
      <div className="stack">
        {live.map((m) => {
          const raw = (m.result.rawTons * m.params.purchaseWithVat) / 1.1 / 1000
          const processing = (m.params.processingWithVat / inputsVat) * m.result.rawTons / 1000
          const vals: Record<string, number> = {
            raw,
            processing,
            shipping: m.result.shippingTotal,
            interest: m.result.capital.interestMonthly,
            tax: Math.max(0, m.result.tax),
          }
          const total = Object.values(vals).reduce((a, b) => a + b, 0)
          return (
            <div key={m.meta.id} className="stack-row">
              <span className="stack-lbl">
                <span className="num b">{m.meta.id}</span>
                <span className="stack-total num">{kRub(total)}</span>
              </span>
              <span className="stack-bar">
                {COST_PARTS.map(({ key, label }) => {
                  const w = (vals[key] / total) * 100
                  return (
                    <span
                      key={key}
                      className="stack-seg"
                      style={{
                        width: `${w}%`,
                        background: COST[key],
                        color: DARK_ON.has(key) ? C.ink : '#fff',
                      }}
                      title={`${label}: ${kRub(vals[key])} тыс.₽ · ${pct(vals[key] / total)} %`}
                    >
                      {w >= 12 && <span className="stack-seg-t num">{pct(vals[key] / total)}</span>}
                    </span>
                  )
                })}
              </span>
            </div>
          )
        })}
      </div>
      <Legend items={COST_PARTS.map((c) => ({ key: c.key, color: COST[c.key], label: c.label }))} />
      <p className="fld-hint">
        Сырьё и переработка вместе дают строку «Себестоимость». Налог показан как затрата,
        чтобы полоса складывалась в то, что вычитается из выручки.
      </p>
    </>
  )
}

export function Legend({ items }: { items: { key: string; color: string; label: string }[] }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.key} className="legend-item">
          <span className="legend-dot" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/** Путь от выручки к фин. результату. */
export function Waterfall({ m }: { m: ComputedModel }) {
  const r = m.result
  const steps = [
    { label: 'Выручка', v: r.revenueTotal, sign: 1 },
    { label: 'Себестоимость', v: -r.cost, sign: -1 },
    { label: 'Отгрузка', v: -r.shippingTotal, sign: -1 },
    { label: '% пользования деньгами', v: -r.capital.interestMonthly, sign: -1 },
    { label: 'Налог', v: -r.tax, sign: -1 },
  ]
  const max = r.revenueTotal || 1
  let running = 0
  return (
    <div className="wf">
      {steps.map((s) => {
        const from = running
        running += s.v
        const left = (Math.min(from, running) / max) * 100
        const width = (Math.abs(s.v) / max) * 100
        return (
          <div key={s.label} className="wf-row">
            <span className="wf-label">{s.label}</span>
            <span className="wf-track">
              <span
                className={`wf-bar wf-bar--${s.sign > 0 ? 'plus' : 'minus'}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </span>
            <span className="wf-val num">{signed(s.v, 2)}</span>
          </div>
        )
      })}
      <div className="wf-row wf-row--total">
        <span className="wf-label">ФИН. РЕЗУЛЬТАТ</span>
        <span className="wf-track">
          <span
            className="wf-bar wf-bar--total"
            style={{ left: 0, width: `${(Math.max(0, r.netResult) / max) * 100}%` }}
          />
        </span>
        <span className="wf-val num">{kRub(r.netResult)}</span>
      </div>
      <p className="fld-hint">
        На тонну сырья: <b className="num">{kRub(r.netPerRawTon / 1000)}</b> тыс.₽ ·{' '}
        база {tons(r.rawTons)} т.
      </p>
    </div>
  )
}
