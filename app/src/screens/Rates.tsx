/**
 * Ставки и курсы: модуль пошлин (только ручной ввод), курсы, цепочка CZCE.
 * Просроченный месяц блокирует расчёт по зависимости, а не по списку.
 */

import { useState } from 'react'
import { fmt, fxCny, fxUsd, monthName, rubPerTon } from '../domain/units'
import { OriginMark, Panel, Tag } from '../components/bits'
import { CZCE_CONTRACT, CZCE_QUOTE, CZCE_ROUNDTRIP, CURRENT_MONTH as CUR, INPUT } from '../data/calc'

const CURRENT_MONTH = CUR

export function Rates() {
  const [month, setMonth] = useState(INPUT.duties.sunOil.month)
  const stale = month !== CURRENT_MONTH

  const quote = CZCE_QUOTE
  const contract = CZCE_CONTRACT

  return (
    <>
      <Panel
        title="Пошлины МСХ"
        aside={<Tag tone="quiet">только ручной ввод</Tag>}
        tone={stale ? 'alert' : 'plain'}
      >
        <div className="field-row">
          <label className="field">
            <span className="field-lbl">месяц действия</span>
            <select className="inp num" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="2026-07">{monthName('2026-07')}</option>
              <option value="2026-08">{monthName('2026-08')}</option>
              <option value="2026-09">{monthName('2026-09')}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-lbl">подсолнечное масло</span>
            <span className="inp inp--ro num">{rubPerTon(INPUT.duties.sunOil.value)}</span>
            <span className="field-unit">₽/т</span>
            <OriginMark origin="manual" note={INPUT.duties.sunOil.note} />
          </label>
          <label className="field">
            <span className="field-lbl">подсолнечный жмых</span>
            <span className="inp inp--ro num">{rubPerTon(INPUT.duties.sunMeal.value)}</span>
            <span className="field-unit">₽/т</span>
            <OriginMark origin="manual" note={INPUT.duties.sunMeal.note} />
          </label>
        </div>

        {stale ? (
          <div className="blockbox">
            <p className="blockbox-hd">
              ⏳ Ставки за {monthName(month)}. Сейчас {monthName(CURRENT_MONTH)}.
            </p>
            <p>
              ⛔ <b>М2 и М5 не считаются</b>: ставка за {monthName(CURRENT_MONTH)} не введена.
              Прошлым месяцем не считаю и старым значением не подменяю.
            </p>
            <p className="blockbox-ok">
              ✅ <b>М3 считается</b> — ядро, П/Ф и 3 категория идут по экспортной пошлине 6,5 %,
              ставка МСХ в их цене не участвует.
            </p>
            <button type="button" className="btn" onClick={() => setMonth(CURRENT_MONTH)}>
              Ввести ставки за {monthName(CURRENT_MONTH)}
            </button>
          </div>
        ) : (
          <p className="okbox">
            ✅ Ставки за текущий месяц. М2 и М5 считаются.
          </p>
        )}

        <p className="note">
          Источник — сайт МСХ, смотрится глазами. Автоподтяжки нет: сервер находится
          за пределами РФ, gov.ru его не пускает. Сетевые настройки сервера не трогаем —
          там живёт Telegram-сессия agro-intel. <b>Ручной ввод — штатный режим, а не временная мера.</b>
        </p>
      </Panel>

      <Panel title="Курсы валют">
        <div className="field-row">
          <div className="field">
            <span className="field-lbl">CNY / RUB</span>
            <span className="inp inp--ro num">{fxCny(INPUT.fx.cny.value)}</span>
            <OriginMark origin="auto" note={INPUT.fx.cny.note} />
          </div>
          <div className="field">
            <span className="field-lbl">USD / RUB</span>
            <span className="inp inp--ro num">{fxUsd(INPUT.fx.usd.value)}</span>
            <OriginMark origin="auto" note={INPUT.fx.usd.note} />
          </div>
        </div>
        <p className="note">
          Мосбиржа (iss.moex.com) в торговые часы рабочего дня, ЦБ РФ (cbr.ru) в выходные
          и при недоступности биржи. Оба источника с сервера доступны — проверено.
          Ручная подмена для сценария разрешена, но помечается и за официальный курс не выдаётся.
        </p>
      </Panel>

      <Panel title="Фьючерс CZCE — только для М4" aside={<Tag tone="decide">➕ сверх БДР</Tag>}>
        <div className="chain">
          <div className="chain-step">
            <span className="chain-lbl">котировка CZCE</span>
            <span className="chain-val num">{fmt(quote, 2)}</span>
            <span className="unit">CNY/т</span>
            <OriginMark origin="manual" note={`${INPUT.czce.contractMonth} · ${INPUT.czce.note}`} />
          </div>
          <div className="chain-op num">× {fmt(INPUT.czce.kChinaDuty, 2)} пошлина КНР</div>
          <div className="chain-op num">× {fmt(INPUT.czce.kChinaVat, 2)} НДС КНР</div>
          <div className="chain-op num">− {fmt(INPUT.czce.portCNY, 0)} порт</div>
          <div className="chain-step chain-step--out">
            <span className="chain-lbl">цена контракта</span>
            <span className="chain-val num">{fmt(contract, 2)}</span>
            <span className="unit">CNY/т</span>
          </div>
        </div>

        <p className="note">
          Канонический вход — <b>цена контракта</b> {fmt(contract, 2)} CNY/т: именно её фиксирует
          рабочий эталон. Котировка выведена обратной цепочкой ({fmt(contract, 0)} + {fmt(INPUT.czce.portCNY, 0)}) ÷ 0,91 ÷ 0,91
          и служит проверкой «попадает ли в реальный диапазон CZCE». Прямой прогон возвращает{' '}
          <b className="num">{fmt(CZCE_ROUNDTRIP, 4)}</b> CNY/т — цепочка замкнута.
          Все коэффициенты видимы и редактируемы.
        </p>
        <p className="note">
          Если ввести живую котировку, контракт будет считаться из неё, и результат законно
          разойдётся с эталоном — потому что изменился вход, а не расчёт.
        </p>
        <p className="note">
          <b>OI1! не подходит</b> — это непрерывный контракт, месяц через него не показать.
          Поэтому месяц контракта — отдельное обязательное поле: OIK май · OIN июль · OIU сентябрь.
          Скрейпинг TradingView запрещён правилами сервиса; допустимы официальный виджет,
          официальные котировки CZCE и ручной ввод.
        </p>
      </Panel>

      <Panel title="Настройки расчёта" tone="quiet">
        <table className="tbl">
          <tbody>
            <tr>
              <td>НДС на услуги</td>
              <td className="num ta-r">1,22 (22 %)</td>
              <td className="td-note">режим 1,20 — для сверки с эталонами A и B</td>
            </tr>
            <tr>
              <td>НДС на товар</td>
              <td className="num ta-r">1,10 (10 %)</td>
              <td className="td-note">на фин. результат не влияет: ×1,1 и ÷1,1 сокращаются</td>
            </tr>
            <tr>
              <td>Налог на прибыль</td>
              <td className="num ta-r">25 %</td>
              <td className="td-note">считается до вычета управленческого ФОТ — как в файле</td>
            </tr>
            <tr>
              <td>Экспортная пошлина ядро / П/Ф / 3 кат</td>
              <td className="num ta-r">6,5 %</td>
              <td className="td-note">в файле множитель 0,935 · актуальна с 01.01.2026</td>
            </tr>
            <tr>
              <td>Прогнозный дисконт</td>
              <td className="num ta-r">1,0000</td>
              <td className="td-note">
                в базовом расчёте отсутствует. 0,8636 из файла — прогноз снижения цены,
                не физический коэффициент. Доступен только в блоке сценариев
              </td>
            </tr>
            <tr>
              <td>Потери</td>
              <td className="num ta-r">1 % · М3 0 %</td>
              <td className="td-note">как в файле по каждой модели</td>
            </tr>
            <tr>
              <td>Стоимость переработки</td>
              <td className="num ta-r">5 000 ₽/т</td>
              <td className="td-note">
                параметр по модели. Расшифровка скрытого листа даёт ≈3 626 ₽/т, но на другой
                базе (90 т/сут, иные выходы) — сравнение некорректно
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </>
  )
}
