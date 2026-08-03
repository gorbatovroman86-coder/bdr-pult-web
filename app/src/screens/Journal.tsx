/**
 * ЖУРНАЛ РАСЧЁТОВ.
 *
 * Главное здесь — не список, а сравнение двух записей: что поменяли
 * во входных данных и как это сдвинуло результат каждой модели.
 * Всё остальное обслуживает эту функцию.
 */

import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import {
  compareEntries, journalFilename, journalToCsv, makeJournalBundle, mergeJournal,
  parseJournalBundle, type JournalEntry,
} from '../state/journal'
import { kRub, dateTime, pct, rubPerTon, signed } from '../domain/units'
import { Panel, Tag } from '../components/bits'
import { JournalDynamics } from '../charts/JournalDynamics'

function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Journal() {
  const { journal, applyInputs, fingerprint } = useStore()
  const [comment, setComment] = useState('')
  const [open, setOpen] = useState<JournalEntry | null>(null)
  const [pickA, setPickA] = useState<string | null>(null)
  const [pickB, setPickB] = useState<string | null>(null)
  const [pair, setPair] = useState<{ a: JournalEntry; b: JournalEntry } | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<JournalEntry | null>(null)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = journal.rows

  const compare = async () => {
    if (!pickA || !pickB || pickA === pickB) return
    const [a, b] = await Promise.all([journal.load(pickA), journal.load(pickB)])
    if (!a || !b) return
    // Старшая запись слева: «было → стало» читается только в одну сторону.
    const [older, newer] = a.at <= b.at ? [a, b] : [b, a]
    setPair({ a: older, b: newer })
    setOpen(null)
  }

  const exportJson = async () => {
    const all = await Promise.all(rows.map((r) => journal.load(r.id)))
    const entries = all.filter(Boolean) as JournalEntry[]
    const now = new Date().toISOString()
    download(journalFilename(now, 'json'), JSON.stringify(makeJournalBundle(entries, now), null, 2), 'application/json')
    setNote(`Выгружено записей: ${entries.length}.`)
  }

  const exportCsv = async () => {
    const all = await Promise.all(rows.map((r) => journal.load(r.id)))
    const entries = all.filter(Boolean) as JournalEntry[]
    const now = new Date().toISOString()
    download(journalFilename(now, 'csv'), journalToCsv(entries), 'text/csv;charset=utf-8')
    setNote(`Выгружено записей: ${entries.length}, по одной строке на режим.`)
  }

  const importFile = async (file: File) => {
    const res = parseJournalBundle(await file.text())
    if (!res.ok) {
      setNote(res.errors.join(' '))
      return
    }
    const have = (await Promise.all(rows.map((r) => journal.load(r.id)))).filter(Boolean) as JournalEntry[]
    const { merged, added, skipped } = mergeJournal(have, res.entries)
    if (added === 0) {
      setNote(`Новых записей в файле нет: все ${skipped} уже в журнале.`)
      return
    }
    const fresh = merged.filter((e) => !have.some((h) => h.fingerprint === e.fingerprint))
    await journal.importEntries(fresh)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <Panel
        title="Сохранить текущий расчёт"
        aside={<Tag tone="quiet">отпечаток {fingerprint}</Tag>}
      >
        <div className="fldrow">
          <label className="fld fld--md">
            <span className="fld-lbl">комментарий</span>
            <input
              className="fld-inp"
              value={comment}
              placeholder="зачем этот расчёт"
              onChange={(e) => setComment(e.target.value)}
            />
            <span className="fld-hint">
              Через месяц он объяснит, почему цифры были такими.
            </span>
          </label>
          <div className="xfer-acts">
            <button
              type="button"
              className="btn btn--go"
              disabled={journal.busy || !journal.available}
              onClick={() => {
                void journal.save(comment)
                setComment('')
              }}
            >
              Сохранить расчёт
            </button>
          </div>
        </div>
        <p className="note">
          Раз в сутки запись создаётся сама, если параметры менялись — с пометкой «авто».
          Тот же набор параметров второй записи не создаёт.
        </p>
        {journal.message && <p className="okbox">{journal.message}</p>}
        {note && <p className="note">{note}</p>}
      </Panel>

      {rows.length > 1 && (
        <Panel title="Динамика фин. результата">
          <JournalDynamics rows={rows} />
          <p className="fld-hint">
            По одной линии на режим. Точки — сохранённые расчёты; между ними
            пульт ничего не додумывает.
          </p>
        </Panel>
      )}

      <Panel
        title="Записи"
        aside={
          <div className="xfer-acts">
            <button type="button" className="btn btn--ghost" onClick={() => void exportJson()} disabled={rows.length === 0}>
              Выгрузить JSON
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void exportCsv()} disabled={rows.length === 0}>
              Выгрузить CSV
            </button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="note">Записей нет.</p>
        ) : (
          <div className="xscroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>дата</th>
                  <th>комментарий</th>
                  <th>лидер</th>
                  <th className="ta-r">результат</th>
                  <th>отпечаток</th>
                  <th>вид</th>
                  <th className="ta-r">сравнить</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{dateTime(r.at)}</td>
                    <td>{r.comment || <span className="td-note">без комментария</span>}</td>
                    <td className="num">{r.leader?.id ?? '—'}</td>
                    <td className="num ta-r b">{r.leader ? kRub(r.leader.net) : '—'}</td>
                    <td className="num">{r.fingerprint}</td>
                    <td className="td-note">{r.auto ? 'авто' : 'вручную'}</td>
                    <td className="ta-r jrn-picks">
                      <label className="jrn-pick">
                        <input type="radio" name="pickA" checked={pickA === r.id} onChange={() => setPickA(r.id)} />
                        <span>А</span>
                      </label>
                      <label className="jrn-pick">
                        <input type="radio" name="pickB" checked={pickB === r.id} onChange={() => setPickB(r.id)} />
                        <span>Б</span>
                      </label>
                    </td>
                    <td className="ta-r">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => void journal.load(r.id).then((e) => { setOpen(e); setPair(null) })}
                      >
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="xfer-acts">
          <button
            type="button"
            className="btn"
            disabled={!pickA || !pickB || pickA === pickB}
            onClick={() => void compare()}
          >
            Сравнить А и Б
          </button>
          <input
            ref={fileRef}
            className="xfer-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
            }}
          />
        </div>
      </Panel>

      {pair && <Comparison a={pair.a} b={pair.b} onClose={() => setPair(null)} />}

      {open && (
        <Panel
          title={`Расчёт от ${dateTime(open.at)}`}
          aside={<Tag tone="quiet">{open.fingerprint}</Tag>}
        >
          {open.comment && <p className="note">{open.comment}</p>}
          <div className="xscroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>режим</th>
                  <th className="ta-r">выручка</th>
                  <th className="ta-r">себест.</th>
                  <th className="ta-r">отгрузка</th>
                  <th className="ta-r">% денег</th>
                  <th className="ta-r">налог</th>
                  <th className="ta-r">фин. рез.</th>
                  <th className="ta-r">₽/т сырья</th>
                  <th className="ta-r">рентаб.</th>
                </tr>
              </thead>
              <tbody>
                {open.results.map((r) =>
                  r.blockedBy ? (
                    <tr key={r.id} className="tr-muted">
                      <td><b className="num">{r.id}</b></td>
                      <td colSpan={8}>⛔ остановлен: {r.blockedBy}</td>
                    </tr>
                  ) : (
                    <tr key={r.id}>
                      <td><b className="num">{r.id}</b> {r.name}</td>
                      <td className="num ta-r">{kRub(r.revenue)}</td>
                      <td className="num ta-r">{kRub(r.cost)}</td>
                      <td className="num ta-r">{kRub(r.shipping)}</td>
                      <td className="num ta-r">{kRub(r.interest)}</td>
                      <td className="num ta-r">{kRub(r.tax)}</td>
                      <td className="num ta-r b">{kRub(r.net)}</td>
                      <td className="num ta-r">{rubPerTon(r.perTon)}</td>
                      <td className="num ta-r">{pct(r.margin)} %</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <p className="note">
            Базис M1: <b>{open.basis ? `${open.basis.destination}, курс ${open.basis.fx}` : '—'}</b>.
            {open.blocked.length > 0 && <> Остановлены: {open.blocked.join('; ')}.</>}
            {' '}Сборка пульта <span className="num">{open.appVersion}</span>.
          </p>

          <div className="xfer-acts">
            <button type="button" className="btn" onClick={() => setConfirmRestore(open)}>
              Восстановить эти параметры
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmDel(open.id)}>
              Удалить запись
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(null)}>
              Закрыть
            </button>
          </div>

          {confirmRestore && (
            <div className="blockbox">
              <p className="blockbox-hd">
                Заменить действующие параметры набором от {dateTime(confirmRestore.at)}?
              </p>
              <p>Текущий набор ({fingerprint}) будет заменён на {confirmRestore.fingerprint}.</p>
              <div className="xfer-acts">
                <button
                  type="button"
                  className="btn btn--go"
                  onClick={() => {
                    applyInputs(confirmRestore.inputs)
                    setNote(`Параметры восстановлены из записи от ${dateTime(confirmRestore.at)}.`)
                    setConfirmRestore(null)
                    setOpen(null)
                  }}
                >
                  Да, восстановить
                </button>
                <button type="button" className="btn" onClick={() => setConfirmRestore(null)}>
                  Отменить
                </button>
              </div>
            </div>
          )}

          {confirmDel && (
            <div className="blockbox">
              <p className="blockbox-hd">Удалить запись безвозвратно?</p>
              <div className="xfer-acts">
                <button
                  type="button"
                  className="btn btn--go"
                  onClick={() => {
                    void journal.remove(confirmDel)
                    setConfirmDel(null)
                    setOpen(null)
                  }}
                >
                  Да, удалить
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDel(null)}>
                  Отменить
                </button>
              </div>
            </div>
          )}
        </Panel>
      )}
    </>
  )
}

/** Сравнение двух записей — то, ради чего журнал и ведётся. */
function Comparison({ a, b, onClose }: { a: JournalEntry; b: JournalEntry; onClose: () => void }) {
  const cmp = useMemo(() => compareEntries(a, b), [a, b])

  const shown = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return 'не задано'
    if (typeof v === 'number') return String(v)
    return String(v)
  }

  return (
    <Panel
      title={`Что изменилось: ${dateTime(a.at)} → ${dateTime(b.at)}`}
      aside={<Tag tone="decide">{a.fingerprint} → {b.fingerprint}</Tag>}
    >
      <h3 className="ref-h">Как сдвинулся фин. результат</h3>
      <div className="xscroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>режим</th>
              <th className="ta-r">было</th>
              <th className="ta-r">стало</th>
              <th className="ta-r">сдвиг</th>
            </tr>
          </thead>
          <tbody>
            {cmp.shifts.map((s) => (
              <tr key={s.id}>
                <td><b className="num">{s.id}</b> {s.name}</td>
                <td className="num ta-r xfer-from">{kRub(s.from)}</td>
                <td className="num ta-r">{kRub(s.to)}</td>
                <td className={`num ta-r b ${s.delta >= 0 ? 'jrn-up' : 'jrn-down'}`}>
                  {signed(s.delta, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="ref-h">
        Что поменяли во входных данных — {cmp.inputDiffs.length}
      </h3>
      {cmp.inputDiffs.length === 0 ? (
        <p className="note">Входные данные не отличаются.</p>
      ) : (
        <div className="xscroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>параметр</th>
                <th className="ta-r">было</th>
                <th className="ta-r">стало</th>
              </tr>
            </thead>
            <tbody>
              {cmp.inputDiffs.map((d) => (
                <tr key={d.path}>
                  <td>{d.label}</td>
                  <td className="num ta-r xfer-from">{shown(d.from)}</td>
                  <td className="num ta-r b">{shown(d.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="xfer-acts">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Закрыть сравнение
        </button>
      </div>
    </Panel>
  )
}
