/**
 * Support script for BookingModal verification — API/DB helpers.
 * UI checks are driven via Cursor MCP browser.
 */
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'
import { resolveVerifyPassword, VERIFY_LOGIN_EMAIL } from './lib/verifyScriptAuth.mjs'

const BASE = 'http://localhost:3001/api'
const PASSWORD = resolveVerifyPassword()

const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: VERIFY_LOGIN_EMAIL, password: PASSWORD }),
  })
  const cookie = res.headers.getSetCookie?.()?.[0]?.split(';')[0]
    ?? res.headers.get('set-cookie')?.split(';')[0]
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  return cookie
}

const countBookings = async () => {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM bookings')
  return Number(rows[0].c)
}

const findFreeDate = async () => {
  const { rows } = await pool.query('SELECT event_date FROM bookings')
  const booked = new Set(rows.map((row) => row.event_date))
  for (let d = 1; d <= 28; d++) {
    const date = `2026-06-${String(d).padStart(2, '0')}`
    if (!booked.has(date)) return date
  }
  return '2026-06-04'
}

const createBookingApi = async (cookie, data) => {
  const res = await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(data),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

export const helpers = { login, countBookings, findFreeDate, createBookingApi, BASE }

const cmd = process.argv[2]
try {
  if (cmd === 'count') {
    console.log(await countBookings())
  } else if (cmd === 'free-date') {
    console.log(await findFreeDate())
  } else if (cmd === 'conflict-date') {
    const { rows } = await pool.query(`
      SELECT event_date, event_type
      FROM bookings
      WHERE event_date IN (SELECT event_date FROM bookings GROUP BY event_date HAVING COUNT(*) > 1)
      LIMIT 1
    `)
    console.log(JSON.stringify(rows[0] ?? { event_date: '2026-06-25', event_type: 'wedding' }))
  } else if (cmd === 'race-book') {
    const date = process.argv[3]
    const cookie = await login()
    const result = await createBookingApi(cookie, {
      client_name: 'Race Script Booking',
      phone: '9876500001',
      event_type: 'other',
      event_date: date,
      guest_count: 50,
      advance: 5000,
      total: 25000,
    })
    console.log(JSON.stringify({
      status: result.status,
      created: result.status === 201,
      bookingId: result.body?.id ?? null,
    }))
  }
  await pool.end()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
