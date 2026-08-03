/**
 * УРОВЕНЬ 2 — параметры конкретного режима.
 *
 * Здесь только то, что реально различается между режимами. Общие параметры
 * показываются рядом как СПРАВКА без возможности правки: иначе пользователь
 * думает, что правит одну модель, а меняет все пять.
 */

import { Field } from './Field'
import { Panel, Tag } from './bits'
import { useStore } from '../state/store'
import { fmt, rubPerTon, share, tons } from '../domain/units'
import type { ComputedModel } from '../state/compute'

export function ModelParams({ c }: { c: ComputedModel }) {
  const { inputs } = useStore()
  const id = c.meta.id
  const m = inputs.models[id]
  const p = `models.${id}`

  const semi = 1 - m.yieldKernel - m.yieldCat3 - m.yieldHusk
  const meal = c.meta.producesOilLine ? 1 - m.lossShare - m.yieldOil : 0
  const stage1 = m.yieldKernel + m.yieldCat3 + m.yieldHusk + (c.meta.oilFromSemi || id === 'M3' ? semi : 0)

  return (
    <Panel
      title={`Параметры режима ${id}`}
      aside={<Tag tone="decide">действуют только на этот режим</Tag>}
    >
      <div className="fldrow">
        <Field path={`${p}.intakeTonsPerDay`} label="заход сырья" unit="т/сут" digits={0} min={1} max={500}
          hint={`Месячная база: ${tons(c.result.rawTons)} т при ${fmt(inputs.daysPerMonth, 0)} сут.`} />
        <Field path={`${p}.purchaseWithVat`} label="цена закупа сырья" unit="₽/т с НДС" digits={0} min={0} max={200000} />
        <Field path={`${p}.processingWithVat`} label="стоимость переработки" unit="₽/т с НДС" digits={0} min={0} max={50000}
          hint="Расшифровка скрытого листа книги даёт ≈3 626 ₽/т, но на другой базе." />
        <Field path={`${p}.shippingSemi`} label="ставка отгрузки П/Ф" unit="₽/т" digits={0} min={0} max={20000}
          hint="H2. Заполнена только там, где полуфабрикат действительно продаётся." />
      </div>

      <h3 className="ref-h">Выходы продукции</h3>
      <div className="fldrow">
        <Field path={`${p}.yieldKernel`} label="выход ядра" unit="доля" digits={3} min={0} max={1} />
        <Field path={`${p}.yieldCat3`} label="выход 3 категории" unit="доля" digits={3} min={0} max={1} />
        <Field path={`${p}.yieldHusk`} label="выход лузги" unit="доля" digits={3} min={0} max={1} />
        <Field path={`${p}.yieldOil`} label="выход масла" unit="доля" digits={3} min={0} max={1} />
        <Field path={`${p}.lossShare`} label="потери" unit="доля" digits={3} min={0} max={0.5}
          hint="В книге зашиты внутрь выхода жмыха как 1 %; у М3 потерь нет." />
      </div>

      <div className="derived">
        <div className="derived-item">
          <span className="derived-lbl">выход П/Ф — производный</span>
          <span className="derived-val num">{share(semi)} %</span>
          <span className="derived-f num">= 1 − ядро − 3 кат − лузга</span>
        </div>
        <div className="derived-item">
          <span className="derived-lbl">выход жмыха — производный</span>
          <span className="derived-val num">{share(meal)} %</span>
          <span className="derived-f num">= (1 − потери) − масло</span>
        </div>
        <div className="derived-item">
          <span className="derived-lbl">баланс первого передела</span>
          <span className={`derived-val num${Math.abs(stage1 - 1) > 1e-9 ? ' derived-val--bad' : ''}`}>
            {share(stage1)} %
          </span>
          <span className="derived-f">{Math.abs(stage1 - 1) > 1e-9 ? '⚠ должно быть 100 %' : 'сходится'}</span>
        </div>
      </div>
      <p className="fld-hint">
        П/Ф и жмых <b>не задаются вручную</b> — это формулы книги. Меняя заданные выходы,
        вы двигаете и производные.
      </p>

      <h3 className="ref-h">Общие параметры — действуют на все пять режимов</h3>
      <div className="xscroll">
        <table className="tbl tbl--tight">
          <tbody>
            <tr>
              <td>курс CNY / RUB</td>
              <td className="num ta-r">{fmt(inputs.fxCny.value ?? 0, 4)}</td>
              <td className="td-note">{inputs.fxCny.origin === 'auto' ? '🔄 авто' : '✋ вручную'}</td>
            </tr>
            <tr>
              <td>курс USD / RUB</td>
              <td className="num ta-r">{fmt(inputs.fxUsd.value ?? 0, 2)}</td>
              <td className="td-note">{inputs.fxUsd.origin === 'auto' ? '🔄 авто' : '✋ вручную'}</td>
            </tr>
            <tr>
              <td>НДС услуг, делитель</td>
              <td className="num ta-r">{fmt(inputs.serviceVatDivisor, 2)}</td>
              <td className="td-note">строки 23–29</td>
            </tr>
            <tr>
              <td>% пользования деньгами</td>
              <td className="num ta-r">{fmt(inputs.moneyRate * 100, 1)} %</td>
              <td className="td-note">годовых</td>
            </tr>
            <tr>
              <td>отгрузка ядра и 3 кат / масла / жмыха</td>
              <td className="num ta-r">
                {rubPerTon(inputs.shipKernelAndCat3)} / {rubPerTon(inputs.shipOil)} / {rubPerTon(inputs.shipMeal)}
              </td>
              <td className="td-note">₽/т, внутреннее плечо</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="fld-hint">
        Это <b>справка, а не поля ввода</b>. Общий параметр правится только на экране
        «Исходные данные» — там видно, что он меняет все пять режимов сразу.
      </p>
    </Panel>
  )
}
