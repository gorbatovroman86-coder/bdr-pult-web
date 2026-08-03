/**
 * Курсы валют.
 *
 * Курс тянет сервер — из браузера ни биржа, ни ЦБ напрямую недоступны.
 * Экран обязан отвечать на четыре вопроса сразу: сколько, на какую дату,
 * откуда и когда обновлялось.
 *
 * Подставленный вручную курс за официальный не выдаётся никогда: он
 * помечается, а рядом показывается настоящий курс источника, чтобы
 * расхождение было видно, а не пряталось.
 */

import { useStore } from '../state/store'
import { Field } from './Field'
import { Panel, Tag } from './bits'
import { SOURCE_LABEL, isStale, type FxCode } from '../state/useFx'
import { dateTime, dateOnly, fmt } from '../domain/units'

const ROWS: { code: FxCode; path: 'fxCny' | 'fxUsd'; label: string; digits: number; min: number; max: number; hint: string }[] = [
  { code: 'CNY', path: 'fxCny', label: 'CNY / RUB', digits: 4, min: 5, max: 25, hint: 'Все юаневые контракты.' },
  { code: 'USD', path: 'fxUsd', label: 'USD / RUB', digits: 2, min: 40, max: 200, hint: 'Нужен только для иранского базиса M1.' },
]

export function FxPanel() {
  const { inputs, fx } = useStore()

  return (
    <Panel
      title="Курсы валют"
      aside={
        <div className="xfer-acts">
          <Tag tone="quiet">тянет сервер</Tag>
          <button type="button" className="btn btn--ghost" onClick={fx.refresh} disabled={fx.busy}>
            {fx.busy ? 'обновляю…' : 'Обновить курсы'}
          </button>
        </div>
      }
    >
      <div className="fldrow">
        {ROWS.map((r) => {
          const cur = inputs[r.path]
          const got = fx.rates[r.code]
          const manual = cur.origin === 'manual'
          const differs = manual && got !== undefined && got.value !== cur.value
          return (
            <div key={r.code} className="fxrow">
              <Field
                path={`${r.path}.value`}
                label={r.label}
                digits={r.digits}
                min={r.min}
                max={r.max}
                source={manual ? '✋ подставлено вручную' : got ? `🔄 ${SOURCE_LABEL[got.source] ?? got.source}` : '🔄 авто'}
                hint={r.hint}
              />
              <div className="fxmeta">
                {got ? (
                  <>
                    <span className="fxmeta-line">
                      источник: <b>{SOURCE_LABEL[got.source] ?? got.source}</b>, курс на{' '}
                      <b className="num">{dateOnly(got.rateDate)}</b>
                    </span>
                    <span className="fxmeta-line">
                      обновлено {dateTime(got.fetchedAt)}
                      {isStale(got) && <b className="fxmeta-old"> — курс старше суток</b>}
                    </span>
                    {differs && (
                      <span className="fxmeta-diff">
                        ⚠ у источника <b className="num">{fmt(got.value, r.digits)}</b> — ваше значение
                        подставлено вручную и официальным не является
                      </span>
                    )}
                  </>
                ) : (
                  <span className="fxmeta-line">курс с сервера не получен</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className={fx.message ? 'xfer-warn' : 'note'}>
        {fx.message
          ? `⚠ ${fx.message}`
          : fx.fetchedAt
            ? `Последнее успешное обновление: ${dateTime(fx.fetchedAt)}. Биржа в торговые часы, ЦБ РФ в выходные и когда биржа молчит.`
            : 'Курсы тянет сервер: биржа в торговые часы, ЦБ РФ в выходные. Без сервера курс вводится вручную.'}
      </p>
    </Panel>
  )
}
