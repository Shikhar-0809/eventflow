import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'
import { resolveVerifyPassword } from './lib/verifyScriptAuth.mjs'

const BASE = 'http://localhost:3001/api'
const PASSWORD = resolveVerifyPassword()

const request = async (path, { method = 'GET', cookie, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

const summaryRes = await request('/analytics/summary', { cookie })
const monthlyRes = await request('/analytics/monthly', { cookie })

const bookingCount = Number((await pool.query('SELECT COUNT(*) AS n FROM bookings')).rows[0].n)
const monthsWithBookings = (monthlyRes.json ?? []).filter((r) => r.bookings > 0)

console.log(
  JSON.stringify(
    {
      login: 'ok',
      bookingCount,
      summary: summaryRes,
      monthly: monthlyRes,
      monthsWithBookings: monthsWithBookings.length,
      monthsWithBookingsDetail: monthsWithBookings,
      revenueFormatted: `₹${Number(summaryRes.json?.revenueThisMonth ?? 0).toLocaleString('en-IN')}`,
    },
    null,
    2,
  ),
)
await pool.end()
