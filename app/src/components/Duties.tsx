/**
 * СТАВКИ ПОШЛИН МСХ.
 *
 * Порядок на экране отвечает порядку доверия: сначала то, что подтверждено
 * и применено, потом то, что требует решения, потом история, и только в конце
 * ручной ввод — как резерв, а не как основной путь.
 *
 * Ставка, введённая руками, автосбором не перебивается и официальной
 * не притворяется.
 */

import { useStore } from '../state/store'
import { DUTY_LABEL, DUTY_PATH } from '../state/useDuties'
import type { DutyRate } from '../state/api'
import { dateTime, fmt, monthName } from '../domain/units'
import { Tag } from './bits'
import { C } from '../charts/palette'

/** Страница МСХ — для сверки глазами, если возникли сомнения. */
const MCX_URL = 'https://mcx.gov.ru/'

function Sources({ r }: { r: DutyRate }) {
  return (
    <span className="duty-src">
      {r.sources.length === 1
        ? `1 источник: ${r.sources[0]}`
        : `${r.sources.length} источника: ${r.sources.join(', ')}`}
    </span>
  )
}

/** Ряд ставок по месяцам — маленький график рядом со списком. */
function History({ rates, product }: { rates: DutyRate[]; product: 'oil' | 'meal' }) {
  const row = rates
    .filter((r) => r.product === product)
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))

  if (row.length < 2) return null

  const vals = row.map((r) => r.rate)
  const hi = Math.max(...vals)
  const W = 260
  const H = 46
  const step = W / (row.length - 1)
  const y = (v: number) => H - 6 - (hi === 0 ? 0 : (v / hi) * (H - 12))
  const d = row.map((r, i) => `${i === 0 ? 'M' : 'L'}${i * step},${y(r.rate)}`).join(' ')

  return (
    <svg className="duty-spark" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Ряд ставок: ${row.map((r) => `${monthName(r.month)} ${r.rate}`).join(', ')}`}>
      <path d={d} fill="none" stroke={C.decide} strokeWidth={2} />
      {row.map((r, i) => (
        <circle key={r.month} cx={i * step} cy={y(r.rate)} r={3} fill={C.decide} />
      ))}
    </svg>
  )
}

export function DutiesBlock() {
  const { inputs, computed, duties, set } = useStore()

  const month = inputs.currentMonth
  const forMonth = duties.rates.filter((r) => r.month === month)
  const needsHuman = forMonth.filter((r) => r.needsHuman)
  const blockedIds = computed.models.filter((m) => m.blockers.length > 0).map((m) => m.meta.id)

  const applied = (r: DutyRate) => {
    const cur = inputs[DUTY_PATH[r.product]]
    return cur.value === r.rate && cur.month === r.month
  }

  return (
    <>
      <div className="duty-hd">
        <Tag tone={duties.available ? 'ok' : 'quiet'}>
          {duties.available ? 'автосбор из отраслевых каналов' : 'автосбор выключен'}
        </Tag>
        <button type="button" className="btn btn--ghost" onClick={duties.refresh} disabled={duties.busy}>
          {duties.busy ? 'смотрю…' : 'Проверить источники'}
        </button>
        <a className="btn btn--ghost" href={MCX_URL} target="_blank" rel="noreferrer">
          Страница МСХ — сверить глазами
        </a>
      </div>

      {duties.scannedAt && (
        <p className="fld-hint">
          Источники просмотрены {dateTime(duties.scannedAt)}. Прямой подтяжки с сайта МСХ нет:
          сервер за пределами РФ, gov.ru его не пускает. Ставка собирается из уже накопленных
          сообщений отраслевых каналов и сверяется между источниками.
        </p>
      )}

      {duties.message && <p className="xfer-warn">⚠ {duties.message}</p>}

      {/* ── Что действует сейчас */}
      {forMonth.length > 0 && (
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>продукт</th>
                <th className="ta-r">ставка, ₽/т</th>
                <th>месяц</th>
                <th>подтверждение</th>
                <th>получено</th>
                <th className="ta-r">состояние</th>
              </tr>
            </thead>
            <tbody>
              {forMonth.map((r) => (
                <tr key={`${r.month}|${r.product}`}>
                  <td>{DUTY_LABEL[r.product]}</td>
                  <td className="num ta-r b">{fmt(r.rate, 2)}</td>
                  <td>{monthName(r.month)}</td>
                  <td className="td-note"><Sources r={r} /></td>
                  <td className="num td-note">{dateTime(r.firstSeenAt)}</td>
                  <td className="ta-r">
                    {applied(r) ? (
                      <span className="duty-ok">✅ применена</span>
                    ) : (
                      <button type="button" className="btn" onClick={() => duties.apply(r)}>
                        Применить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Что требует решения человека */}
      {needsHuman.map((r) => (
        <div key={`h|${r.product}`} className="blockbox">
          {r.status === 'disputed' ? (
            <>
              <p className="blockbox-hd">
                ⚠ Источники разошлись: {DUTY_LABEL[r.product]}, {monthName(r.month)}
              </p>
              <p>Автоматически не применяю. Выберите значение:</p>
              <div className="duty-variants">
                {r.variants.map((v) => (
                  <button
                    key={v.rate}
                    type="button"
                    className="btn"
                    onClick={() => duties.apply({ ...r, rate: v.rate, sources: v.sources })}
                  >
                    <b className="num">{fmt(v.rate, 2)} ₽/т</b>
                    <span className="duty-vsrc">{v.sources.join(', ')}</span>
                  </button>
                ))}
              </div>
            </>
          ) : r.alarm ? (
            <>
              <p className="blockbox-hd">
                ⚠ Сторож: {DUTY_LABEL[r.product]}, {monthName(r.month)}
              </p>
              <p className="num duty-pair">
                было {r.previousRate === null ? '—' : fmt(r.previousRate, 2)} ₽/т
                {' → '}
                стало {fmt(r.rate, 2)} ₽/т
              </p>
              <p>{r.alarmMessage}</p>
              <button type="button" className="btn" onClick={() => duties.apply(r)}>
                Сверил, применить {fmt(r.rate, 2)} ₽/т
              </button>
            </>
          ) : (
            <>
              <p className="blockbox-hd">
                ⚠ Подтверждено одним источником: {DUTY_LABEL[r.product]}, {monthName(r.month)}
              </p>
              <p>
                <b className="num">{fmt(r.rate, 2)} ₽/т</b> — <Sources r={r} />.
                Второго подтверждения нет, поэтому применяю только по вашему слову.
              </p>
              <button type="button" className="btn" onClick={() => duties.apply(r)}>
                Применить
              </button>
            </>
          )}
        </div>
      ))}

      {/* ── Чего не нашли вовсе */}
      {duties.available && duties.missing.length > 0 && (
        <div className="blockbox">
          <p className="blockbox-hd">
            ⏳ Ставка за {monthName(month)} не найдена: {duties.missing.map((p) => DUTY_LABEL[p]).join(', ')}
          </p>
          <p>
            {blockedIds.length > 0
              ? <>⛔ <b>Расчёт остановлен: {blockedIds.join(', ')}</b>. Прошлым месяцем не считаю и старым значением не подменяю.</>
              : 'Действующие ставки заданы, расчёт идёт — но нового значения пока нет.'}
          </p>
          <p className="blockbox-ok">Введите ставку вручную ниже или дождитесь публикации.</p>
        </div>
      )}

      {/* ── История */}
      {duties.rates.length > 1 && (
        <details className="duty-hist">
          <summary>История ставок по месяцам — {duties.rates.length}</summary>
          <div className="duty-hist-body">
            {(['oil', 'meal'] as const).map((p) => {
              const row = duties.rates
                .filter((r) => r.product === p)
                .slice()
                .sort((a, b) => b.month.localeCompare(a.month))
              if (row.length === 0) return null
              return (
                <div key={p} className="duty-hist-row">
                  <h4 className="ref-h">{DUTY_LABEL[p]}</h4>
                  <History rates={duties.rates} product={p} />
                  <ul className="duty-list">
                    {row.map((r) => (
                      <li key={r.month}>
                        <span>{monthName(r.month)}</span>
                        <b className="num">{fmt(r.rate, 2)} ₽/т</b>
                        <span className="td-note">
                          {r.status === 'confirmed' ? 'автосбор' : r.status === 'single' ? 'один источник' : 'спор'}
                          {' · '}{r.sources.length} кан.
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </details>
      )}

      <p className="note">
        Ручной ввод ниже — <b>резерв</b> на случай, когда автосбор ничего не нашёл или
        источники разошлись. Введённое руками автосбор не перебивает, помечается
        «✋ вручную» и за официальное не выдаётся.
        {' '}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            set('dutySunOil.month', month)
            set('dutySunMeal.month', month)
          }}
        >
          Подтвердить действующие ставки за {monthName(month)}
        </button>
      </p>
    </>
  )
}
