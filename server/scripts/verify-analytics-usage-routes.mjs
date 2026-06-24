import db from '../db/database.js'
import jwt from 'jsonwebtoken'
import 'dotenv/config'

const BASE = 'http://localhost:3001/api'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'
const ADMIN_KEY = process.env.ADMIN_ACCESS_KEY || 'dev-admin-key-local-only'

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
const login = await request('/auth/login', { method: 'POST', body: { password: PASSWORD } })
if (login.status === 200) {
  cookie = cookieHeader(login.setCookie)
} else {
  const token = jwt.sign({}, process.env.JWT_SECRET, { expiresIn: '1h' })
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
      eventLogCount: db.prepare('SELECT COUNT(*) n FROM event_log').get().n,
    },
    null,
    2,
  ),
)
