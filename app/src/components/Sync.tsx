/**
 * Состояние обмена с сервером — на экране всегда.
 *
 * Индикатор в шапке отвечает на один вопрос: сохранено или нет. Расхождение
 * двух компьютеров выводится отдельной полосой поверх содержимого: пока
 * человек не выбрал, какой набор оставить, работать дальше вслепую нельзя.
 */

import { useState } from 'react'
import { useStore } from '../state/store'
import { syncLabel } from '../state/sync'
import { diffInputs } from '../state/transfer'
import { isConfigured } from '../state/api'
import { dateTime, fmt } from '../domain/units'
import { Panel, Tag } from './bits'

const shown = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'не задано'
  if (typeof v === 'number') return fmt(v, Number.isInteger(v) ? 0 : 4)
  return String(v)
}

/** Индикатор в шапке: когда последний раз сохранено на сервер. */
export function SyncBadge() {
  const { sync } = useStore()
  const { status, lastSavedAt } = sync.state
  return (
    <button
      type="button"
      className={`syncb syncb--${status}`}
      onClick={sync.refresh}
      title={`${sync.state.message} Нажмите, чтобы проверить связь.`}
    >
      <span className="syncb-dot" aria-hidden="true" />
      <span className="syncb-body">
        <span className="syncb-word">{syncLabel(sync.state)}</span>
        <span className="syncb-at num">
          {lastSavedAt ? dateTime(lastSavedAt) : '—'}
        </span>
      </span>
    </button>
  )
}

/** Полоса расхождения: показываем оба состояния и даём выбрать. */
export function ConflictBar() {
  const { sync } = useStore()
  const c = sync.state.conflict
  const [open, setOpen] = useState(false)
  if (!c) return null

  const diffs = diffInputs(c.mine.inputs, c.theirs.inputs)

  return (
    <div className="conflict">
      <div className="conflict-hd">
        <b>⚠ Набор параметров менялся с двух компьютеров.</b> Ничего не затираю —
        выберите, какой оставить.
      </div>

      <div className="conflict-cols">
        <div className="conflict-col">
          <div className="conflict-k">здесь, в этом браузере</div>
          <div className="conflict-fp num">{c.mine.fingerprint}</div>
          <div className="conflict-at">
            правка {c.mine.at ? dateTime(c.mine.at) : 'не отмечена'}
          </div>
          <button type="button" className="btn" onClick={() => sync.resolveConflict('mine')}>
            Оставить это
          </button>
        </div>
        <div className="conflict-col">
          <div className="conflict-k">на сервере</div>
          <div className="conflict-fp num">{c.theirs.fingerprint}</div>
          <div className="conflict-at">
            сохранено {c.theirs.at ? dateTime(c.theirs.at) : '—'}
          </div>
          <button type="button" className="btn" onClick={() => sync.resolveConflict('theirs')}>
            Взять серверное
          </button>
        </div>
      </div>

      <button type="button" className="btn btn--ghost conflict-more" onClick={() => setOpen((v) => !v)}>
        {open ? 'Скрыть отличия' : `Показать отличия — ${diffs.length}`}
      </button>

      {open && (
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>параметр</th>
                <th className="ta-r">здесь</th>
                <th className="ta-r">на сервере</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.path}>
                  <td>{d.label}</td>
                  <td className="num ta-r">{shown(d.from)}</td>
                  <td className="num ta-r">{shown(d.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Настройка подключения. Адрес в коде не зашит — он задаётся здесь. */
export function Connection() {
  const { sync } = useStore()
  const [base, setBase] = useState(sync.config.base)
  const [user, setUser] = useState(sync.config.user)
  const [pass, setPass] = useState(sync.config.pass)
  const on = isConfigured(sync.config)

  return (
    <Panel
      title="Хранилище на сервере"
      aside={<Tag tone={on ? 'ok' : 'quiet'}>{on ? 'подключено' : 'не задано'}</Tag>}
    >
      <p className="note">
        Пока адрес не задан, пульт работает как раньше: параметры живут только
        в этом браузере. С заданным адресом набор и журнал хранятся на сервере
        и видны с любого компьютера, а браузер остаётся кэшем на случай пропажи связи.
      </p>

      <div className="fldrow">
        <label className="fld fld--md">
          <span className="fld-lbl">адрес сервиса</span>
          <input
            className="fld-inp"
            value={base}
            placeholder="https://…"
            onChange={(e) => setBase(e.target.value)}
          />
          <span className="fld-hint">Полный адрес вместе с путём. Хранится в этом браузере.</span>
        </label>
        <label className="fld fld--sm">
          <span className="fld-lbl">пользователь</span>
          <input className="fld-inp" value={user} onChange={(e) => setUser(e.target.value)} />
        </label>
        <label className="fld fld--sm">
          <span className="fld-lbl">пароль</span>
          <input
            className="fld-inp"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
      </div>

      <div className="xfer-acts">
        <button
          type="button"
          className="btn btn--go"
          onClick={() => sync.setConfig({ base: base.trim(), user: user.trim(), pass })}
        >
          Подключиться
        </button>
        <button type="button" className="btn" onClick={sync.refresh}>
          Проверить связь
        </button>
        {on && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setBase('')
              sync.setConfig({ base: '', user: '', pass: '' })
            }}
          >
            Отключиться
          </button>
        )}
      </div>

      <p className={sync.state.status === 'offline' || sync.state.status === 'auth' ? 'xfer-warn' : 'note'}>
        {sync.state.status === 'offline' || sync.state.status === 'auth' ? '⚠ ' : ''}
        {sync.state.message}
        {sync.state.lastSavedAt && ` Последнее сохранение: ${dateTime(sync.state.lastSavedAt)}.`}
      </p>

      <p className="fld-hint">
        Пароль хранится в этом браузере: подставить basic auth в межсайтовый запрос
        сам браузер не умеет. Не вводите его на чужой машине.
      </p>
    </Panel>
  )
}
