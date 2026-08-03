/**
 * Экран сравнения — ведомость, не сетка карточек.
 * Данные приходят из расчётного ядра, литералов эталона больше нет.
 */

import { useMemo, useState } from 'react'
import { RAW_LABEL } from '../domain/types'
import { kRub, pct, rubPerTon, signed, tons } from '../domain/units'
import { Ribbon } from '../components/Ribbon'
import { Panel, Tag, WarnLine } from '../components/bits'
import { ASSUMPTIONS, COMPUTED, type ComputedModel } from '../data/calc'

type SortKey = 'net' | 'perTon' | 'margin'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'net', label: 'фин. результат' },
  { key: 'perTon', label: '₽/т сырья' },
  { key: 'margin', label: 'рентабельность' },
]

export function Comparison({ onOpen }: { onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>('net')

  const rows = useMemo(() => {
    const pick = (c: ComputedModel) =>
      sort === 'net'
        ? c.result.netResult
        : sort === 'perTon'
          ? c.result.netPerRawTon
          : (c.result.margin ?? -Infinity)
    return [...COMPUTED].sort((a, b) => pick(b) - pick(a))
  }, [sort])

  const live = rows.filter((c) => c.blockers.length === 0)
  const best = live[0]

  return (
    <>
      <Panel
        title="Сравнение режимов"
        aside={
          <div className="sortbar" role="group" aria-label="Сортировка">
            <span className="sortbar-lbl">сортировка</span>
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`chip${sort === s.key ? ' chip--on' : ''}`}
                aria-pressed={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="ledger-head" aria-hidden="true">
          <span className="lh-model">режим</span>
          <span className="lh-ribbon">раскладка тонны сырья</span>
          <span className="lh-num">т/мес</span>
          <span className="lh-num">₽/т сырья</span>
          <span className="lh-num">рентаб.</span>
          <span className="lh-num lh-num--main">фин. результат</span>
        </div>

        <ol className="ledger">
          {rows.map((c) => {
            const { meta, result: r } = c
            const blocked = c.blockers.length > 0
            const isBest = !blocked && best && meta.id === best.meta.id
            const gap = best ? r.netResult - best.result.netResult : 0

            if (blocked) {
              return (
                <li key={meta.id} className="row row--blocked">
                  <div className="row-open row-open--blocked">
                    <div className="row-model">
                      <div className="row-id">
                        <span className="num">{meta.id}</span>
                      </div>
                      <div className="row-name">{meta.name}</div>
                      <div className="row-raw">{RAW_LABEL[meta.raw]}</div>
                    </div>
                    <div className="blocked-body">
                      <p className="blocked-hd">⛔ Расчёт остановлен</p>
                      <ul className="blocked-list">
                        {c.blockers.map((b) => (
                          <li key={b.paramId}>{b.message}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              )
            }

            return (
              <li key={meta.id} className={`row${isBest ? ' row--best' : ''}`}>
                <button
                  type="button"
                  className="row-open"
                  onClick={() => onOpen(meta.id)}
                  aria-label={`Открыть карточку режима ${meta.id} ${meta.name}`}
                >
                  <div className="row-model">
                    <div className="row-id">
                      {isBest && (
                        <span className="row-star" aria-hidden="true">
                          ✦
                        </span>
                      )}
                      <span className="num">{meta.id}</span>
                    </div>
                    <div className="row-name">{meta.name}</div>
                    <div className="row-raw">{RAW_LABEL[meta.raw]}</div>
                    {isBest ? (
                      <Tag tone="decide">лучший режим</Tag>
                    ) : (
                      <span className="row-gap num">
                        {signed(gap, 2)}
                        <span className="unit">тыс.₽ к лучшему</span>
                      </span>
                    )}
                    {c.basis && (
                      <span className="row-basis">
                        базис {c.basis.winner.destination === 'IR' ? 'Иран' : 'Малайзия'} · отрыв{' '}
                        <span className="num">{signed(c.basis.gapRubPerTon, 2)}</span> ₽/т
                      </span>
                    )}
                  </div>

                  <div className="row-ribbon">
                    <Ribbon data={r.balance} />
                  </div>

                  <div className="row-num num">
                    {tons(r.rawTons)}
                    <span className="row-num-cap">сырья, т/мес</span>
                  </div>
                  <div className="row-num num">
                    {rubPerTon(r.netPerRawTon)}
                    <span className="row-num-cap">на тонну сырья</span>
                  </div>
                  <div className="row-num num">
                    {pct(r.margin)}
                    {r.margin !== null && ' %'}
                    <span className="row-num-cap">
                      {r.margin === null ? 'не определена: выручка 0' : 'фин.рез ÷ выручка'}
                    </span>
                  </div>
                  <div className="row-num row-num--main num">
                    {kRub(r.netResult)}
                    <span className="row-num-cap">фин. результат, тыс.₽/мес</span>
                  </div>
                </button>

                {c.warnings.length > 0 && (
                  <ul className="row-warns">
                    {c.warnings.slice(0, 2).map((w, i) => (
                      <WarnLine key={i} w={w} />
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>

        <p className="ledger-foot">
          Удельные показатели считаются на тонну <b>сырья</b> (L1 × N1), никогда на строку 9
          «Продажа, т»: в М2 и М5 туда попадает полуфабрикат, который не продаётся. Ширина ленты
          у всех режимов одинакова — масштаб в колонке «т/мес».
        </p>
      </Panel>

      <Panel title="Допущения, влияющие на сопоставимость" tone="alert">
        <ul className="warnlist">
          {ASSUMPTIONS.map((w, i) => (
            <WarnLine key={i} w={w} />
          ))}
        </ul>
        <p className="assump-foot">
          Все три смещают сравнение в пользу подсолнечных режимов.{' '}
          <b>
            Разница между близкими моделями может быть меньше суммы этих допущений — на малых
            отрывах рейтинг не считать надёжным.
          </b>
        </p>
      </Panel>
    </>
  )
}
