/**
 * Исходные данные: курсы, пошлины, контрактные цены, логистика, настройки.
 * Всё редактируемое и живое — правка немедленно пересчитывает пять моделей.
 */

import { useStore } from '../state/store'
import { fmt, monthName, rubPerTon } from '../domain/units'
import { Field } from '../components/Field'
import { OriginMark, Panel, Tag } from '../components/bits'
import { PayrollBlock } from '../components/PayrollBlock'
import type { ContractKey } from '../state/inputs'

const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

const PRODUCT_ROWS: { key: ContractKey; label: string; cur: string; dest: string }[] = [
  { key: 'kernel', label: 'ядро', cur: 'CNY', dest: 'Китай' },
  { key: 'semi', label: 'полуфабрикат', cur: 'CNY', dest: 'Китай' },
  { key: 'cat3', label: '3 категория', cur: 'CNY', dest: 'Китай' },
  { key: 'sunOil', label: 'подсолнечное масло', cur: 'CNY', dest: 'Китай' },
  { key: 'sunMeal', label: 'подсолнечный жмых', cur: 'CNY', dest: 'Китай' },
  { key: 'rapeOilCN', label: 'рапсовое масло', cur: 'CNY', dest: 'Китай' },
  { key: 'rapeOilMY', label: 'рапсовое масло', cur: 'CNY', dest: 'Малайзия' },
  { key: 'rapeOilIR', label: 'рапсовое масло', cur: 'USD', dest: 'Иран' },
  { key: 'rapeMeal', label: 'рапсовый жмых', cur: 'CNY', dest: 'Китай' },
]

export function Rates() {
  const { inputs, computed, set, resetAll, changed } = useStore()
  const staleDuty =
    inputs.dutySunOil.month !== inputs.currentMonth ||
    inputs.dutySunMeal.month !== inputs.currentMonth
  const blockedIds = computed.models.filter((m) => m.blockers.length > 0).map((m) => m.meta.id)

  return (
    <>
      {changed.length > 0 && (
        <Panel
          title="Внесены изменения"
          aside={
            <button type="button" className="btn" onClick={resetAll}>
              Вернуть базовые значения
            </button>
          }
          tone="quiet"
        >
          <p className="note">
            Изменено полей: <b className="num">{changed.length}</b>. Правки сохраняются
            в этом браузере и пересчитывают модели немедленно. Возврат к базовым значениям
            даёт ровно рабочий эталон.
          </p>
        </Panel>
      )}

      <Panel
        title="Пошлины МСХ"
        aside={<Tag tone="quiet">только ручной ввод</Tag>}
        tone={staleDuty ? 'alert' : 'plain'}
      >
        <div className="fldrow">
          <label className="fld fld--md">
            <span className="fld-lbl">месяц действия ставок</span>
            <select
              className="fld-inp num"
              value={inputs.dutySunOil.month ?? ''}
              onChange={(e) => {
                set('dutySunOil.month', e.target.value)
                set('dutySunMeal.month', e.target.value)
              }}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
            <span className="fld-meta">
              <span className="fld-src">текущий месяц — {monthName(inputs.currentMonth)}</span>
            </span>
          </label>

          <Field
            path="dutySunOil.value"
            label="подсолнечное масло"
            unit="₽/т"
            min={0}
            max={30000}
            source="✋ вручную, сайт МСХ"
            hint="Публикуется 1-го числа месяца."
          />
          <Field
            path="dutySunMeal.value"
            label="подсолнечный жмых"
            unit="₽/т"
            min={0}
            max={30000}
            source="✋ вручную, сайт МСХ"
            hint="Публикуется 1-го числа месяца."
          />
        </div>

        {staleDuty ? (
          <div className="blockbox">
            <p className="blockbox-hd">
              ⏳ Ставки заданы за {monthName(inputs.dutySunOil.month ?? '')}. Текущий месяц —{' '}
              {monthName(inputs.currentMonth)}.
            </p>
            <p>
              ⛔ <b>Расчёт остановлен: {blockedIds.join(', ') || '—'}</b>. Прошлым месяцем
              не считаю и старым значением не подменяю.
            </p>
            <p className="blockbox-ok">
              ✅ Остальные считаются — у них ставка МСХ в цене не участвует.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                set('dutySunOil.month', inputs.currentMonth)
                set('dutySunMeal.month', inputs.currentMonth)
              }}
            >
              Подтвердить ставки за {monthName(inputs.currentMonth)}
            </button>
          </div>
        ) : (
          <p className="okbox">✅ Ставки за текущий месяц. Все модели считаются.</p>
        )}

        <p className="note">
          Источник — сайт МСХ, смотрится глазами. Автоподтяжки нет: сервер проекта находится
          за пределами РФ, gov.ru его не пускает. <b>Ручной ввод — штатный режим.</b>
        </p>
      </Panel>

      <Panel title="Курсы валют">
        <div className="fldrow">
          <Field
            path="fxCny.value"
            label="CNY / RUB"
            digits={4}
            min={5}
            max={25}
            source={inputs.fxCny.origin === 'auto' ? '🔄 Мосбиржа' : '✋ подставлено вручную'}
            hint="Мосбиржа в торговые часы, ЦБ РФ в выходные."
          />
          <Field
            path="fxUsd.value"
            label="USD / RUB"
            min={40}
            max={200}
            source={inputs.fxUsd.origin === 'auto' ? '🔄 Мосбиржа' : '✋ подставлено вручную'}
            hint="Нужен только для иранского базиса M1."
          />
        </div>
        <p className="note">
          Подставленный вручную курс помечается и за официальный не выдаётся.
        </p>
      </Panel>

      <Panel
        title="Контрактные цены и логистика"
        aside={<Tag tone="quiet">по продукту, не по модели</Tag>}
      >
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>продукт</th>
                <th>направление</th>
                <th className="ta-r">контракт</th>
                <th className="ta-r">логистика, ₽/т</th>
                <th className="ta-r">нетто, ₽/т</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCT_ROWS.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="td-note">{r.dest}</td>
                  <td className="ta-r">
                    <Field
                      path={`contracts.${r.key}.value`}
                      label=""
                      unit={r.cur}
                      digits={0}
                      min={0}
                      max={100000}
                      size="sm"
                    />
                  </td>
                  <td className="ta-r">
                    <Field
                      path={`logistics.${r.key}.value`}
                      label=""
                      digits={0}
                      min={0}
                      max={100000}
                      size="sm"
                    />
                  </td>
                  <td className="num ta-r b">
                    {computed.net[r.key] === null || computed.net[r.key] === undefined
                      ? '—'
                      : rubPerTon(computed.net[r.key]!)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pricenote">
          Нетто считается сразу: <b>контракт × курс − пошлина − логистика</b>. Логистика здесь —
          экспортное плечо, НДС 0 %, вычитается как есть. Внутренняя отгрузка — другое плечо,
          она в «Настройках расчёта».
        </p>
      </Panel>

      <Panel
        title="Фьючерс CZCE — проверка цены рапсового масла"
        aside={<Tag tone="decide">➕ сверх БДР</Tag>}
      >
        <div className="chain">
          <div className="chain-step chain-step--out">
            <span className="chain-lbl">цена контракта — канон</span>
            <span className="chain-val num">
              {computed.czce.contract === null ? '—' : fmt(computed.czce.contract, 2)}
            </span>
            <span className="unit">CNY/т</span>
          </div>
          <div className="chain-op num">+ {fmt(inputs.czce.portCNY, 0)} порт</div>
          <div className="chain-op num">÷ {fmt(inputs.czce.kChinaVat, 2)} НДС КНР</div>
          <div className="chain-op num">÷ {fmt(inputs.czce.kChinaDuty, 2)} пошлина КНР</div>
          <div className="chain-step">
            <span className="chain-lbl">эквивалент котировки</span>
            <span className="chain-val num">
              {computed.czce.quote === null ? '—' : fmt(computed.czce.quote, 2)}
            </span>
            <span className="unit">CNY/т</span>
            <OriginMark origin="manual" note={inputs.czce.contractMonth} />
          </div>
        </div>
        <p className="note">
          Канонический вход — <b>цена контракта</b>: её фиксирует рабочий эталон. Котировка
          выводится обратной цепочкой и служит проверкой попадания в реальный диапазон биржи.
          Прямой прогон возвращает{' '}
          <b className="num">
            {computed.czce.roundtrip === null ? '—' : fmt(computed.czce.roundtrip, 4)}
          </b>{' '}
          CNY/т — цепочка замкнута.
        </p>
        <p className="note">
          <b>OI1! не подходит</b> — непрерывный контракт, месяц через него не показать. Скрейпинг
          TradingView запрещён правилами сервиса; допустимы официальный виджет, официальные
          котировки CZCE и ручной ввод.
        </p>
      </Panel>

      <details className="settings">
        <summary>Настройки расчёта — меняются редко</summary>
        <div className="settings-body">
          <div className="fldrow">
            <Field path="dutyKernelPercent.value" label="экспортная пошлина РФ на ядро, П/Ф, 3 кат" unit="%" digits={1} min={0} max={50} hint="В книге записана множителем 0,935." />
            <Field path="serviceVatDivisor" label="НДС услуг, делитель" digits={2} min={1} max={1.5} hint="1,22 = 22 %. Режим 1,20 — для сверки с эталонами A и B." />
            <Field path="goodsVatDivisor" label="НДС товара, делитель" digits={2} min={1} max={1.5} hint="На фин. результат не влияет: ×1,1 и ÷1,1 сокращаются." />
            <Field path="taxRate" label="налог на прибыль" digits={2} min={0} max={1} hint="Считается до вычета управленческого ФОТ — как в книге." />
            <Field path="moneyRate" label="% пользования деньгами, год" digits={3} min={0} max={1} hint="0,155 = 15,5 % годовых." />
            <Field path="daysPerMonth" label="суток в месяце" digits={0} min={1} max={31} />
          </div>
          <div className="fldrow">
            <Field path="shipKernelAndCat3" label="отгрузка ядра и 3 кат" unit="₽/т" digits={0} min={0} max={20000} hint="Внутреннее плечо, делится на НДС услуг." />
            <Field path="shipOil" label="отгрузка масла" unit="₽/т" digits={0} min={0} max={20000} />
            <Field path="shipMeal" label="отгрузка жмыха" unit="₽/т" digits={0} min={0} max={20000} />
            <Field path="huskFuelSaving" label="экономия на топливе от лузги" unit="₽/т лузги" digits={0} min={0} max={20000} hint="Отдельной строкой ниже фин. результата, в выручку не входит." />
          </div>

          <div>
            <h3 className="ref-h">Управленческий ФОТ — справочно, в фин. результат не входит</h3>
            <PayrollBlock />
          </div>
        </div>
      </details>
    </>
  )
}
