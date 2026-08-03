/**
 * Передача набора параметров файлом.
 *
 * Импорт НИКОГДА не применяется молча: сначала показывается, чем файл
 * отличается от текущего набора, и только после подтверждения он заменяется
 * целиком. Частичного применения нет — либо весь набор, либо ничего.
 *
 * ФОТ в выгрузку не попадает без явной галочки: это зарплатные данные.
 */

import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import {
  APP_VERSION, bundleFilename, diffInputs, makeBundle, parseBundle, payrollDiffers,
  type Bundle, type Diff,
} from '../state/transfer'
import { isPayrollSet } from '../data/payroll'
import { dateTime, fmt, monthName } from '../domain/units'
import { Panel, Tag } from './bits'

/** Показ значения в сравнении: число — с разделителями, пусто — «не задано». */
function shown(v: Diff['from']): string {
  if (v === null || v === undefined || v === '') return 'не задано'
  if (typeof v === 'number') return fmt(v, Number.isInteger(v) ? 0 : 4)
  return v
}

interface Pending {
  bundle: Bundle
  diffs: Diff[]
  warnings: string[]
  fileName: string
}

export function Transfer() {
  const { inputs, applyInputs, payroll, setPayrollAll, fingerprint, touchedAt } = useStore()
  const [withPayroll, setWithPayroll] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const payrollAvailable = isPayrollSet(payroll)

  const exportNow = () => {
    const now = new Date().toISOString()
    const bundle = makeBundle(inputs, {
      now,
      payroll: withPayroll && payrollAvailable ? payroll : undefined,
    })
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = bundleFilename(now)
    a.click()
    URL.revokeObjectURL(url)
    setDone(`Выгружено: ${bundleFilename(now)}, отпечаток ${bundle.fingerprint}.`)
    setErrors([])
  }

  const pickFile = async (file: File) => {
    setDone(null)
    const res = parseBundle(await file.text())
    if (!res.ok) {
      setErrors(res.errors)
      setPending(null)
      return
    }
    setErrors([])
    setPending({
      bundle: res.bundle,
      diffs: diffInputs(inputs, res.bundle.inputs),
      warnings: res.warnings,
      fileName: file.name,
    })
  }

  const applyPending = () => {
    if (!pending) return
    applyInputs(pending.bundle.inputs)
    if (pending.bundle.payroll) setPayrollAll(pending.bundle.payroll)
    setDone(
      `Набор из «${pending.fileName}» применён. Отпечаток теперь ${pending.bundle.fingerprint}.`,
    )
    setPending(null)
  }

  const cancel = () => {
    setPending(null)
    setErrors([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const staleInFile =
    pending && pending.bundle.ratesMonth !== '' && pending.bundle.ratesMonth !== inputs.currentMonth

  return (
    <Panel
      title="Передача параметров"
      aside={<Tag tone="decide">файлом, а не хранилищем</Tag>}
    >
      <p className="note">
        Общего хранилища у пульта нет: параметры лежат в браузере каждого. Чтобы двое
        считали на одних цифрах, набор выгружается файлом и загружается у второго —
        с показом отличий до применения.
      </p>

      <div className="xfer">
        <div className="xfer-side">
          <h3 className="xfer-h">Выгрузить</h3>
          <p className="xfer-sub">
            Действующий набор · отпечаток <b className="num">{fingerprint}</b>
          </p>
          <label className="xfer-chk">
            <input
              type="checkbox"
              checked={withPayroll}
              disabled={!payrollAvailable}
              onChange={(e) => setWithPayroll(e.target.checked)}
            />
            <span>
              включить ФОТ
              <span className="xfer-chk-note">
                {payrollAvailable
                  ? ' — зарплатные данные, по умолчанию в файл не идут'
                  : ' — ФОТ не введён, включать нечего'}
              </span>
            </span>
          </label>
          <button type="button" className="btn btn--go" onClick={exportNow}>
            Выгрузить параметры
          </button>
        </div>

        <div className="xfer-side">
          <h3 className="xfer-h">Загрузить</h3>
          <p className="xfer-sub">
            Файл сначала сверяется с текущим набором. Ничего не применяется без подтверждения.
          </p>
          <input
            ref={fileRef}
            className="xfer-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickFile(f)
            }}
          />
        </div>
      </div>

      {done && <p className="okbox">✅ {done}</p>}

      {errors.length > 0 && (
        <div className="blockbox">
          <p className="blockbox-hd">⛔ Файл не принят</p>
          <ul className="xfer-errs">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={cancel}>
            Понятно
          </button>
        </div>
      )}

      {pending && (
        <div className="xfer-diff">
          <header className="xfer-diff-hd">
            <h3 className="xfer-h">
              Что изменится: <b className="num">{pending.diffs.length}</b>{' '}
              {pending.diffs.length === 1 ? 'отличие' : 'отличий'}
            </h3>
            <p className="xfer-sub">
              «{pending.fileName}» · выгружен {pending.bundle.exportedAt ? dateTime(pending.bundle.exportedAt) : '—'} ·
              сборка <span className="num">{pending.bundle.appVersion}</span> · отпечаток{' '}
              <b className="num">{pending.bundle.fingerprint}</b>
            </p>
          </header>

          {pending.warnings.map((w, i) => (
            <p key={i} className="xfer-warn">⚠ {w}</p>
          ))}

          {staleInFile && (
            <p className="xfer-warn">
              ⚠ Ставки МСХ в файле за {monthName(pending.bundle.ratesMonth)}, текущий месяц —{' '}
              {monthName(inputs.currentMonth)}. Загрузить можно, но блокировки сработают
              как обычно: М2 и М5 считаться не будут.
            </p>
          )}

          {pending.bundle.payroll && (
            <p className="xfer-warn">
              ⚠ В файле есть ФОТ — при подтверждении он заменит введённый в этом браузере.
            </p>
          )}

          {pending.diffs.length === 0 ? (
            <p className="okbox">
              ✅ Отличий нет: набор в файле совпадает с действующим. Применять нечего.
            </p>
          ) : (
            <div className="xscroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>параметр</th>
                    <th className="ta-r">сейчас</th>
                    <th className="ta-r">из файла</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.diffs.map((d) => (
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
            <button
              type="button"
              className="btn btn--go"
              disabled={pending.diffs.length === 0 && !payrollDiffers(payroll, pending.bundle.payroll)}
              onClick={applyPending}
            >
              Применить набор
            </button>
            <button type="button" className="btn" onClick={cancel}>
              Отменить
            </button>
          </div>
        </div>
      )}

      <p className="fld-hint">
        Отпечаток — 8 знаков от значений набора; отметки «когда и откуда взято» в него
        не входят, поэтому одни и те же цифры дают один отпечаток. Сборка пульта{' '}
        <span className="num">{APP_VERSION}</span>. Последняя правка набора:{' '}
        {touchedAt ? dateTime(touchedAt) : 'не было, набор базовый'}.
      </p>
    </Panel>
  )
}
