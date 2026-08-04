/**
 * Защита сервиса. Отделена от сети, чтобы проверяться тестами.
 *
 * ЧЕСТНО О ТОМ, ЧТО ЭТО ЗАКРЫВАЕТ, А ЧТО НЕТ.
 *
 * Пароль проверяет caddy, и перебор пароля до сервиса НЕ ДОХОДИТ — caddy
 * отвечает 401 сам. Настоящая защита от перебора там: `basic_auth` хранит
 * пароль хешем bcrypt, а проверка bcrypt намеренно медленная, и перебор
 * упирается в неё, а не в наши счётчики.
 *
 * Здесь закрываются две другие дыры, до которых caddy не дотягивается:
 *
 *   1. ПОТОК запросов от того, кто пароль уже знает или подобрал, —
 *      ограничение частоты по адресу;
 *   2. МОЛЧАЛИВОЕ ОТКРЫТИЕ сервиса при ошибке в конфиге caddy. Если запрос
 *      дошёл без заголовка авторизации, значит caddy его не проверял.
 *      Сервис в этом случае отказывает сам — «закрыто по умолчанию»,
 *      а не «открыто, раз никто не возразил».
 */

/** Запросов с одного адреса в минуту. Пульту хватает единиц. */
export const RATE_LIMIT = 120
export const RATE_WINDOW_MS = 60_000

/** Пауза перед отказом: делает перебор и прощупывание дорогими. */
export const REJECT_DELAY_MS = 1000

/**
 * Счётчик обращений по адресу, скользящее окно.
 * Память ограничена: заброшенные адреса вычищаются на каждом обращении.
 */
export function createRateLimiter({ limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS } = {}) {
  const seen = new Map()

  return {
    /** @returns {{allowed: boolean, count: number}} */
    check(key, now) {
      for (const [k, times] of seen) {
        const alive = times.filter((t) => now - t < windowMs)
        if (alive.length === 0) seen.delete(k)
        else seen.set(k, alive)
      }

      const times = (seen.get(key) ?? []).filter((t) => now - t < windowMs)
      times.push(now)
      seen.set(key, times)
      return { allowed: times.length <= limit, count: times.length }
    },
    size: () => seen.size,
  }
}

/**
 * Адрес обращающегося. За caddy настоящий адрес приходит заголовком;
 * берём первый в цепочке, остальное дописано по дороге и доверия не имеет.
 */
export function clientKey(headers, socketAddress) {
  const fwd = headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim() !== '') return fwd.split(',')[0].trim()
  return socketAddress ?? 'неизвестен'
}

/**
 * Проверка, что запрос пришёл через caddy с проверенной авторизацией.
 *
 * Предварительный запрос браузера (OPTIONS) заголовка авторизации не несёт
 * по устройству протокола и проверке не подлежит. Проверка здоровья тоже
 * открыта: она не отдаёт данных и нужна для наблюдения за сервисом.
 */
export function needsAuthHeader(method, path) {
  if (method === 'OPTIONS') return false
  if (path === '/health') return false
  return true
}

export function hasAuth(headers) {
  const a = headers.authorization
  return typeof a === 'string' && a.trim() !== ''
}
