import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'

const BASE = 'http://localhost:3001/api'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'

const pad = (n) => String(n).padStart(2, '0')
const monthStart = (year, monthIndex) => `${year}-${pad(monthIndex + 1)}-01`
const nextMonthStart = (year, monthIndex) => {
  if (monthIndex === 11) return `${year + 1}-01-01`
  return `${year}-${pad(monthIndex + 2)}-01`
}
const weekStartSql = () => {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} 00:00:00`
}

const request = async (path, { cookie } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

const cookieHeader = (setCookie) => setCookie.map((c) => c.split(';')[0]).join('; ')

const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})
if (loginRes.status !== 200) {
  console.error('BLOCKED: login failed', loginRes.status, await loginRes.text())
  process.exit(2)
}
const cookie = cookieHeader(loginRes.headers.getSetCookie?.() ?? [])

const now = new Date()
const year = now.getFullYear()
const monthIndex = now.getMonth()
const currentStart = `${monthStart(year, monthIndex)} 00:00:00`
const currentEnd = `${nextMonthStart(year, monthIndex)} 00:00:00`
const weekStart = weekStartSql()

const dbLoginsWeek = Number((await pool.query(
  "SELECT COUNT(*) AS n FROM event_log WHERE event_type = 'login' AND created_at >= $1",
  [weekStart],
)).rows[0].n)

const dbBookingsMonth = Number((await pool.query(
  "SELECT COUNT(*) AS n FROM event_log WHERE event_type = 'booking_created' AND created_at >= $1 AND created_at < $2",
  [currentStart, currentEnd],
)).rows[0].n)

const dbWhatsappMonth = Number((await pool.query(
  `SELECT COUNT(*) AS n FROM event_log
   WHERE event_type IN ('whatsapp_confirmation_sent', 'whatsapp_reminder_sent')
   AND created_at >= $1 AND created_at < $2`,
  [currentStart, currentEnd],
)).rows[0].n)

const dbFirst = (await pool.query('SELECT MIN(created_at) AS v FROM event_log')).rows[0].v
const dbLast = (await pool.query('SELECT MAX(created_at) AS v FROM event_log')).rows[0].v
const eventLogCount = Number((await pool.query('SELECT COUNT(*) AS n FROM event_log')).rows[0].n)

const unauth = await request('/usage/me')
const authed = await request('/usage/me', { cookie })

const allowedKeys = new Set([
  'loginsThisWeek',
  'bookingsCreatedThisMonth',
  'whatsappMessagesSentThisMonth',
  'lastActiveAt',
  'firstActivityAt',
])
const responseKeys = authed.json ? Object.keys(authed.json) : []
const extraKeys = responseKeys.filter((k) => !allowedKeys.has(k))

console.log(
  JSON.stringify(
    {
      eventLogCount,
      unauthStatus: unauth.status,
      authedStatus: authed.status,
      api: authed.json,
      db: {
        loginsThisWeek: dbLoginsWeek,
        bookingsCreatedThisMonth: dbBookingsMonth,
        whatsappMessagesSentThisMonth: dbWhatsappMonth,
        firstActivityAt: dbFirst,
        lastActiveAt: dbLast,
      },
      match: authed.json
        ? {
            loginsThisWeek: authed.json.loginsThisWeek === dbLoginsWeek,
            bookingsCreatedThisMonth:
              authed.json.bookingsCreatedThisMonth === dbBookingsMonth,
            whatsappMessagesSentThisMonth:
              authed.json.whatsappMessagesSentThisMonth === dbWhatsappMonth,
            firstActivityAt: authed.json.firstActivityAt === dbFirst,
            lastActiveAt: authed.json.lastActiveAt === dbLast,
          }
        : null,
      extraResponseKeys: extraKeys,
      firstActivitySql: 'SELECT MIN(created_at) AS first_activity FROM event_log',
    },
    null,
    2,
  ),
)
await pool.end()
