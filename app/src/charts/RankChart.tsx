/**
 * ЯДРО ЭКРАНА. Отвечает за две секунды и без чтения чисел:
 * какой режим выгоднее и насколько.
 *
 * Место читается тремя независимыми признаками — номером, высотой столбца
 * и весом подписи. Цвет добавляется четвёртым, но ничего не несёт в одиночку.
 */

import { kRub, pct, signed } from '../domain/units'
import type { ComputedModel } from '../state/compute'
import { C } from './palette'

export function RankChart({
  rows,
  selected,
  onSelect,
}: {
  rows: ComputedModel[]
  selected: string
  onSelect: (id: string) => void
}) {
  const live = rows.filter((m) => m.blockers.length === 0)
  if (live.length === 0) return <p className="note">Ни один режим не считается — см. блокировки ниже.</p>

  const max = Math.max(...live.map((m) => m.result.netResult), 0)
  const min = Math.min(...live.map((m) => m.result.netResult), 0)
  const span = max - Math.min(0, min) || 1

  return (
    <div className="rank">
      {live.map((m, idx) => {
        const v = m.result.netResult
        const h = (Math.abs(v) / span) * 100
        const first = idx === 0
        const last = idx === live.length - 1 && live.length > 1
        const gapToFirst = v - live[0].result.netResult
        return (
          <button
            key={m.meta.id}
            type="button"
            className={`rank-col${first ? ' rank-col--first' : ''}${
              selected === m.meta.id ? ' rank-col--sel' : ''
            }`}
            onClick={() => onSelect(m.meta.id)}
            aria-label={`${m.meta.id} ${m.meta.name}, место ${idx + 1}, ${kRub(v)} тысяч рублей в месяц`}
          >
            <span className="rank-place">
              <span className="rank-place-num num">{idx + 1}</span>
              <span className="rank-place-word">{first ? 'место · лучший' : 'место'}</span>
            </span>

            <span className="rank-val num">{kRub(v)}</span>

            <span className="rank-bar-wrap">
              <span
                className="rank-bar"
                style={{ height: `${h}%`, background: first ? C.decide : C.decideSoft }}
              />
            </span>

            <span className="rank-id num">{m.meta.id}</span>
            <span className="rank-name">{m.meta.name}</span>
            <span className="rank-gap num">
              {first ? (
                <span className="rank-gap-best">✦ лучший режим</span>
              ) : (
                <>
                  {signed(gapToFirst, 0)}
                  <span className="unit">тыс.₽ к первому</span>
                </>
              )}
            </span>
            <span className="rank-margin num">
              {pct(m.result.margin)} %<span className="unit">рентаб.</span>
            </span>
            {last && <span className="rank-last">последнее место</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Отрыв: первый против второго и последний против первого. */
export function RankGaps({ rows }: { rows: ComputedModel[] }) {
  const live = rows.filter((m) => m.blockers.length === 0)
  if (live.length < 2) return null
  const first = live[0]
  const second = live[1]
  const last = live[live.length - 1]

  const item = (
    title: string,
    a: ComputedModel,
    b: ComputedModel,
    tone: 'ok' | 'alert',
  ) => {
    const abs = a.result.netResult - b.result.netResult
    const rel = b.result.netResult === 0 ? null : (abs / Math.abs(b.result.netResult)) * 100
    return (
      <div className={`gap gap--${tone}`}>
        <div className="gap-title">{title}</div>
        <div className="gap-pair num">
          {a.meta.id} <span className="gap-vs">против</span> {b.meta.id}
        </div>
        <div className="gap-abs num">
          {signed(abs, 2)}
          <span className="unit">тыс.₽/мес</span>
        </div>
        <div className="gap-rel num">{rel === null ? '—' : `${signed(rel, 1)} %`}</div>
      </div>
    )
  }

  return (
    <div className="gaps">
      {item('Отрыв лидера', first, second, 'ok')}
      {item('Худший против лидера', last, first, 'alert')}
    </div>
  )
}

/** Заблокированные — в конце, с именем параметра, который их остановил. */
export function BlockedList({ rows }: { rows: ComputedModel[] }) {
  const blocked = rows.filter((m) => m.blockers.length > 0)
  if (blocked.length === 0) return null
  return (
    <div className="blocked-list-box">
      <h3 className="ref-h">Расчёт остановлен — {blocked.length} из {rows.length}</h3>
      <ul className="blockedl">
        {blocked.map((m) => (
          <li key={m.meta.id} className="blockedl-item">
            <span className="blockedl-id num">
              <span aria-hidden="true">⛔</span> {m.meta.id}
            </span>
            <span className="blockedl-name">{m.meta.name}</span>
            <ul className="blockedl-why">
              {m.blockers.map((b, i) => (
                <li key={i}>{b.message}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
