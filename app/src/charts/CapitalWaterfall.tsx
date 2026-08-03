/**
 * ВЛОЖЕННЫЙ КАПИТАЛ И ЦЕНА ДЕНЕГ.
 *
 * Два места, где модель ведёт себя неочевидно, подписаны прямо на каскаде:
 * кредиторка ПРИБАВЛЯЕТСЯ, а дебиторка считается ТОЛЬКО по ядру.
 */

import { fmt, kRub, rub } from '../domain/units'
import type { ComputedModel } from '../state/compute'
import { C } from './palette'

export function CapitalWaterfall({ c, moneyRate }: { c: ComputedModel; moneyRate: number }) {
  const cap = c.result.capital
  const steps = [
    { key: 'stock', label: 'Запас сырья', v: cap.stock, cell: 'строка 35', note: 'N1 × L1 × D1, по цене с НДС' },
    { key: 'payables', label: '+ Кредиторка (½ мес)', v: cap.payables, cell: 'строка 36',
      note: '⚠ ПРИБАВЛЯЕТСЯ, а не вычитается. Решение владельца модели, не факт из БДР' },
    { key: 'receivables', label: '+ Дебиторка', v: cap.receivables, cell: 'строка 37',
      note: cap.receivables === 0
        ? '⚠ считается ТОЛЬКО по ядру — здесь ядра нет, поэтому ноль. Капитал и процент занижены (D4)'
        : '⚠ считается ТОЛЬКО по ядру и по цене с НДС' },
  ]
  const max = cap.total || 1
  let acc = 0

  return (
    <div className="capwf">
      {steps.map((s) => {
        const from = acc
        acc += s.v
        return (
          <div key={s.key} className="capwf-row">
            <span className="capwf-lbl">
              {s.label}
              <span className="capwf-cell num">{s.cell}</span>
            </span>
            <span className="capwf-track">
              <span
                className="capwf-bar"
                style={{
                  left: `${(from / max) * 100}%`,
                  width: `${(s.v / max) * 100}%`,
                  background: s.key === 'payables' ? C.alert : s.key === 'receivables' ? C.decideSoft : C.decide,
                }}
              />
            </span>
            <span className="capwf-val num">{rub(s.v)} ₽</span>
            <span className={`capwf-note${s.note.startsWith('⚠') ? ' capwf-note--warn' : ''}`}>{s.note}</span>
          </div>
        )
      })}

      <div className="capwf-row capwf-row--total">
        <span className="capwf-lbl">
          ВЛОЖЕННЫЙ КАПИТАЛ
          <span className="capwf-cell num">строка 38</span>
        </span>
        <span className="capwf-track">
          <span className="capwf-bar" style={{ left: 0, width: '100%', background: C.ink }} />
        </span>
        <span className="capwf-val num">{rub(cap.total)} ₽</span>
        <span className="capwf-note">запас + кредиторка + дебиторка</span>
      </div>

      <div className="capwf-out">
        <div className="capwf-out-item">
          <span className="fld-lbl">% пользования, год</span>
          <span className="capwf-out-v num">{kRub(cap.interestYear)}</span>
          <span className="unit">тыс.₽ · строка 40</span>
        </div>
        <div className="capwf-out-item capwf-out-item--main">
          <span className="fld-lbl">% пользования, месяц</span>
          <span className="capwf-out-v num">{kRub(cap.interestMonthly)}</span>
          <span className="unit">тыс.₽ · строка 41 → 30</span>
        </div>
        <div className="capwf-out-item">
          <span className="fld-lbl">ставка</span>
          <span className="capwf-out-v num">{fmt(moneyRate * 100, 1)} %</span>
          <span className="unit">годовых</span>
        </div>
      </div>

      <p className="fld-hint">
        Исключение кредиторки из базы дало бы по М3 около +494 тыс.₽/мес после налога.
        Это не исправление ошибки, а другая экономическая позиция — поэтому книга
        воспроизводится как есть, а расхождение подписано.
      </p>
    </div>
  )
}
