/**
 * Сетевой слой. Всё, что можно проверить без сокета, вынесено в routes.mjs.
 *
 * Привязка по умолчанию — адрес docker-моста, а НЕ 0.0.0.0: брандмауэра
 * на машине нет, и привязка ко всем интерфейсам открыла бы API в интернет
 * мимо basic auth на caddy. Снаружи сервис доступен только через caddy.
 *
 * ЛОГИ: время, метод, путь, код ответа, длительность. Ни параметров,
 * ни цен, ни ставок, ни тел запросов — цифры в логи не попадают никогда.
 * Отдельной строкой отмечаются отказы: превышение частоты и обращение
 * без авторизации, с адресом обращавшегося и без его заголовков.
 */

import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { openDb } from './db.mjs'
import { handle } from './routes.mjs'
import { scanMessages } from './duties.mjs'
import {
  REJECT_DELAY_MS, clientKey, createRateLimiter, hasAuth, needsAuthHeader,
} from './guard.mjs'

const PORT = Number(process.env.BDR_PORT ?? 18791)
const HOST = process.env.BDR_HOST ?? '172.18.0.1'
const DB_FILE = process.env.BDR_DB ?? '/root/bdr-pult-api/data/bdr.sqlite'
const ORIGIN = process.env.BDR_ORIGIN ?? 'https://gorbatovroman86-coder.github.io'

/**
 * Отказывать запросам без заголовка авторизации. Выключать можно только
 * для локальной отладки без caddy: с выключенным сервис открыт всем,
 * кто дотянулся до порта.
 */
const REQUIRE_AUTH = process.env.BDR_REQUIRE_AUTH !== '0'

const limiter = createRateLimiter()

/** Тела больше этого не читаем: набор параметров с журнальной записью много меньше. */
const MAX_BODY = 512 * 1024

const db = openDb(DB_FILE)

/**
 * Ставки пошлин читаются из УЖЕ НАКОПЛЕННЫХ сообщений agro-intel —
 * СВОИМ соединением и СТРОГО на чтение. Слушатель не трогаем,
 * к Telegram не обращаемся, чужую базу не изменяем.
 * Нет базы — молча работаем без автоматических ставок.
 */
const AGRO_DB = process.env.BDR_AGRO_DB ?? ''
const DUTY_WINDOW_DAYS = 75

function scanDuties() {
  if (!AGRO_DB) return []
  const src = new DatabaseSync(AGRO_DB, { readOnly: true })
  try {
    const since = new Date(Date.now() - DUTY_WINDOW_DAYS * 86400000).toISOString()
    return scanMessages(src, since)
  } finally {
    src.close()
  }
}

const ctx = { db, now: () => new Date().toISOString(), scanDuties }

function corsHeaders() {
  return {
    // Только домен сайта. «*» здесь недопустима: за basic auth лежат рабочие цифры.
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let over = false
    const chunks = []
    req.on('data', (c) => {
      if (over) return
      size += c.length
      if (size > MAX_BODY) {
        // Сокет не рвём: клиент должен получить внятный 413, а не «соединение
        // сброшено». Остаток тела просто выбрасываем, не накапливая.
        over = true
        chunks.length = 0
        reject(new Error('too-large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!over) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

/**
 * Отказ фиксируется в журнале с адресом и причиной — но без заголовка
 * авторизации и без тела: в лог не должны попасть ни пароль, ни цифры.
 */
function noteRefusal(kind, key, method, path) {
  process.stderr.write(
    `${new Date().toISOString()} ОТКАЗ ${kind} адрес=${key} ${method} ${path}\n`,
  )
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const server = createServer(async (req, res) => {
  const started = Date.now()
  const path = new URL(req.url, 'http://x').pathname
  const key = clientKey(req.headers, req.socket?.remoteAddress)
  let status = 500

  const send = (code, payload) => {
    status = code
    const text = JSON.stringify(payload)
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
    })
    res.end(text)
  }

  try {
    // Ограничение частоты — раньше всего прочего: отказ должен быть дешёвым.
    const rate = limiter.check(key, Date.now())
    if (!rate.allowed) {
      noteRefusal('частота', key, req.method, path)
      await sleep(REJECT_DELAY_MS)
      send(429, { error: 'слишком много запросов, попробуйте позже' })
      return
    }

    if (req.method === 'OPTIONS') {
      status = 204
      res.writeHead(204, corsHeaders())
      res.end()
      return
    }

    // Закрыто по умолчанию: запрос без авторизации означает, что caddy его
    // не проверял — то есть сервис открыт наружу по ошибке в конфиге.
    if (REQUIRE_AUTH && needsAuthHeader(req.method, path) && !hasAuth(req.headers)) {
      noteRefusal('без авторизации', key, req.method, path)
      await sleep(REJECT_DELAY_MS)
      send(401, { error: 'требуется авторизация' })
      return
    }

    let body
    if (req.method === 'PUT' || req.method === 'POST') {
      let text
      try {
        text = await readBody(req)
      } catch {
        send(413, { error: 'тело запроса слишком большое' })
        return
      }
      try {
        body = text ? JSON.parse(text) : undefined
      } catch {
        send(400, { error: 'тело запроса не разобрано как JSON' })
        return
      }
    }

    const out = await handle(ctx, { method: req.method, path, body })
    send(out.status, out.body)
  } catch (e) {
    // Наружу — только факт ошибки: внутренности сервиса никого не касаются.
    send(500, { error: 'внутренняя ошибка сервиса' })
    process.stderr.write(`${new Date().toISOString()} ОШИБКА ${req.method} ${path}: ${e?.name ?? 'Error'}\n`)
  } finally {
    process.stdout.write(
      `${new Date().toISOString()} ${req.method} ${path} -> ${status} за ${Date.now() - started}мс\n`,
    )
  }
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`${new Date().toISOString()} пульт БДР: хранилище слушает ${HOST}:${PORT}\n`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      db.close()
      process.exit(0)
    })
  })
}
