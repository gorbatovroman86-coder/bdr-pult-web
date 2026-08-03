/**
 * Сценарии и история.
 *
 * Ползунки правят РЕАЛЬНЫЕ входные данные — пересчёт немедленный, заглушек нет.
 * Слева всегда видна база (эталон), справа — что стало.
 */

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dateTime, fmt, fxCny, fxUsd, kRub, monthShort, pct, signed } from '../domain/units'
import { Panel, Tag } from '../components/bits'
import { useStore } from '../state/store'
import { computeAll, ranked } from '../state/compute'
import { BASE } from '../state/inputs'
import { HISTORY } from '../data/history'

/* Recharts кладёт цвет в SVG-атрибут, где var(--…) не работает —
   поэтому здесь литералы, совпадающие с токенами темы. */
const C_BASE = '#a9a294'
const C_NOW = '#3f687d'
const C_LINE = '#dbd4c5'
const C_INK2 = '#62665a'

const SLIDERS: { path: string; label: string; min: number; max: number; step: number; digits: number }[] = [
  { path: 'fxCny.value', label: 'Курс CNY / RUB', min: 8, max: 16, step: 0.01, digits: 4 },
  { path: 'fxUsd.value', label: 'Курс USD / RUB', min: 60, max: 110, step: 0.05, digits: 2 },
  { path: 'contracts.sunOil.value', label: 'Подсолнечное масло, CNY/т', min: 6000, max: 12000, step: 10, digits: 0 },
  { path: 'contracts.kernel.value', label: 'Ядро, CNY/т', min: 4000, max: 9000, step: 10, digits: 0 },
  { path: 'models.M5.yieldOil', label: 'Выход масла у М5', min: 0.3, max: 0.6, step: 0.005, digits: 3 },
  { path: 'models.M3.processingWithVat', label: 'Переработка М3, ₽/т', min: 2000, max: 9000, step: 50, digits: 0 },
]

const get = (o: unknown, p: string) =>
  p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o) as number | null

export function Scenarios() {
  const { inputs, computed, set, resetAll, changed } = useStore()
  const base = useMemo(() => computeAll(BASE), [])

  const rows = useMemo(() => {
    const order = ranked(base).map((m) => m.meta.id)
    return order.map((id) => {
      const b = base.models.find((m) => m.meta.id === id)!
      const n = computed.models.find((m) => m.meta.id === id)!
      const blocked = n.blockers.length > 0
      return {
        id,
        name: n.meta.name,
        base: b.result.netResult,
        now: blocked ? null : n.result.netResult,
        delta: blocked ? null : n.result.netResult - b.result.netResult,
        marginNow: blocked ? null : n.result.margin,
      }
    })
  }, [base, computed])

  const orderBase = ranked(base).map((m) => m.meta.id).join('→')
  const orderNow = ranked(computed).map((m) => m.meta.id).join('→')
  const orderChanged = orderBase !== orderNow

  const chart = rows.map((r) => ({
    name: r.id,
    база: Number(r.base.toFixed(2)),
    сейчас: r.now === null ? 0 : Number(r.now.toFixed(2)),
  }))

  return (
    <>
      <Panel
        title="Сценарный анализ"
        aside={
          changed.length > 0 ? (
            <button type="button" className="btn" onClick={resetAll}>
              Сбросить изменения
            </button>
          ) : (
            <Tag tone="quiet">сейчас = база</Tag>
          )
        }
      >
        <div className="sliders">
          {SLIDERS.map((s) => {
            const v = get(inputs, s.path)
            const b = get(BASE, s.path)
            const diff = v !== null && b !== null && Math.abs(v - b) > 1e-12
            return (
              <label key={s.path} className={`sl${diff ? ' sl--changed' : ''}`}>
                <span className="sl-lbl">
                  {s.label}
                  {diff && <span className="sl-badge">изменено</span>}
                </span>
                <input
                  type="range"
                  className="sl-input"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={v ?? b ?? s.min}
                  onChange={(e) => set(s.path, Number(e.target.value))}
                />
                <span className="sl-val num">
                  {fmt(v ?? 0, s.digits)}
                  {diff && <span className="sl-was num"> база {fmt(b ?? 0, s.digits)}</span>}
                </span>
              </label>
            )
          })}
        </div>

        <p className="note">
          Ползунки правят те же входные данные, что и экран «Исходные данные», — расчёт
          пересчитывается сразу, отдельного «сценарного режима» нет. Прогнозных дисконтов
          в базовом расчёте нет: 0,8636 из книги — прогноз снижения цены, а не физический
          коэффициент, и его арифметика к тому же неточна (1 250 → 1 100 даёт 0,88).
        </p>
      </Panel>

      <Panel
        title="База против текущего, тыс.₽/мес"
        aside={
          <Tag tone={orderChanged ? 'alert' : 'quiet'}>
            {orderChanged ? '⚠ порядок режимов изменился' : 'порядок режимов не изменился'}
          </Tag>
        }
      >
        <div className="chartbox">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={C_LINE} vertical={false} />
              <XAxis dataKey="name" stroke={C_INK2} tickLine={false} />
              <YAxis stroke={C_INK2} tickLine={false} width={64} />
              <Tooltip
                formatter={(v, n) => [kRub(Number(v)), String(n)]}
                contentStyle={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="база" fill={C_BASE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="сейчас" fill={C_NOW} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>режим</th>
                <th className="ta-r">база</th>
                <th className="ta-r">сейчас</th>
                <th className="ta-r">отклонение</th>
                <th className="ta-r">%</th>
                <th className="ta-r">рентаб.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b className="num">{r.id}</b> <span className="td-note">{r.name}</span>
                  </td>
                  <td className="num ta-r">{kRub(r.base)}</td>
                  <td className="num ta-r b">
                    {r.now === null ? <span className="hint-warn">⛔ остановлен</span> : kRub(r.now)}
                  </td>
                  <td className="num ta-r">{r.delta === null ? '—' : signed(r.delta, 2)}</td>
                  <td className="num ta-r">
                    {r.delta === null || r.base === 0 ? '—' : `${signed((r.delta / r.base) * 100, 1)} %`}
                  </td>
                  <td className="num ta-r">
                    {r.marginNow === null || r.marginNow === undefined ? '—' : `${pct(r.marginNow)} %`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="note">
          Порядок в базе: <b className="num">{orderBase}</b>. Сейчас: <b className="num">{orderNow}</b>.
          {orderChanged
            ? ' Рейтинг перевернулся — это главный вывод сценария.'
            : ' Рейтинг устойчив к внесённым изменениям.'}
        </p>
      </Panel>

      <Panel title="История расчётов">
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>дата</th>
                <th>лучший</th>
                <th className="ta-r">фин. результат</th>
                <th className="ta-r">CNY</th>
                <th className="ta-r">USD</th>
                <th>пошлины</th>
                <th>режим</th>
              </tr>
            </thead>
            <tbody>
              {HISTORY.map((h) => (
                <tr key={h.at}>
                  <td className="num">{dateTime(h.at)}</td>
                  <td className="num b">{h.best}</td>
                  <td className="num ta-r">{kRub(h.net)}</td>
                  <td className="num ta-r">{fxCny(h.cny)}</td>
                  <td className="num ta-r">{fxUsd(h.usd)}</td>
                  <td className="num">{monthShort(h.duty)}</td>
                  <td>
                    {h.mode}
                    {h.note && <div className="td-note">⚠ {h.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Снимки прошлых расчётов. Каждый хранит курсы и ставки, действовавшие на тот момент, —
          иначе старую цифру нельзя объяснить.
        </p>
      </Panel>
    </>
  )
}
