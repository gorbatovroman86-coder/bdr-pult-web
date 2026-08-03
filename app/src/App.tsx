import { useEffect, useState } from 'react'
import { Comparison } from './screens/Comparison'
import { ModelCard } from './screens/ModelCard'
import { Rates } from './screens/Rates'
import { Scenarios } from './screens/Scenarios'
import { byModelId, CALC_DATE, CALC_MONTH, INPUT } from './data/calc'
import { dateTime, fxCny, fxUsd, monthName, monthShort } from './domain/units'

type Tab = 'compare' | 'rates' | 'scenarios'

const TABS: { id: Tab; label: string }[] = [
  { id: 'compare', label: 'Сравнение' },
  { id: 'rates', label: 'Ставки и курсы' },
  { id: 'scenarios', label: 'Сценарии и история' },
]

/** Разбор адреса: #/rates · #/scenarios · #/model/M3 */
function readHash(): { tab: Tab; model: string | null } {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h.startsWith('model/')) return { tab: 'compare', model: h.slice(6).toUpperCase() }
  if (h === 'rates') return { tab: 'rates', model: null }
  if (h === 'scenarios') return { tab: 'scenarios', model: null }
  return { tab: 'compare', model: null }
}

export default function App() {
  const [route, setRoute] = useState(readHash)

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (hash: string) => {
    window.location.hash = hash
    setRoute(readHash())
  }

  const { tab, model: openModel } = route
  const setTab = (t: Tab) => go(t === 'compare' ? '/' : `/${t}`)
  const setOpenModel = (id: string | null) => go(id ? `/model/${id}` : '/')

  const model = openModel ? byModelId(openModel) : undefined

  return (
    <div className="shell">
      <header className="hdr">
        <div className="hdr-brand">
          <span className="hdr-logo" aria-hidden="true">
            БДР
          </span>
          <div>
            <h1 className="hdr-title">Сравнение режимов работы завода</h1>
            <p className="hdr-sub">ядро ↔ масло · месячная база · {monthShort(CALC_MONTH)}</p>
          </div>
        </div>

        <dl className="hdr-meta">
          <div>
            <dt>расчёт</dt>
            <dd className="num">{dateTime(CALC_DATE)}</dd>
          </div>
          <div>
            <dt>CNY / RUB</dt>
            <dd className="num">
              {fxCny(INPUT.fx.cny.value)} <span className="hdr-src">🔄 {INPUT.fx.cny.note}</span>
            </dd>
          </div>
          <div>
            <dt>USD / RUB</dt>
            <dd className="num">
              {fxUsd(INPUT.fx.usd.value)} <span className="hdr-src">🔄 {INPUT.fx.usd.note}</span>
            </dd>
          </div>
          <div>
            <dt>пошлины МСХ</dt>
            <dd className="num">
              {monthName(INPUT.duties.sunOil.month)} <span className="hdr-src">✋ вручную</span>
            </dd>
          </div>
        </dl>
      </header>

      <nav className="tabs" aria-label="Разделы">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id && !model ? ' tab--on' : ''}`}
            aria-current={tab === t.id && !model ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {model ? (
          <ModelCard c={model} onBack={() => setOpenModel(null)} />
        ) : tab === 'compare' ? (
          <Comparison onOpen={setOpenModel} />
        ) : tab === 'rates' ? (
          <Rates />
        ) : (
          <Scenarios />
        )}
      </main>

      <footer className="foot">
        <p>
          <b>ЭТАП 4.</b> Все показатели считает расчётное ядро — формулы перенесены из БДР
          с указанием «лист!ячейка» для каждой. Регрессия: 57 тестов, эталоны A, B, C;
          эталон A сверен со снимком книги по 143 ячейкам, расхождений нет.
        </p>
        <p className="foot-src">
          Источник: «БДР (мотивация).xlsx», снимок от 03.08.2026, только чтение. Условия
          эталона (C): прогнозного дисконта нет, НДС услуг 22 %, курс CNY 11,5000, USD 80,00,
          пошлины подсолнечника — реконструкция из файла.
        </p>
      </footer>
    </div>
  )
}
