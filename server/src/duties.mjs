/**
 * СТАВКИ ПОШЛИН МСХ ИЗ ВТОРИЧНЫХ ИСТОЧНИКОВ.
 *
 * Официальный источник недоступен: машина за пределами РФ, gov.ru не пускает.
 * Обходить гео-фильтр нельзя и не нужно — ставку публикуют десятки отраслевых
 * каналов, и её можно собрать оттуда, сверив источники между собой.
 *
 * ОТКУДА БЕРЁМ. Из УЖЕ НАКОПЛЕННЫХ сообщений agro-intel, только на чтение.
 * Ни одного дополнительного запроса к Telegram: слушатель не трогаем,
 * своих подключений не заводим.
 *
 * ПОЧЕМУ БЕЗ LLM. Разбор детерминированный, на выражениях. Формулировки
 * оказались единообразными, и регулярный разбор берёт весь наблюдаемый
 * корпус; LLM добавила бы ключ, стоимость и невоспроизводимость там, где
 * и так всё однозначно. Порог перехода на LLM записан в отчёте.
 *
 * ЧИСТЫЙ модуль: ни базы, ни сети — всё проверяется тестами.
 */

// ─────────────────────────────────────────────── Префильтр

/**
 * Дешёвый отсев по словам. Нужен не только ради скорости: поиск по одному
 * числу даёт мусор — в корпусе «7748» встретилось в рекламе топлива,
 * и без слов «пошлина» и «подсолнечное» это ушло бы в ставки.
 */
export function looksLikeDuty(text) {
  if (typeof text !== 'string' || text.length < 40) return false
  const t = text.toLowerCase()
  if (!t.includes('пошлин')) return false
  if (!/подсолнеч|шрот|жмых/.test(t)) return false
  return /руб|₽/.test(t)
}

// ─────────────────────────────────────────────── Разбор

const MONTHS = {
  январ: 1, феврал: 2, март: 3, апрел: 4, мая: 5, май: 5, июн: 6,
  июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12,
}

/** Продукт, к которому относится ставка. */
const OIL = 'oil'
const MEAL = 'meal'

/**
 * Число в рублях в любой из встречавшихся форм:
 *   7748 руб./т · 7 748 рублей за тонну · 312,4 руб. за тонну
 *   7 тыс. 748 рублей за тонну
 */
const NUM = String.raw`(\d{1,3}(?:[   ]?\d{3})*(?:[.,]\d+)?)`
// ВНИМАНИЕ: `\w` и `\b` в JavaScript кириллицу не покрывают. «подсолнечн\w*»
// не совпадёт с «подсолнечного», а «т\b» не сработает перед пробелом: русская
// буква для движка не «словесный» символ. Поэтому везде явные классы букв.
const RU = String.raw`[а-яёА-ЯЁ]`
const THOUSANDS = String.raw`(\d{1,3})\s*тыс\.?\s*(\d{1,3})?`
const RUB = String.raw`(?:руб|₽|рубл)`

function toNumber(raw) {
  const n = Number(String(raw).replace(/[   ]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Все упоминания «столько-то рублей за тонну» с позицией в тексте. */
function findRates(t) {
  const out = []

  // «7 тыс. 748 рублей» — разбирается первым, иначе NUM возьмёт только «7»
  const reThousands = new RegExp(`${THOUSANDS}\\s*${RUB}`, 'gi')
  for (const m of t.matchAll(reThousands)) {
    const v = Number(m[1]) * 1000 + Number(m[2] ?? 0)
    out.push({ value: v, at: m.index, len: m[0].length })
  }

  const rePlain = new RegExp(`${NUM}\\s*${RUB}[а-я.]*\\s*(?:/|за)?\\s*(?:т(?!${RU})|тонн)`, 'gi')
  for (const m of t.matchAll(rePlain)) {
    // Не перебиваем уже найденную форму «тыс.» на том же месте.
    if (out.some((o) => m.index >= o.at && m.index < o.at + o.len)) continue
    const v = toNumber(m[1])
    if (v !== null) out.push({ value: v, at: m.index, len: m[0].length })
  }

  return out.sort((a, b) => a.at - b.at)
}

/**
 * Продукт, названный в предложении. `null` — не назван, `'both'` — названы оба
 * (заголовки вида «пошлина на масло и шрот выросла»); в обоих случаях
 * предложение не годится в источник ставки.
 */
function productOf(sentence) {
  const oil = /подсолнечн[а-яё]*\s+масл|масл[а-яё]*\s+подсолнечн|на\s+масло(?![а-яё])/i.test(sentence)
  const meal = /шрот|жмых/i.test(sentence)
  if (oil && meal) return 'both'
  if (oil) return OIL
  if (meal) return MEAL
  return null
}

// Стем месяца, не начинающийся посреди слова: «мая» не должно ловиться в «маяк».
const MONTH_RE = new RegExp(`(?:^|[^а-яё])(${Object.keys(MONTHS).join('|')})[а-яё]*`, 'i')

/**
 * Месяц действия из предложения. Год выводится из даты сообщения: ставку
 * объявляют заранее, поэтому месяц, ушедший назад больше чем на один,
 * относится к следующему году.
 */
function monthOf(sentence, messageDate) {
  const m = sentence.match(MONTH_RE)
  if (!m) return null
  const key = Object.keys(MONTHS).find((k) => m[1].toLowerCase().startsWith(k))
  if (!key) return null
  const mm = MONTHS[key]
  const base = new Date(messageDate)
  const y = base.getUTCFullYear()
  const mNow = base.getUTCMonth() + 1
  const year = mm < mNow - 1 ? y + 1 : y
  return `${year}-${String(mm).padStart(2, '0')}`
}

/**
 * Разбивка на предложения. Точку в «руб.», «тыс.» и «т.» границей не считаем,
 * поэтому границей признаётся только точка перед пробелом и заглавной буквой.
 */
function sentences(text) {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[«"A-ZА-ЯЁ])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0)
}

/**
 * Ставка из предложения: ПЕРВОЕ значение в рублях, не являющееся сравнением
 * с прошлым месяцем. «7748 руб./т против 3294 руб./т в июле» — берём 7748.
 */
function rateOf(sentence) {
  const rates = findRates(sentence)
  for (const r of rates) {
    const before = sentence.slice(Math.max(0, r.at - 40), r.at).toLowerCase()
    // Сравнение с прошлым месяцем и скобочные пояснения — не наша ставка.
    if (/против|чем в|было|ранее|в прошлом|\(\s*$/.test(before)) continue
    if (r.value <= 0 || r.value > 100000) continue
    return r.value
  }
  return null
}

/**
 * Разбор одного сообщения.
 *
 * Работа идёт по предложениям: в одном сообщении обычно называют и масло,
 * и шрот, и прошлый месяц для сравнения — на уровне всего текста они
 * перемешиваются и дают неверные пары.
 *
 * @returns {{product:string, month:string, rate:number}[]}
 */
/** Месяц, следующий за датой сообщения: ставку объявляют на него. */
function nextMonthOf(messageDate) {
  const d = new Date(messageDate)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 2
  return m > 12 ? `${y + 1}-01` : `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Месяц действия — свойство ВСЕГО сообщения, а не отдельного предложения.
 *
 * В одном тексте месяцев называют несколько: объявляемый и прошлый для
 * сравнения («в августе … против июля», «в мае-июле была нулевой»).
 * Привязка по предложению на этом ломается — июль из сравнения приезжает
 * к августовской ставке.
 *
 * Правило: ставку объявляют на СЛЕДУЮЩИЙ месяц. Если он назван в тексте
 * про пошлины — берём его; иначе берём первый названный там месяц.
 */
function targetMonth(text, messageDate) {
  const mentioned = []
  for (const s of sentences(text)) {
    if (!/пошлин/i.test(s)) continue
    const m = monthOf(s, messageDate)
    if (m) mentioned.push(m)
  }
  if (mentioned.length === 0) return null
  const next = nextMonthOf(messageDate)
  return mentioned.includes(next) ? next : mentioned[0]
}

export function parseDuties(text, messageDate) {
  if (!looksLikeDuty(text)) return []

  const month = targetMonth(text, messageDate)
  if (!month) return []

  const found = new Map()
  for (const s of sentences(text)) {
    if (!/пошлин/i.test(s)) continue
    const product = productOf(s)
    if (product === null || product === 'both') continue

    const rate = rateOf(s)
    if (rate === null) continue

    if (!found.has(product)) found.set(product, { product, month, rate })
  }

  return [...found.values()]
}

// ─────────────────────────────────────────────── Сверка источников

/**
 * Сведение находок в решение.
 *
 * Вторичный источник может опечататься, поэтому одно значение из одного
 * канала не применяется без оговорки:
 *   - совпало у двух и более независимых источников → применяем;
 *   - разошлось → НЕ применяем, показываем оба и просим выбрать;
 *   - источник один → применяем, но помечаем.
 *
 * @param {{product:string, month:string, rate:number, source:string, at:string}[]} hits
 */
export function reconcile(hits) {
  const groups = new Map()
  for (const h of hits) {
    const key = `${h.month}|${h.product}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(h)
  }

  const out = []
  for (const [key, list] of groups) {
    const [month, product] = key.split('|')
    const byRate = new Map()
    for (const h of list) {
      const r = String(h.rate)
      if (!byRate.has(r)) byRate.set(r, new Set())
      byRate.get(r).add(h.source)
    }

    const variants = [...byRate.entries()]
      .map(([rate, sources]) => ({ rate: Number(rate), sources: [...sources].sort() }))
      .sort((a, b) => b.sources.length - a.sources.length)

    const top = variants[0]
    const confirmed = top.sources.length >= 2
    // Расхождение считаем настоящим, только если у спорного варианта тоже
    // есть поддержка: единичная опечатка на фоне пяти согласных источников
    // спором не является.
    const disputed = variants.length > 1 && variants[1].sources.length >= 2

    out.push({
      month,
      product,
      rate: top.rate,
      sources: top.sources,
      status: disputed ? 'disputed' : confirmed ? 'confirmed' : 'single',
      variants,
      firstSeenAt: list.map((h) => h.at).sort()[0],
    })
  }

  return out.sort((a, b) => (a.month === b.month ? a.product.localeCompare(b.product) : b.month.localeCompare(a.month)))
}

// ─────────────────────────────────────────────── Сторожа

/**
 * Изменение больше чем вдвое к прошлому месяцу.
 *
 * ВНИМАНИЕ: для пошлины это ПЛОХОЙ признак ошибки. Ставка плавающая
 * и по устройству меняется кратно — в августе 2026 она законно выросла
 * в 2,35 раза. Правило оставлено только потому, что накопленного ряда
 * ещё нет; см. `assessRate`.
 */
export function implausible(rate, previousRate) {
  if (previousRate === null || previousRate === undefined || previousRate <= 0) return false
  if (rate <= 0) return false
  const k = rate / previousRate
  return k >= 2 || k <= 0.5
}

/** С какой длины ряда переходим на сравнение с историей, а не с прошлым месяцем. */
export const HISTORY_ENOUGH = 6

/**
 * Значение вне накопленного диапазона — с запасом на естественный ход ставки.
 * Запас в половину размаха: ставка регулярно обновляет минимумы и максимумы,
 * и тревожить на каждом новом крае бессмысленно.
 */
export function outOfHistoricalRange(rate, history) {
  const past = history.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
  if (past.length < HISTORY_ENOUGH) return false
  const lo = Math.min(...past)
  const hi = Math.max(...past)
  const pad = Math.max((hi - lo) / 2, hi * 0.25)
  return rate < lo - pad || rate > hi + pad
}

/**
 * Оценка ставки: надо ли звать человека и что ему сказать.
 *
 * Пока ряд короткий — сравниваем с прошлым месяцем, но говорим по существу:
 * пошлина плавающая, кратные изменения нормальны, это повод СВЕРИТЬ,
 * а не подозревать опечатку.
 */
export function assessRate(rate, previousRate, history = []) {
  if (outOfHistoricalRange(rate, history)) {
    return {
      alarm: true,
      basis: 'history',
      message:
        `Значение выходит за пределы накопленного ряда (${Math.min(...history)}…${Math.max(...history)} ₽/т). ` +
        'Сверьте с источником, прежде чем применять.',
    }
  }

  if (history.length < HISTORY_ENOUGH && implausible(rate, previousRate)) {
    return {
      alarm: true,
      basis: 'double',
      message:
        `Изменение к прошлому месяцу более чем вдвое (было ${previousRate} ₽/т). ` +
        'Пошлина плавающая, кратные изменения для неё нормальны — это повод сверить с источником, ' +
        `а не признак ошибки. Ряда пока мало (${history.length} из ${HISTORY_ENOUGH} месяцев), ` +
        'поэтому сравниваем с прошлым месяцем.',
    }
  }

  return { alarm: false, basis: null, message: '' }
}

/** Предыдущий месяц в виде ГГГГ-ММ. */
export function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

// ─────────────────────────────────────────────── Чтение накопленных сообщений

/**
 * Просмотр УЖЕ СОБРАННЫХ сообщений agro-intel. Только чтение и только своей
 * копией соединения: слушатель не трогаем, к Telegram не обращаемся.
 *
 * @param {import('node:sqlite').DatabaseSync} db открытая база agro-intel
 * @param {string} sinceIso с какой даты смотреть
 */
export function scanMessages(db, sinceIso) {
  // Префильтр отдаём SQLite: LLM и разбор запускаются только по совпадениям.
  const rows = db.prepare(`
    SELECT r.text AS text, r.date_utc AS at,
           COALESCE(c.username, 'id' || r.chat_id) AS source
      FROM raw_messages r
      LEFT JOIN chats c ON c.chat_id = r.chat_id
     WHERE r.date_utc >= ?
       AND lower(r.text) LIKE '%пошлин%'
       AND (lower(r.text) LIKE '%подсолнеч%' OR lower(r.text) LIKE '%шрот%' OR lower(r.text) LIKE '%жмых%')
     ORDER BY r.date_utc
  `).all(sinceIso)

  const hits = []
  for (const row of rows) {
    for (const d of parseDuties(row.text, row.at)) {
      hits.push({ ...d, source: row.source, at: row.at })
    }
  }
  return hits
}
