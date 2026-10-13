import 'dotenv/config'
import { pool } from '../db/database.js'

const BASE = 'http://localhost:3001/api'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'

const request = async (path, { method = 'GET', body, cookie } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (cookie) headers.Cookie = cookie

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const setCookie = res.headers.getSetCookie?.() ?? []
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return { status: res.status, json, setCookie }
}

const cookieHeader = (setCookie) => setCookie.map((c) => c.split(';')[0]).join('; ')

const beforeCount = Number((await pool.query('SELECT COUNT(*) AS n FROM event_log')).rows[0].n)

const login = await request('/auth/login', { method: 'POST', body: { password: PASSWORD } })
if (login.status !== 200) {
  console.error('Login failed', login.status, login.json)
  process.exit(1)
}

const cookie = cookieHeader(login.setCookie)

const create = await request('/bookings', {
  method: 'POST',
  cookie,
  body: {
    client_name: 'Usage Log Test Client',
    phone: '9876501234',
    event_type: 'other',
    event_date: '2026-12-15',
    guest_count: 40,
    venue: 'Test Hall',
    advance: 5000,
    total: 30000,
  },
})

if (create.status !== 201) {
  console.error('Create failed', create.status, create.json)
  process.exit(1)
}

const bookingId = create.json.id

const view = await request(`/bookings/${bookingId}`, { cookie })
if (view.status !== 200) {
  console.error('View failed', view.status, view.json)
  process.exit(1)
}

const whatsapp = await request('/usage/log-client-action', {
  method: 'POST',
  cookie,
  body: { event_type: 'whatsapp_confirmation_sent', booking_id: bookingId },
})

if (whatsapp.status !== 204) {
  console.error('WhatsApp log failed', whatsapp.status, whatsapp.json)
  process.exit(1)
}

const rows = (await pool.query(
  'SELECT event_type, metadata, created_at FROM event_log ORDER BY id DESC LIMIT 10',
)).rows

const newRows = rows.filter((r) => {
  const types = ['login', 'booking_created', 'booking_viewed', 'whatsapp_confirmation_sent']
  return types.includes(r.event_type)
})

const byType = Object.fromEntries(
  ['login', 'booking_created', 'booking_viewed', 'whatsapp_confirmation_sent'].map((t) => [
    t,
    rows.find((r) => r.event_type === t && (!r.metadata || JSON.parse(r.metadata).booking_id === bookingId || t === 'login')),
  ]),
)

const piiLeak = rows.some((r) => {
  if (!r.metadata) return false
  const m = r.metadata.toLowerCase()
  return m.includes('client_name') || m.includes('phone') || m.includes('usage log test')
})

console.log(JSON.stringify({
  beforeCount,
  afterCount: Number((await pool.query('SELECT COUNT(*) AS n FROM event_log')).rows[0].n),
  bookingId,
  eventsLogged: {
    login: Boolean(rows.find((r) => r.event_type === 'login')),
    booking_created: Boolean(rows.find((r) => r.event_type === 'booking_created' && JSON.parse(r.metadata || '{}').booking_id === bookingId)),
    booking_viewed: Boolean(rows.find((r) => r.event_type === 'booking_viewed' && JSON.parse(r.metadata || '{}').booking_id === bookingId)),
    whatsapp_confirmation_sent: Boolean(rows.find((r) => r.event_type === 'whatsapp_confirmation_sent' && JSON.parse(r.metadata || '{}').booking_id === bookingId)),
  },
  sampleMetadata: rows.slice(0, 4).map((r) => ({ event_type: r.event_type, metadata: r.metadata })),
  piiLeak,
}, null, 2))

await pool.end()
if (piiLeak) process.exit(1)
