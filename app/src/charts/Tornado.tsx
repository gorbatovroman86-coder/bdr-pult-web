/**
 * ЧУВСТВИТЕЛЬНОСТЬ. Что сильнее двигает фин. результат выбранного режима.
 *
 * Каждый драйвер отклоняется на ±шаг, и модель пересчитывается ДВИЖКОМ
 * целиком — не приближением по производной. Поэтому нелинейности
 * (налог, порог базиса, производные выходы) учтены как есть.
 */

import { useMemo, useState } from 'react'
import { computeAll } from '../state/compute'
import type { ComputedModel } from '../state/compute'
import type { Inputs } from '../state/inputs'
import { kRub, pct, signed } from '../domain/units'
import { C } from './palette'

interface Driver {
  path: string
  label: string
  note: string
}

/** Драйверы зависят от того, что режим покупает и что продаёт. */
function driversFor(c: ComputedModel, inputs: Inputs): Driver[] {
  const id = c.meta.id
  const p = `models.${id}`
  const d: Driver[] = [
    { path: `${p}.purchaseWithVat`, label: 'цена закупа сырья', note: 'D1' },
    { path: `${p}.processingWithVat`, label: 'стоимость переработки', note: 'H1' },
  ]

  const oilKey = c.priceKeys.oil
  const mainKey = c.priceKeys.kernel ?? oilKey
  if (mainKey) {
    d.push({ path: `contracts.${mainKey}.value`, label: 'контрактная цена основного продукта', note: mainKey })
    d.push({ path: `logistics.${mainKey}.value`, label: 'логистика основного продукта', note: 'экспортное плечо' })
  }

  // курс той валюты, в которой номинирован основной контракт
  const usdDriven = mainKey === 'rapeOilIR'
  d.push({
    path: usdDriven ? 'fxUsd.value' : 'fxCny.value',
    label: usdDriven ? 'курс USD/RUB' : 'курс CNY/RUB',
    note: usdDriven ? 'иранский базис' : 'все юаневые контракты',
  })

  // выход основного продукта
  if (c.meta.producesOilLine && inputs.models[id].yieldOil > 0) {
    d.push({ path: `${p}.yieldOil`, label: 'выход масла', note: 'F5, жмых производный' })
  }
  if (inputs.models[id].yieldKernel > 0) {
    d.push({ path: `${p}.yieldKernel`, label: 'выход ядра', note: 'F1, П/Ф производный' })
  }

  // пошлина — та, что реально в цене этого режима
  if (c.meta.raw === 'sunflower' && oilKey === 'sunOil') {
    d.push({ path: 'dutySunOil.value', label: 'пошлина МСХ на масло', note: 'месячная ставка' })
  }
  if (c.priceKeys.kernel) {
    d.push({ path: 'dutyKernelPercent.value', label: 'экспортная пошлина на ядро', note: '6,5 %' })
  }
  return d
}

const get = (o: unknown, p: string) =>
  p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o) as number | null

function withPath(i: Inputs, path: string, v: number): Inputs {
  const keys = path.split('.')
  const next = structuredClone(i) as unknown as Record<string, unknown>
  let cur: Record<string, unknown> = next
  for (let k = 0; k < keys.length - 1; k++) cur = cur[keys[k]] as Record<string, unknown>
  cur[keys[keys.length - 1]] = v
  return next as unknown as Inputs
}

export function Tornado({ c, inputs }: { c: ComputedModel; inputs: Inputs }) {
  const [stepPct, setStepPct] = useState(10)

  const rows = useMemo(() => {
    const baseNet = c.result.netResult
    const d = stepPct / 100
    return driversFor(c, inputs)
      .map((drv) => {
        const v0 = get(inputs, drv.path)
        if (v0 === null || v0 === 0) return null
        const run = (mult: number) => {
          const res = computeAll(withPath(inputs, drv.path, v0 * mult))
          const m = res.models.find((x) => x.meta.id === c.meta.id)
          return m && m.blockers.length === 0 ? m.result.netResult : null
        }
        const down = run(1 - d)
        const up = run(1 + d)
        if (down === null || up === null) return null
        return {
          ...drv,
          base: v0,
          down: down - baseNet,
          up: up - baseNet,
          span: Math.abs(up - down),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.span - a.span)
  }, [c, inputs, stepPct])

  if (rows.length === 0) return <p className="note">Нет драйверов для этого режима.</p>

  const maxSpan = Math.max(...rows.map((r) => Math.max(Math.abs(r.down), Math.abs(r.up))))

  return (
    <div className="tornado">
      <div className="tornado-head">
        <span className="fld-lbl">отклонение драйвера</span>
        <div className="sortbar">
          {[5, 10, 20].map((s) => (
            <button
              key={s}
              type="button"
              className={`chip${stepPct === s ? ' chip--on' : ''}`}
              aria-pressed={stepPct === s}
              onClick={() => setStepPct(s)}
            >
              ±{s} %
            </button>
          ))}
        </div>
        <span className="tornado-base num">
          база {kRub(c.result.netResult)}
          <span className="unit">тыс.₽/мес</span>
        </span>
      </div>

      <div className="tornado-rows">
        {rows.map((r) => {
          const w = (x: number) => (Math.abs(x) / maxSpan) * 50
          return (
            <div key={r.path} className="tor">
              <span className="tor-lbl">
                {r.label}
                <span className="tor-note">{r.note}</span>
              </span>
              <span className="tor-track">
                <span className="tor-axis" aria-hidden="true" />
                <span
                  className="tor-bar tor-bar--down"
                  style={{
                    width: `${w(r.down)}%`,
                    [r.down < 0 ? 'right' : 'left']: '50%',
                    background: r.down < 0 ? C.alert : C.ok,
                  }}
                />
                <span
                  className="tor-bar tor-bar--up"
                  style={{
                    width: `${w(r.up)}%`,
                    [r.up < 0 ? 'right' : 'left']: '50%',
                    background: r.up < 0 ? C.alert : C.ok,
                  }}
                />
              </span>
              <span className="tor-vals num">
                <span className="tor-v">−{stepPct} %: {signed(r.down, 0)}</span>
                <span className="tor-v">+{stepPct} %: {signed(r.up, 0)}</span>
              </span>
            </div>
          )
        })}
      </div>

      <p className="fld-hint">
        Отсортировано по величине эффекта: сверху то, что двигает результат сильнее всего.
        Зелёное — рост фин. результата, красное — падение; направление подписано числом,
        поэтому цвет не единственный маркер. Каждая точка — <b>полный пересчёт движком</b>,
        не линейное приближение, поэтому налог и производные выходы учтены честно.
        Итог в тыс.₽/мес; для справки {pct(stepPct / 100)} % от базы.
      </p>
    </div>
  )
}
