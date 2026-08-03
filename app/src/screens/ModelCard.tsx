/**
 * Карточка режима. Всё считается ядром; каждый итог раскрывается формулой
 * со ссылкой на «лист!ячейка».
 */

import { useState } from 'react'
import type { ProductId } from '../domain/types'
import { PRODUCT_LABEL_FULL, RAW_LABEL, DESTINATION_LABEL } from '../domain/types'
import { fmt, kRub, pct, rub, rubPerTon, share, signed, tons } from '../domain/units'
import { traceNetResult, traceRevenue, type Trace } from '../domain/formulaMap'
import { Ribbon, RibbonLegend } from '../components/Ribbon'
import { BasisRuler } from '../components/BasisRuler'
import { OriginMark, Panel, Stat, Tag, WarnLine } from '../components/bits'
import { useStore } from '../state/store'
import type { ComputedModel } from '../state/compute'
import { MEASURED, PRODUCT_DESTINATION } from '../data/notes'
import { isPayrollSet, loadPayroll, savePayroll, type Payroll } from '../data/payroll'

const dutyText = (id: ProductId, pct: number | null): string =>
  id === 'kernel' || id === 'semi' || id === 'cat3' ? (pct === null ? '—' : `${fmt(pct, 1)} %`) : '—'

function Waterfall({ c }: { c: ComputedModel }) {
  const r = c.result
  const steps = [
    { label: 'Выручка', v: r.revenueTotal, sign: 1 },
    { label: 'Себестоимость', v: -r.cost, sign: -1 },
    { label: 'Отгрузка', v: -r.shippingTotal, sign: -1 },
    { label: '% пользования деньгами', v: -r.capital.interestMonthly, sign: -1 },
    { label: 'Налог 25 %', v: -r.tax, sign: -1 },
  ]
  const max = r.revenueTotal
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
            style={{ left: 0, width: `${(r.netResult / max) * 100}%` }}
          />
        </span>
        <span className="wf-val num">{kRub(r.netResult)}</span>
      </div>
    </div>
  )
}

function TraceNode({ t }: { t: Trace }) {
  return (
    <details className="fdet">
      <summary>
        {t.label} — строка {t.row} · {t.cell}
      </summary>
      <p className="fbox-f">{t.formula}</p>
      <p className="fbox-s num">{t.substituted}</p>
      {t.deviation && <p className="fdet-note">⚠ {t.deviation}</p>}
      {t.children?.map((ch) => <TraceNode key={ch.label} t={ch} />)}
    </details>
  )
}

/**
 * ФОТ вводится в браузере: значений в репозитории нет, он публичный.
 * Введённое хранится только в этом браузере и никуда не отправляется.
 */
function PayrollBlock() {
  const [p, setP] = useState<Payroll>(loadPayroll)
  const [edit, setEdit] = useState(false)

  const put = (field: 'project' | 'total', raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, '')
    const next: Payroll = {
      ...p,
      [field]: cleaned === '' ? null : Number(cleaned),
      enteredAt: new Date().toISOString(),
    }
    setP(next)
    savePayroll(next)
  }

  if (!isPayrollSet(p) && !edit) {
    return (
      <>
        <p className="ref-p">
          <b>Не задано.</b> Управленческий ФОТ — внутренние данные, в репозитории
          их нет. Введите значения: они сохранятся только в этом браузере
          и никуда не отправятся.
        </p>
        <button type="button" className="btn" onClick={() => setEdit(true)}>
          Ввести ФОТ
        </button>
        <p className="ref-p">
          На расчёт не влияет: в фин. результат ФОТ не входит, налог 25 %
          считается до него — как в книге.
        </p>
      </>
    )
  }

  return (
    <>
      <div className="field-row">
        <label className="field">
          <span className="field-lbl">проект, ₽/мес</span>
          <input
            className="inp num"
            inputMode="numeric"
            value={p.project ?? ''}
            placeholder="не задано"
            onChange={(e) => put('project', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-lbl">итого, ₽/мес</span>
          <input
            className="inp num"
            inputMode="numeric"
            value={p.total ?? ''}
            placeholder="не задано"
            onChange={(e) => put('total', e.target.value)}
          />
        </label>
      </div>
      <div className="ref-two">
        <Stat label="проект" value={p.project === null ? '—' : rub(p.project)} unit="₽/мес" />
        <Stat label="итого" value={p.total === null ? '—' : rub(p.total)} unit="₽/мес" />
      </div>
      <p className="ref-p">
        ✋ Введено вручную, хранится только в этом браузере. В фин. результат
        не входит, налог 25 % считается до него — как в книге. Выводов по ФОТ
        не делаем.
      </p>
    </>
  )
}

export function ModelCard({ c, onBack }: { c: ComputedModel; onBack: () => void }) {
  const [showMeasured, setShowMeasured] = useState(false)
  const { inputs } = useStore()
  const { meta, result: r } = c
  const mp = inputs.models[meta.id]

  const trace = traceNetResult(
    r,
    meta.sheet,
    inputs.serviceVatDivisor,
    c.params.purchaseWithVat,
    c.params.processingWithVat,
    c.params.moneyRate,
  )
  const revRows = traceRevenue(r, meta.sheet, c.prices)
  const soldOverstated = r.soldTonsAsInFile > r.rawTons

  return (
    <>
      <div className="crumb">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ‹ к сравнению
        </button>
        <div className="crumb-title">
          <span className="num crumb-id">{meta.id}</span>
          <h1 className="crumb-name">{meta.name}</h1>
        </div>
        <div className="crumb-meta num">
          лист «{meta.sheet}» · {RAW_LABEL[meta.raw]} · {fmt(c.params.intakeTonsPerDay, 0)} т/сут ×{' '}
          {fmt(c.params.daysPerMonth, 0)} сут = {tons(r.rawTons)} т/мес
        </div>
      </div>

      <Panel
        title="Раскладка тонны"
        aside={<OriginMark origin="file" note={`выходы из «${meta.sheet}»`} />}
      >
        <Ribbon data={r.balance} />
        <RibbonLegend data={r.balance} />
      </Panel>

      <div className="stats">
        <Stat
          label="Фин. результат"
          value={kRub(r.netResult)}
          unit="тыс.₽/мес"
          size="lg"
          hint="за месяц окт.2026"
        />
        <Stat
          label="На тонну сырья"
          value={rubPerTon(r.netPerRawTon)}
          unit="₽/т"
          hint={`база ${tons(r.rawTons)} т сырья`}
        />
        <Stat
          label="Рентабельность"
          value={r.margin === null ? '—' : `${pct(r.margin)} %`}
          hint={r.margin === null ? 'не определена: выручка равна нулю' : 'фин. результат ÷ выручка'}
        />
        <Stat
          label="Продажа, т (как в файле)"
          value={tons(r.soldTonsAsInFile)}
          unit="т"
          hint={
            soldOverstated ? (
              <span className="hint-warn">⚠ включает П/Ф, который не продаётся — D1</span>
            ) : (
              'строка 9'
            )
          }
        />
      </div>

      {r.huskFuelSaving > 0 && (
        <Panel title="Экономия на топливе от лузги" tone="quiet">
          <p className="note">
            <b className="num">{kRub(r.huskFuelSaving)}</b> тыс.₽/мес. Показывается отдельной
            строкой: лузга сжигается на собственном котле, это экономия, а не выручка. В строку
            выручки и в фин. результат не входит.
          </p>
        </Panel>
      )}

      {c.basis && (
        <Panel
          title="Базис масла — считаются оба, берётся лучший"
          aside={<Tag tone="decide">➕ сверх БДР</Tag>}
        >
          <div className="basis-pair">
            {[c.basis.winner, c.basis.loser].map((cand, i) => (
              <div key={cand.destination} className={`basis-card${i === 0 ? ' basis-card--win' : ''}`}>
                <div className="basis-hd">
                  {i === 0 && <span aria-hidden="true">✦ </span>}
                  {DESTINATION_LABEL[cand.destination]}
                  {i === 0 && ' — выигрывает'}
                </div>
                <table className="tbl tbl--tight">
                  <tbody>
                    <tr>
                      <td>контракт</td>
                      <td className="num ta-r">
                        {fmt(cand.contract, 0)} {cand.currency}/т ×{' '}
                        {fmt(cand.fx, cand.currency === 'CNY' ? 4 : 2)}
                      </td>
                    </tr>
                    <tr>
                      <td>в рублях</td>
                      <td className="num ta-r">{rubPerTon(cand.contract * cand.fx)}</td>
                    </tr>
                    <tr>
                      <td>− логистика</td>
                      <td className="num ta-r">{rubPerTon(cand.logisticsRubPerTon)}</td>
                    </tr>
                    <tr className="tr-total">
                      <td>нетто</td>
                      <td className="num ta-r">{rubPerTon(cand.net)} ₽/т</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <p className="basis-gap">
            Отрыв <span className="num b">{signed(c.basis.gapRubPerTon, 2)}</span> ₽/т.{' '}
            {Math.abs(c.basis.distanceRub) < 0.5 && (
              <b>Базисы практически сравнялись — победитель может смениться от любого движения курса.</b>
            )}
          </p>

          <BasisRuler b={c.basis} />

          <p className="basis-note">
            Жмых от базиса не зависит: всегда Китай, {fmt(inputs.contracts.rapeMeal.value ?? 0, 0)} CNY −{' '}
            {rubPerTon(inputs.logistics.rapeMeal.value ?? 0)} ₽/т. В М1 и М4 жмых идентичен.
          </p>
        </Panel>
      )}

      <Panel title="От выручки к прибыли">
        <Waterfall c={c} />
        <div className="fdet-wrap">
          <TraceNode t={trace} />
        </div>
      </Panel>

      <Panel title="Выручка по продуктам">
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>продукт</th>
                <th className="ta-r">тонн/мес</th>
                <th className="ta-r">нетто-цена</th>
                <th className="ta-r">выручка, тыс.₽</th>
                <th>ячейка</th>
              </tr>
            </thead>
            <tbody>
              {revRows.map((row) => (
                <tr key={row.label} className={row.price === 'цена не задана' ? 'tr-muted' : undefined}>
                  <td>{row.label}</td>
                  <td className="num ta-r">{row.tons}</td>
                  <td className="num ta-r">{row.price}</td>
                  <td className="num ta-r b">{row.sum}</td>
                  <td className="num td-note">{row.cell}</td>
                </tr>
              ))}
              <tr className="tr-total">
                <td>ИТОГО</td>
                <td />
                <td />
                <td className="num ta-r">{kRub(r.revenueTotal)}</td>
                <td className="num td-note">«{meta.sheet}»!B16</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Цены">
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>продукт</th>
                <th className="ta-r">пошлина</th>
                <th className="ta-r">логистика</th>
                <th className="ta-r">нетто, ₽/т</th>
                <th className="ta-r">с НДС, ₽/т</th>
                <th>направление</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(c.prices) as ProductId[]).map((id) => {
                const net = c.prices[id]
                if (net === undefined) return null
                return (
                  <tr key={id}>
                    <td>{PRODUCT_LABEL_FULL[id]}</td>
                    <td className="num ta-r">{dutyText(id, inputs.dutyKernelPercent.value)}</td>
                    <td className="num ta-r">
                      {rubPerTon(inputs.logistics[c.priceKeys[id as keyof typeof c.priceKeys]!]?.value ?? 0)}
                    </td>
                    <td className="num ta-r b">{rubPerTon(net)}</td>
                    <td className="num ta-r">{rubPerTon(net * 1.1)}</td>
                    <td>
                      {id === 'oil' && c.basis
                        ? DESTINATION_LABEL[c.basis.winner.destination]
                        : PRODUCT_DESTINATION[id]}
                    </td>
                  </tr>
                )
              })}
              {(r.tons.husk ?? 0) > 0 && (
                <tr className="tr-muted">
                  <td>лузга</td>
                  <td colSpan={4}>
                    цена не задана — не продаётся, сжигается на своём котле. Экономия на топливе
                    задаётся параметром, сейчас 0
                  </td>
                  <td className="num">Q3</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="pricenote">
          Логистика вычитается как есть: экспортное плечо, НДС 0 %. Внутренняя отгрузка
          (1 500 / 3 300 / 1 100 ₽/т) — <b>другое плечо</b>, делится на ставку НДС услуг. Цена ×1,1
          и выручка ÷1,1 сокращаются, поэтому в расчёт идёт нетто; цена с НДС нужна для дебиторки.
        </p>
      </Panel>

      <Panel title="Капитал и деньги">
        <table className="tbl">
          <tbody>
            <tr>
              <td>Запас сырья</td>
              <td className="num ta-r">{rub(r.capital.stock)} ₽</td>
              <td className="td-note">строка 35 · N1 × L1 × D1, по цене с НДС</td>
            </tr>
            <tr>
              <td>Кредиторка (½ мес)</td>
              <td className="num ta-r">{rub(r.capital.payables)} ₽</td>
              <td className="td-note">
                строка 36 · ⚠ прибавлена, не вычтена. Решение владельца модели, не факт из БДР
              </td>
            </tr>
            <tr>
              <td>Дебиторка</td>
              <td className="num ta-r">{rub(r.capital.receivables)} ₽</td>
              <td className="td-note">
                строка 37 · по цене <b>с НДС</b>, только по ядру
                {r.capital.receivables === 0 && ' — здесь ядра нет, поэтому 0 (D4)'}
              </td>
            </tr>
            <tr className="tr-total">
              <td>Вложенный капитал</td>
              <td className="num ta-r">{rub(r.capital.total)} ₽</td>
              <td className="td-note">строка 38 · запас + кредиторка + дебиторка</td>
            </tr>
            <tr>
              <td>% пользования, 15,5 % годовых</td>
              <td className="num ta-r">{kRub(r.capital.interestMonthly)} тыс.₽/мес</td>
              <td className="td-note">
                строки 40–41 · за год {kRub(r.capital.interestYear)} тыс.₽
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Справочно — в фин. результат не входит" tone="quiet">
        <div className="ref-grid">
          <div>
            <h3 className="ref-h">Управленческий ФОТ</h3>
            <PayrollBlock />
          </div>

          <div>
            <h3 className="ref-h">План против замера</h3>
            <button type="button" className="btn btn--ghost" onClick={() => setShowMeasured((v) => !v)}>
              {showMeasured ? 'скрыть' : 'показать'} замеры
            </button>
            {showMeasured && (
              <table className="tbl tbl--tight">
                <thead>
                  <tr>
                    <th>сорт</th>
                    <th className="ta-r">план</th>
                    <th className="ta-r">замер</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>ядро</td>
                    <td className="num ta-r">{share(mp.yieldKernel)} %</td>
                    <td className="num ta-r">{share(MEASURED.kernelShare)} %</td>
                  </tr>
                  <tr>
                    <td>полуфабрикат</td>
                    <td className="num ta-r">
                      {share(
                        1 - mp.yieldKernel - mp.yieldCat3 - mp.yieldHusk,
                      )}{' '}
                      %
                    </td>
                    <td className="num ta-r">{share(MEASURED.semiShare)} %</td>
                  </tr>
                  <tr>
                    <td>3 категория</td>
                    <td className="num ta-r">{share(mp.yieldCat3)} %</td>
                    <td className="num ta-r">{share(MEASURED.cat3Share)} %</td>
                  </tr>
                  <tr className="tr-total">
                    <td>сумма</td>
                    <td className="num ta-r">{share(MEASURED.planShare)} %</td>
                    <td className="num ta-r">{share(MEASURED.sumShare)} %</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="ref-p">
              Общий выход почти совпадает, различается структура сортов. Замеры — справочная
              сверка, в расчёт не подставляются.
            </p>

            <h3 className="ref-h">В БДР не определено</h3>
            <p className="ref-p">
              Энергозатраты · ГСМ · амортизация · постоянные расходы · EBITDA · валовая прибыль ·
              точка безубыточности · загрузка мощностей. Всё производственное внутри ставки
              переработки {rub(mp.processingWithVat)} ₽/т. Оценок не подставляем.
            </p>
          </div>
        </div>
      </Panel>

      {c.warnings.length > 0 && (
        <Panel title="Известные особенности этого режима" tone="quiet">
          <ul className="warnlist">
            {c.warnings.map((w, i) => (
              <WarnLine key={i} w={w} />
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
