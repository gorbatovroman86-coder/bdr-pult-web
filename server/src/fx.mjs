/**
 * Курсы валют: тянет СЕРВЕР, приложение забирает готовое.
 *
 * Ровно два адреса и никаких других. К gov.ru и МСХ не обращаемся:
 * сервер за пределами РФ, гео-фильтр не пускает — ставки пошлин
 * остаются ручными, и это штатный режим, а не недоделка.
 *
 * Выбор источника ведётся ПО ДАННЫМ, а не по расписанию: если биржа
 * отдала сделку за сегодня — берём биржу, иначе ЦБ. Так праздники
 * и внеплановые остановки торгов не требуют календаря в коде.
 */

const MOEX_SECID = { CNY: 'CNYRUB_TOM', USD: 'USD000UTSTOM' }
const MOEX_BOARD = 'CETS'

/** Единственные разрешённые внешние адреса. */
const MOEX_HOST = 'iss.moex.com'
const CBR_HOST = 'www.cbr.ru'

const TIMEOUT_MS = 10000

async function get(url, { asLatin1 = false } = {}) {
  const u = new URL(url)
  if (u.hostname !== MOEX_HOST && u.hostname !== CBR_HOST) {
    throw new Error(`адрес ${u.hostname} не разрешён`)
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'bdr-pult/1.0' },
  })
  if (!res.ok) throw new Error(`${u.hostname}: HTTP ${res.status}`)
  if (!asLatin1) return res.json()
  // ЦБ отдаёт windows-1251, но CharCode, Nominal и Value — ASCII,
  // поэтому latin1 разбирается надёжнее, чем возня с перекодировкой.
  return Buffer.from(await res.arrayBuffer()).toString('latin1')
}

function pickRow(block, board) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) return null
  const bi = block.columns.indexOf('BOARDID')
  const row = block.data.find((r) => r[bi] === board)
  if (!row) return null
  const out = {}
  block.columns.forEach((c, i) => { out[c] = row[i] })
  return out
}

/** Биржа. `null` — сделок за сегодня нет, значит время не торговое. */
async function fromMoex(code) {
  const secid = MOEX_SECID[code]
  const url =
    `https://${MOEX_HOST}/iss/engines/currency/markets/selt/securities/${secid}.json` +
    '?iss.meta=off&iss.only=marketdata'
  const j = await get(url)
  const md = pickRow(j.marketdata, MOEX_BOARD)
  if (!md) return null
  const value = md.LAST
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (md.TRADINGSTATUS !== 'T') return null
  // SYSTIME вида '2026-08-03 18:40:52' — дата сделки берётся из неё.
  const rateDate = typeof md.SYSTIME === 'string' ? md.SYSTIME.slice(0, 10) : null
  if (!rateDate) return null
  return { value, rateDate, source: 'moex' }
}

/** Официальный курс ЦБ РФ. Применяется в выходные и когда биржа молчит. */
async function fromCbr(code) {
  const xml = await get(`https://${CBR_HOST}/scripts/XML_daily.asp`, { asLatin1: true })
  const dm = xml.match(/<ValCurs[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/)
  const rateDate = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null

  const block = xml.match(new RegExp(`<Valute[^>]*>(?:(?!</Valute>)[\\s\\S])*?<CharCode>${code}</CharCode>[\\s\\S]*?</Valute>`))
  if (!block || !rateDate) return null
  const nominal = Number((block[0].match(/<Nominal>(\d+)<\/Nominal>/) ?? [])[1])
  const raw = (block[0].match(/<Value>([\d,.]+)<\/Value>/) ?? [])[1]
  if (!raw || !Number.isFinite(nominal) || nominal <= 0) return null
  const value = Number(raw.replace(',', '.')) / nominal
  if (!Number.isFinite(value) || value <= 0) return null
  return { value, rateDate, source: 'cbr' }
}

/**
 * Один курс. Ошибка источника не роняет обновление: возвращается `null`,
 * а вызывающий оставляет последнее сохранённое значение.
 */
export async function fetchRate(code) {
  try {
    const m = await fromMoex(code)
    if (m) return m
  } catch {
    // биржа недоступна — идём к ЦБ, это штатный путь, а не сбой
  }
  try {
    return await fromCbr(code)
  } catch {
    return null
  }
}

/** Насколько курс свежий: пока не истёк, источник не трогаем. */
export const CACHE_MS = 10 * 60 * 1000

export function isFresh(entry, now) {
  if (!entry) return false
  const t = Date.parse(entry.fetchedAt)
  return Number.isFinite(t) && now - t < CACHE_MS
}
