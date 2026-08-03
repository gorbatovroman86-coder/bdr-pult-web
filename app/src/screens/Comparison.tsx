/**
 * ЭКРАН СРАВНЕНИЯ.
 *
 * Задача экрана — за две секунды и без чтения чисел ответить, какой режим
 * выгоднее и насколько. Поэтому сверху рейтинг и столбцы, а всё остальное
 * уровнями ниже: сначала ответ, потом обоснование, потом разбор.
 */

import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { ranked } from '../state/compute'
import { fmt, kRub, monthName, pct, rubPerTon, signed, tons } from '../domain/units'
import { RAW_LABEL } from '../domain/types'
import { Panel, Tag, WarnLine } from '../components/bits'
import { BlockedList, RankChart, RankGaps } from '../charts/RankChart'
import { CostStructure, MarginChart, RevenueStructure, Waterfall } from '../charts/Structure'
import { SankeyBalance } from '../charts/Sankey'
import { Tornado } from '../charts/Tornado'
import { CapitalWaterfall } from '../charts/CapitalWaterfall'
import { ASSUMPTIONS } from '../data/notes'

type SortKey = 'net' | 'perTon' | 'margin'
type Deep = 'sankey' | 'tornado' | 'capital'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'net', label: 'фин. результат' },
  { key: 'perTon', label: '₽/т сырья' },
  { key: 'margin', label: 'рентабельность' },
]

const DEEP: { key: Deep; label: string }[] = [
  { key: 'sankey', label: 'Материальный баланс' },
  { key: 'tornado', label: 'Чувствительность' },
  { key: 'capital', label: 'Капитал и цена денег' },
]

export function Comparison({ onOpen }: { onOpen: (id: string) => void }) {
  const { inputs, computed, changed } = useStore()
  const [sort, setSort] = useState<SortKey>('net')
  const [deep, setDeep] = useState<Deep>('sankey')

  const rows = useMemo(() => ranked(computed, sort), [computed, sort])
  const live = rows.filter((m) => m.blockers.length === 0)
  const [pick, setPick] = useState<string | null>(null)
  const selected = live.find((m) => m.meta.id === pick) ?? live[0]

  const staleDuty = inputs.dutySunOil.month !== inputs.currentMonth

  return (
    <>
      {/* ── Условия расчёта: на каком курсе и ставках посчитан рейтинг */}
      <section className="conds">
        <div className="conds-item">
          <span className="conds-k">курс CNY / RUB</span>
          <span className="conds-v num">{fmt(inputs.fxCny.value ?? 0, 4)}</span>
          <span className="conds-s">{inputs.fxCny.origin === 'auto' ? '🔄 авто' : '✋ вручную'}</span>
        </div>
        <div className="conds-item">
          <span className="conds-k">курс USD / RUB</span>
          <span className="conds-v num">{fmt(inputs.fxUsd.value ?? 0, 2)}</span>
          <span className="conds-s">{inputs.fxUsd.origin === 'auto' ? '🔄 авто' : '✋ вручную'}</span>
        </div>
        <div className={`conds-item${staleDuty ? ' conds-item--warn' : ''}`}>
          <span className="conds-k">пошлины МСХ</span>
          <span className="conds-v num">{monthName(inputs.dutySunOil.month ?? '')}</span>
          <span className="conds-s">
            {rubPerTon(inputs.dutySunOil.value ?? 0)} / {rubPerTon(inputs.dutySunMeal.value ?? 0)} ₽/т
          </span>
        </div>
        <div className="conds-item">
          <span className="conds-k">НДС услуг</span>
          <span className="conds-v num">{fmt((inputs.serviceVatDivisor - 1) * 100, 0)} %</span>
          <span className="conds-s">налог {fmt(inputs.taxRate * 100, 0)} % · деньги {fmt(inputs.moneyRate * 100, 1)} %</span>
        </div>
        <div className="conds-item">
          <span className="conds-k">параметры</span>
          <span className="conds-v num">{changed.length === 0 ? 'базовые' : `${changed.length} изм.`}</span>
          <span className="conds-s">{changed.length === 0 ? 'рабочий эталон' : 'отличаются от базы'}</span>
        </div>
      </section>

      {/* ── ЯДРО: рейтинг и столбцы */}
      <Panel
        title="Какой режим выгоднее"
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
        {live.length > 0 && (
          <p className="verdict">
            Выгоднее всего — <b className="num">{live[0].meta.id}</b> {live[0].meta.name}:{' '}
            <b className="num verdict-v">{kRub(live[0].result.netResult)}</b> тыс.₽/мес
            {live.length > 1 && (
              <>
                , это на <b className="num">{signed(live[0].result.netResult - live[1].result.netResult, 0)}</b>{' '}
                тыс.₽ больше второго места.
              </>
            )}
          </p>
        )}

        <RankChart rows={rows} selected={selected?.meta.id ?? ''} onSelect={setPick} />
        <RankGaps rows={rows} />
        <BlockedList rows={rows} />

        <p className="fld-hint">
          Столбцы на общей базовой линии, значения подписаны. Место читается номером,
          высотой и весом подписи — цвет добавлен четвёртым признаком и в одиночку
          ничего не значит. Клик по столбцу выбирает режим для разборов ниже.
        </p>
      </Panel>

      {/* ── Второй уровень */}
      <Panel title="Рентабельность">
        <MarginChart rows={rows} />
        <p className="fld-hint">Фин. результат ÷ выручка. Общая шкала для всех режимов.</p>
      </Panel>

      <div className="two-col">
        <Panel title="Структура выручки">
          <RevenueStructure rows={rows} />
        </Panel>
        <Panel title="Структура затрат">
          <CostStructure rows={rows} inputsVat={inputs.serviceVatDivisor} />
        </Panel>
      </div>

      {selected && (
        <Panel
          title={`От выручки к прибыли — ${selected.meta.id}`}
          aside={<ModelPicker rows={live} value={selected.meta.id} onChange={setPick} />}
        >
          <Waterfall m={selected} />
        </Panel>
      )}

      {/* ── Третий уровень */}
      {selected && (
        <Panel
          title={`Разбор режима ${selected.meta.id}`}
          aside={
            <div className="sortbar" role="group" aria-label="Что показать">
              {DEEP.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`chip${deep === d.key ? ' chip--on' : ''}`}
                  aria-pressed={deep === d.key}
                  onClick={() => setDeep(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="deep-pick">
            <ModelPicker rows={live} value={selected.meta.id} onChange={setPick} />
          </div>
          {deep === 'sankey' && <SankeyBalance c={selected} />}
          {deep === 'tornado' && <Tornado c={selected} inputs={inputs} />}
          {deep === 'capital' && <CapitalWaterfall c={selected} moneyRate={inputs.moneyRate} />}
        </Panel>
      )}

      {/* ── Допущения: важно, но не должно спорить с рейтингом */}
      <details className="assump">
        <summary>
          Допущения, влияющие на сопоставимость — {ASSUMPTIONS.length}
        </summary>
        <div className="assump-body">
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
        </div>
      </details>

      {/* ── Детализация */}
      <Panel title="Сводная таблица" aside={<Tag tone="quiet">детализация</Tag>}>
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>режим</th>
                <th>сырьё</th>
                <th className="ta-r">т/мес</th>
                <th className="ta-r">выручка</th>
                <th className="ta-r">себест.</th>
                <th className="ta-r">отгрузка</th>
                <th className="ta-r">% денег</th>
                <th className="ta-r">налог</th>
                <th className="ta-r">фин. рез.</th>
                <th className="ta-r">₽/т сырья</th>
                <th className="ta-r">рентаб.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) =>
                m.blockers.length > 0 ? (
                  <tr key={m.meta.id} className="tr-muted">
                    <td>
                      <b className="num">{m.meta.id}</b>
                    </td>
                    <td colSpan={10}>⛔ {m.blockers[0].message}</td>
                  </tr>
                ) : (
                  <tr key={m.meta.id}>
                    <td>
                      <button type="button" className="btn btn--ghost tbl-open" onClick={() => onOpen(m.meta.id)}>
                        <b className="num">{m.meta.id}</b> {m.meta.name}
                      </button>
                    </td>
                    <td className="td-note">{RAW_LABEL[m.meta.raw]}</td>
                    <td className="num ta-r">{tons(m.result.rawTons)}</td>
                    <td className="num ta-r">{kRub(m.result.revenueTotal)}</td>
                    <td className="num ta-r">{kRub(m.result.cost)}</td>
                    <td className="num ta-r">{kRub(m.result.shippingTotal)}</td>
                    <td className="num ta-r">{kRub(m.result.capital.interestMonthly)}</td>
                    <td className="num ta-r">{kRub(m.result.tax)}</td>
                    <td className="num ta-r b">{kRub(m.result.netResult)}</td>
                    <td className="num ta-r">{rubPerTon(m.result.netPerRawTon)}</td>
                    <td className="num ta-r">{pct(m.result.margin)} %</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className="fld-hint">
          Все удельные показатели считаются на тонну <b>сырья</b> (L1 × N1), никогда на строку 9
          «Продажа, т»: в М2 и М5 туда попадает полуфабрикат, который не продаётся.
          Клик по названию открывает карточку режима.
        </p>
      </Panel>
    </>
  )
}

function ModelPicker({
  rows,
  value,
  onChange,
}: {
  rows: { meta: { id: string; name: string } }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="sortbar" role="group" aria-label="Выбор режима">
      <span className="sortbar-lbl">режим</span>
      {rows.map((m) => (
        <button
          key={m.meta.id}
          type="button"
          className={`chip${value === m.meta.id ? ' chip--on' : ''}`}
          aria-pressed={value === m.meta.id}
          onClick={() => onChange(m.meta.id)}
        >
          {m.meta.id}
        </button>
      ))}
    </div>
  )
}
