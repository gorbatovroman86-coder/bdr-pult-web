import { useEffect, useState } from 'react'
import { Comparison } from './screens/Comparison'
import { ModelCard } from './screens/ModelCard'
import { Rates } from './screens/Rates'
import { Journal } from './screens/Journal'
import { Scenarios } from './screens/Scenarios'
import { StoreProvider, useStore } from './state/store'
import { ConflictBar, SyncBadge } from './components/Sync'
import { dateTime, fxCny, fxUsd, monthName, monthShort } from './domain/units'

type Tab = 'compare' | 'rates' | 'journal' | 'scenarios'

const TABS: { id: Tab; label: string }[] = [
  { id: 'compare', label: 'Сравнение' },
  { id: 'rates', label: 'Ставки и курсы' },
  { id: 'journal', label: 'Журнал расчётов' },
  { id: 'scenarios', label: 'Сценарии и история' },
]

/** Разбор адреса: #/rates · #/journal · #/scenarios · #/model/M3 */
function readHash(): { tab: Tab; model: string | null } {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h.startsWith('model/')) return { tab: 'compare', model: h.slice(6).toUpperCase() }
  if (h === 'rates') return { tab: 'rates', model: null }
  if (h === 'journal') return { tab: 'journal', model: null }
  if (h === 'scenarios') return { tab: 'scenarios', model: null }
  return { tab: 'compare', model: null }
}

function Shell() {
  const { inputs, computed } = useStore()
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

  const model = openModel ? computed.models.find((m) => m.meta.id === openModel) : undefined

  return (
    <div className="shell">
      <header className="hdr">
        <div className="hdr-brand">
          <span className="hdr-logo" aria-hidden="true">
            БДР
          </span>
          <div>
            <h1 className="hdr-title">Сравнение режимов работы завода</h1>
            <p className="hdr-sub">ядро ↔ масло · месячная база · {monthShort(inputs.calcMonth)}</p>
          </div>
        </div>

        <dl className="hdr-meta">
          <div>
            <dt>расчёт</dt>
            <dd className="num">{dateTime(new Date().toISOString())}</dd>
          </div>
          <div>
            <dt>CNY / RUB</dt>
            <dd className="num">
              {fxCny(inputs.fxCny.value ?? 0)} <span className="hdr-src">{inputs.fxCny.origin === 'auto' ? '🔄 Мосбиржа' : '✋ вручную'}</span>
            </dd>
          </div>
          <div>
            <dt>USD / RUB</dt>
            <dd className="num">
              {fxUsd(inputs.fxUsd.value ?? 0)} <span className="hdr-src">{inputs.fxUsd.origin === 'auto' ? '🔄 Мосбиржа' : '✋ вручную'}</span>
            </dd>
          </div>
          <div>
            <dt>пошлины МСХ</dt>
            <dd className="num">
              {monthName(inputs.dutySunOil.month ?? '')} <span className="hdr-src">✋ вручную</span>
            </dd>
          </div>
          <div>
            <dt>хранилище</dt>
            <dd>
              <SyncBadge />
            </dd>
          </div>
        </dl>
      </header>

      <ConflictBar />

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
        ) : tab === 'journal' ? (
          <Journal />
        ) : (
          <Scenarios />
        )}
      </main>

      <footer className="foot">
        <p>
          Все показатели считает расчётное ядро — формулы перенесены из БДР с указанием
          «лист!ячейка» для каждой. Любая правка входных данных пересчитывает пять моделей
          немедленно. Регрессия: эталоны A, B, C; эталон A сверен со снимком книги
          по 143 ячейкам, расхождений нет.
        </p>
        <p className="foot-src">
          Источник: «БДР (мотивация).xlsx», снимок от 03.08.2026, только чтение. Базовые
          значения воспроизводят рабочий эталон; кнопка «Вернуть базовые значения»
          возвращает ровно его.
        </p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
