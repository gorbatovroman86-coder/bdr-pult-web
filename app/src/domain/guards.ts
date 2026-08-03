/**
 * Сторожа расчёта. Найдены сверкой ЭТАПА 5, сценарий 7 «граничные входы».
 *
 * Правило: приложение не должно ни падать, ни показывать правдоподобное число
 * там, где расчёт невозможен. Всё, что здесь перечислено, останавливает расчёт
 * и называет причину — вместо того чтобы молча посчитать бессмыслицу.
 */

import type { EngineParams, NetPrices } from './engine'
import { deriveYields } from './yields'
import type { ProductId } from './types'
import { PRODUCT_LABEL_FULL } from './types'

export interface EngineIssue {
  code:
    | 'yield-out-of-range'
    | 'yield-sum'
    | 'yield-derived-negative'
    | 'price-missing'
    | 'not-finite'
  message: string
}

const EPS = 1e-9

/** Лузга не продаётся по решению владельца — цена ей не нужна (Q3). */
const NOT_SOLD: ProductId[] = ['husk']

/** Продукты, которые модель реально продаёт: есть тонны и есть ставка отгрузки. */
function soldProducts(p: EngineParams): ProductId[] {
  const y = deriveYields(p.yields)
  const out: ProductId[] = []
  if (y.kernel > 0) out.push('kernel')
  if (y.semi > 0 && p.shipping.semi > 0) out.push('semi') // П/Ф продаётся только там, где задана его отгрузка
  if (y.cat3 > 0) out.push('cat3')
  if (y.oil > 0) out.push('oil')
  if (y.meal > 0) out.push('meal')
  return out.filter((id) => !NOT_SOLD.includes(id))
}

/**
 * Причины, по которым расчёт невозможен. Пустой список — считать можно.
 * Отрицательный нетбэк сюда НЕ входит: это арифметически верный результат
 * (логистика выше цены контракта), он помечается предупреждением, а не блокирует.
 */
export function engineBlockers(p: EngineParams, prices: NetPrices): EngineIssue[] {
  const out: EngineIssue[] = []
  const yi = p.yields

  // ── Выходы: каждый в [0, 1]
  const named: [string, number][] = [
    ['ядро', yi.kernel],
    ['3 категория', yi.cat3],
    ['лузга', yi.husk],
    ['масло', yi.oil],
    ['потери', yi.lossShare],
  ]
  for (const [label, v] of named) {
    if (!Number.isFinite(v) || v < -EPS || v > 1 + EPS) {
      out.push({
        code: 'yield-out-of-range',
        message: `Выход «${label}» вне диапазона 0…100 %: задано ${(v * 100).toFixed(1)} %`,
      })
    }
  }

  // ── Баланс первого передела обязан давать ровно 100 %
  if (yi.semiIsDerived) {
    const semi = 1 - yi.kernel - yi.cat3 - yi.husk
    if (semi < -EPS) {
      out.push({
        code: 'yield-derived-negative',
        message:
          `Сумма выходов ядра, 3 категории и лузги равна ${(((yi.kernel + yi.cat3 + yi.husk) * 100)).toFixed(1)} % — ` +
          `больше 100 %. Полуфабрикат выходит отрицательным (${(semi * 100).toFixed(1)} %), баланс массы невозможен`,
      })
    }
  } else {
    const sum = yi.oil + (1 - yi.lossShare - yi.oil)
    if (Math.abs(sum - (1 - yi.lossShare)) > 1e-6) {
      out.push({ code: 'yield-sum', message: 'Баланс выходов не сходится' })
    }
  }

  // ── Второй передел: жмых не может быть отрицательным
  if (yi.producesOilLine) {
    const meal = 1 - yi.lossShare - yi.oil
    if (meal < -EPS) {
      out.push({
        code: 'yield-derived-negative',
        message:
          `Выход масла ${(yi.oil * 100).toFixed(1)} % и потери ${(yi.lossShare * 100).toFixed(1)} % ` +
          `дают отрицательный выход жмыха (${(meal * 100).toFixed(1)} %)`,
      })
    }
  }

  // ── Цены: у каждого продаваемого продукта цена должна быть ЗАДАНА.
  //    Ноль — это заданный ноль, он допустим. Отсутствие — нет.
  for (const id of soldProducts(p)) {
    const v = prices[id]
    if (v === undefined || v === null) {
      out.push({
        code: 'price-missing',
        message: `Не задана цена на «${PRODUCT_LABEL_FULL[id]}», а продукт продаётся`,
      })
    } else if (!Number.isFinite(v)) {
      out.push({
        code: 'not-finite',
        message: `Цена на «${PRODUCT_LABEL_FULL[id]}» не число — вероятно, не получен курс валюты`,
      })
    }
  }

  // ── Числовые параметры
  const params: [string, number][] = [
    ['заход сырья', p.intakeTonsPerDay],
    ['количество суток', p.daysPerMonth],
    ['цена закупа', p.purchaseWithVat],
    ['стоимость переработки', p.processingWithVat],
    ['% пользования деньгами', p.moneyRate],
  ]
  for (const [label, v] of params) {
    if (!Number.isFinite(v)) {
      out.push({ code: 'not-finite', message: `Параметр «${label}» не число` })
    }
  }

  return out
}

/** Отрицательный нетбэк — считается, но обязан быть виден. */
export function negativePriceWarnings(prices: NetPrices): string[] {
  const out: string[] = []
  for (const [id, v] of Object.entries(prices)) {
    if (typeof v === 'number' && Number.isFinite(v) && v < 0) {
      out.push(
        `Нетто-цена на «${PRODUCT_LABEL_FULL[id as ProductId]}» отрицательная (${v.toFixed(2)} ₽/т): ` +
          `пошлина и логистика превышают цену контракта. Продажа в убыток`,
      )
    }
  }
  return out
}
