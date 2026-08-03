/**
 * Сценарии и история. В ЭТАПЕ 3 пересчёта нет — движок появится в ЭТАПЕ 4.
 * Ползунки показывают форму экрана и правила показа, цифры сценария
 * помечены как незаполненные, чтобы никто не принял их за расчёт.
 */

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dateTime, fmt, fxCny, fxUsd, kRub, monthShort } from '../domain/units'
import { Panel, Tag } from '../components/bits'
import { COMPUTED } from '../data/calc'
import { HISTORY } from '../data/history'

const PRESETS = ['базовый', 'оптимистичный', 'пессимистичный', 'свой'] as const

/* Recharts кладёт цвет в SVG-атрибут, где var(--…) не работает —
   поэтому здесь литералы, совпадающие с токенами темы. */
const C_DECIDE = '#3f687d'
const C_LINE = '#dbd4c5'
const C_INK2 = '#62665a'

export function Scenarios() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>('базовый')
  const [cny, setCny] = useState(11.5)
  const [usd, setUsd] = useState(80)
  const [oilPrice, setOilPrice] = useState(8550)
  const [oilYield, setOilYield] = useState(49)
  const [discount, setDiscount] = useState(1)

  const chart = [...COMPUTED]
    .sort((a, b) => b.result.netResult - a.result.netResult)
    .map((c) => ({ name: c.meta.id, base: Number(c.result.netResult.toFixed(2)) }))

  return (
    <>
      <Panel
        title="Сценарный анализ"
        aside={
          <div className="sortbar" role="group" aria-label="Сценарий">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${preset === p ? ' chip--on' : ''}`}
                aria-pressed={preset === p}
                onClick={() => setPreset(p)}
              >
                {p}
              </button>
            ))}
          </div>
        }
      >
        <div className="sliders">
          <Slider label="Курс CNY / RUB" value={cny} min={10} max={14} step={0.01} onChange={setCny} fmtV={fxCny} />
          <Slider label="Курс USD / RUB" value={usd} min={70} max={95} step={0.05} onChange={setUsd} fmtV={fxUsd} />
          <Slider
            label="Подсолнечное масло, CNY/т"
            value={oilPrice}
            min={7000}
            max={10000}
            step={10}
            onChange={setOilPrice}
            fmtV={(v) => fmt(v, 0)}
          />
          <Slider
            label="Выход масла, %"
            value={oilYield}
            min={40}
            max={58}
            step={0.5}
            onChange={setOilYield}
            fmtV={(v) => fmt(v, 1)}
          />
          <Slider
            label="Прогнозный дисконт"
            value={discount}
            min={0.8}
            max={1}
            step={0.0001}
            onChange={setDiscount}
            fmtV={(v) => fmt(v, 4)}
          />
        </div>

        <p className="note">
          <b>Прогнозный дисконт живёт только здесь.</b> В базовом расчёте его нет: 0,8636 из файла —
          это прогноз снижения цены, а не физический коэффициент. Арифметика в файле к тому же
          неточна — снижение 1 250 → 1 100 даёт 0,88, а записано 0,8636.
        </p>

        <div className="stub">
          <span className="stub-icon" aria-hidden="true">⛔</span>
          <div>
            <b>Пересчёт сценария появится после переноса формул (ЭТАП 4).</b>
            <p>
              Сейчас показана только форма экрана и правила: отклонение от базы, знак изменения
              и вывод о том, изменился ли порядок режимов. Выдуманных цифр здесь нет намеренно.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Фин. результат по режимам, тыс.₽/мес" aside={<Tag tone="quiet">база, окт.2026</Tag>}>
        <div className="chartbox">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={C_LINE} vertical={false} />
              <XAxis dataKey="name" stroke={C_INK2} tickLine={false} />
              <YAxis stroke={C_INK2} tickLine={false} width={64} />
              <Tooltip
                formatter={(v) => [kRub(Number(v)), 'фин. результат']}
                contentStyle={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="base" fill={C_DECIDE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
          Каждый снимок хранит курсы и ставки, действовавшие на момент расчёта, — иначе старую
          цифру нельзя объяснить.
        </p>
      </Panel>
    </>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmtV,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  fmtV: (v: number) => string
}) {
  return (
    <label className="sl">
      <span className="sl-lbl">{label}</span>
      <input
        type="range"
        className="sl-input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="sl-val num">{fmtV(value)}</span>
    </label>
  )
}
