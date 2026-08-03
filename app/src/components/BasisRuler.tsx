/**
 * Курсовая линейка М1. Показывает расстояние до точки переключения базиса.
 * Порог выводится формулой 7300/1050 × курс CNY, не зашит константой.
 */

import type { BasisChoice } from '../domain/basis'
import { DESTINATION_LABEL } from '../domain/types'
import { fmt, fxUsd, signed } from '../domain/units'

export function BasisRuler({ b }: { b: BasisChoice }) {
  // Шкала строится вокруг порога: ±2,5 ₽ по доллару.
  const span = 2.5
  const lo = b.thresholdUsdRub - span
  const hi = b.thresholdUsdRub + span
  const posOf = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100

  const thresholdPos = posOf(b.thresholdUsdRub)
  const currentPos = posOf(b.currentUsdRub)
  const ticks = [-2, -1, 0, 1, 2].map((d) => b.thresholdUsdRub + d)

  return (
    <div className="ruler">
      <div className="ruler-ends">
        <span>◀ {DESTINATION_LABEL[(b.currentUsdRub < b.thresholdUsdRub ? b.winner : b.loser).destination]} выгоднее</span>
        <span>{DESTINATION_LABEL[(b.currentUsdRub < b.thresholdUsdRub ? b.loser : b.winner).destination]} выгоднее ▶</span>
      </div>

      <div className="ruler-track">
        <div className="ruler-zone ruler-zone--left" style={{ width: `${thresholdPos}%` }} />
        <div className="ruler-zone ruler-zone--right" style={{ left: `${thresholdPos}%`, right: 0 }} />
        <div className="ruler-threshold" style={{ left: `${thresholdPos}%` }} aria-hidden="true" />
        <div className="ruler-now" style={{ left: `${currentPos}%` }}>
          <span className="ruler-now-dot" aria-hidden="true" />
        </div>
      </div>

      <div className="ruler-scale">
        {ticks.map((t) => (
          <span key={t} className="ruler-tick num" style={{ left: `${posOf(t)}%` }}>
            {fmt(t, 2)}
          </span>
        ))}
      </div>

      <div className="ruler-readout">
        <div>
          <span className="ruler-lbl">порог переключения</span>
          <span className="num ruler-big">{fxUsd(b.thresholdUsdRub)}</span>
          <span className="unit">₽/долл</span>
        </div>
        <div>
          <span className="ruler-lbl">курс сейчас</span>
          <span className="num ruler-big">{fxUsd(b.currentUsdRub)}</span>
          <span className="unit">₽/долл</span>
        </div>
        <div>
          <span className="ruler-lbl">до переключения</span>
          <span className="num ruler-big">{signed(b.distanceRub, 2)}</span>
          <span className="unit">₽/долл</span>
        </div>
      </div>

      <p className="ruler-formula num">
        порог = 7 300 / 1 050 × курс CNY = {fmt(b.crossoverUsdPerCny, 4)} × {fmt(b.currentUsdRub / b.currentUsdPerCny, 4)} ={' '}
        {fxUsd(b.thresholdUsdRub)}
      </p>
    </div>
  )
}
