import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { resolveVerifyPassword, VERIFY_LOGIN_EMAIL } from './lib/verifyScriptAuth.mjs'

const BASE = 'http://localhost:3001/api'
const PASSWORD = resolveVerifyPassword()
const ADMIN_KEY = process.env.ADMIN_ACCESS_KEY
if (!ADMIN_KEY) {
  console.error('ADMIN_ACCESS_KEY is not set in the server env. Refusing to fall back to a default key.')
  process.exit(1)
}

const request = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers, ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json, setCookie: res.headers.getSetCookie?.() ?? [] }
}

const cookieHeader = (setCookie) => setCookie.map((c) => c.split(';')[0]).join('; ')

let cookie = ''
const login = await request('/auth/login', { method: 'POST', body: { email: VERIFY_LOGIN_EMAIL, password: PASSWORD } })
if (login.status === 200) {
  cookie = cookieHeader(login.setCookie)
} else {
  // Fallback when login fails: a session for the dev merchant (looked up by name), signed like the server does.
  const { rows: [{ id: merchantId }] } = await pool.query("SELECT id FROM merchants WHERE business_name = 'Bala Ji Tent House'")
  const token = jwt.sign({ merchant_id: merchantId }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
  cookie = `${process.env.SESSION_COOKIE_NAME}=${token}`
}

const summary = await request('/analytics/summary', { cookie })
const monthly = await request('/analytics/monthly', { cookie })
const usageMe = await request('/usage/me', { cookie })
const adminNoKey = await request('/usage/admin', { cookie })
const adminWithKey = await request('/usage/admin?page=1&limit=5', {
  cookie,
  headers: { 'x-admin-key': ADMIN_KEY },
})

console.log(
  JSON.stringify(
    {
      summary: { status: summary.status, body: summary.json },
      monthly: { status: monthly.status, count: monthly.json?.length, sample: monthly.json?.[0] },
      usageMe: { status: usageMe.status, body: usageMe.json },
      adminNoKey: { status: adminNoKey.status },
      adminWithKey: { status: adminWithKey.status, total: adminWithKey.json?.total, rows: adminWithKey.json?.data?.length },
      eventLogCount: Number((await pool.query('SELECT COUNT(*) AS n FROM event_log')).rows[0].n),
    },
    null,
    2,
  ),
)
await pool.end()
