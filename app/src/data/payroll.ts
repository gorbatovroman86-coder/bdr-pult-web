/**
 * Управленческий ФОТ — ПАРАМЕТР, а не константа.
 *
 * Значений в репозитории нет намеренно: репозиторий публичный, а ФОТ
 * это внутренние данные. Вводится в браузере и хранится только в нём
 * (localStorage), на сервер и в git не попадает.
 *
 * На расчёт не влияет: в фин. результат ФОТ не входит, налог 25 % считается
 * до него — так в книге БДР (Q6). Блок чисто справочный.
 */

const KEY = 'bdr-pult:payroll:v1'

export interface Payroll {
  /** Набор «проект», ₽/мес. */
  project: number | null
  /** Набор «итого» — с окладами и задачами НПК, ₽/мес. */
  total: number | null
  /** Когда введено, для подписи «✋ вручную». */
  enteredAt: string | null
}

export const EMPTY_PAYROLL: Payroll = { project: null, total: null, enteredAt: null }

export function loadPayroll(): Payroll {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_PAYROLL
    const p = JSON.parse(raw) as Partial<Payroll>
    return {
      project: typeof p.project === 'number' ? p.project : null,
      total: typeof p.total === 'number' ? p.total : null,
      enteredAt: typeof p.enteredAt === 'string' ? p.enteredAt : null,
    }
  } catch {
    return EMPTY_PAYROLL
  }
}

export function savePayroll(p: Payroll): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Приватный режим браузера или выключенное хранилище — молча живём без сохранения.
  }
}

export const isPayrollSet = (p: Payroll) => p.project !== null || p.total !== null
