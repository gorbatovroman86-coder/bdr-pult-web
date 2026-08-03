/**
 * Управленческий ФОТ. Значений в репозитории нет — репозиторий публичный.
 * Вводится в браузере, хранится только там, на расчёт не влияет.
 * Сбрасывается ОТДЕЛЬНО от общего сброса параметров.
 */

import { rub } from '../domain/units'
import { isPayrollSet } from '../data/payroll'
import { useStore } from '../state/store'

export function PayrollBlock({ readOnly = false }: { readOnly?: boolean }) {
  const { payroll: p, setPayroll, resetPayroll } = useStore()
  const set = (f: 'project' | 'total') => (raw: string) => {
    const c = raw.replace(/[^\d]/g, '')
    setPayroll(f, c === '' ? null : Number(c))
  }

  if (readOnly) {
    return (
      <div className="ref-two">
        <div className="stat">
          <div className="stat-label">ФОТ «проект»</div>
          <div className="stat-value num">{p.project === null ? '—' : rub(p.project)}</div>
          <div className="stat-hint">{p.project === null ? 'не задан' : '₽/мес · ✋ вручную'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ФОТ «итого»</div>
          <div className="stat-value num">{p.total === null ? '—' : rub(p.total)}</div>
          <div className="stat-hint">{p.total === null ? 'не задан' : '₽/мес · ✋ вручную'}</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="fldrow">
        <label className="fld fld--md">
          <span className="fld-lbl">ФОТ «проект»</span>
          <input className="fld-inp num" inputMode="numeric" value={p.project ?? ''}
            placeholder="не задано" onChange={(e) => set('project')(e.target.value)} />
          <span className="fld-meta"><span className="fld-unit">₽/мес</span>
            <span className="fld-src">✋ вручную, только в этом браузере</span></span>
        </label>
        <label className="fld fld--md">
          <span className="fld-lbl">ФОТ «итого»</span>
          <input className="fld-inp num" inputMode="numeric" value={p.total ?? ''}
            placeholder="не задано" onChange={(e) => set('total')(e.target.value)} />
          <span className="fld-meta"><span className="fld-unit">₽/мес</span>
            <span className="fld-src">с окладами и задачами НПК</span></span>
        </label>
        {isPayrollSet(p) && (
          <button type="button" className="btn btn--ghost" onClick={resetPayroll}>
            Очистить ФОТ
          </button>
        )}
      </div>
      <p className="fld-hint">
        Внутренние данные: в репозитории их нет, наружу не уходят. На расчёт не влияют —
        в фин. результат ФОТ не входит, налог считается до него, как в книге.
        Общий сброс параметров ФОТ не трогает.
      </p>
    </>
  )
}
