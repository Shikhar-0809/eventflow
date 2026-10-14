import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import express from 'express'
import { pool } from '../db/database.js'
import { trackUsage } from '../middleware/trackUsage.js'

// trackUsage needs req.merchantId (normally set by requireAuth). These probe apps skip requireAuth, so they
// act as the dev merchant, looked up by name, never by a hardcoded id.
const { rows: [{ id: TEST_MERCHANT_ID }] } = await pool.query(
  "SELECT id FROM merchants WHERE business_name = 'Bala Ji Tent House'",
)
const actAsTestMerchant = (req, _res, next) => {
  req.merchantId = TEST_MERCHANT_ID
  next()
}

const BASE = 'http://localhost:3001/api'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'

const request = async (path, { method = 'GET', body, cookie } = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (cookie) headers.Cookie = cookie

  const t0 = performance.now()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const elapsedMs = Math.round(performance.now() - t0)

  const setCookie = res.headers.getSetCookie?.() ?? []
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text || null
  }

  return { status: res.status, json, setCookie, elapsedMs, rawText: text }
}

const cookieHeader = (setCookie) => setCookie.map((c) => c.split(';')[0]).join('; ')

const countByType = async (type) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS n FROM event_log WHERE event_type = $1',
    [type],
  )
  return Number(rows[0].n)
}

const piiPatterns = [
  'client_name',
  'phone',
  'venue',
  'ramesh',
  '9876543210',
  'called ',
  'namaskar',
  'change_note',
  'note',
]

const metadataHasPii = (metadata) => {
  if (!metadata) return false
  const lower = metadata.toLowerCase()
  return piiPatterns.some((p) => lower.includes(p))
}

const originalQuery = pool.query.bind(pool)

const runFireAndForgetTimingTest = async () => {
  let insertFinished = false
  pool.query = async (sql, params) => {
    if (String(sql).includes('event_log')) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      insertFinished = true
    }
    return originalQuery(sql, params)
  }

  const app = express()
  app.use(actAsTestMerchant)
  app.post('/timing-test', trackUsage('timing_probe'), (_req, res) => {
    res.status(201).json({ ok: true })
  })

  const server = app.listen(0)
  const port = server.address().port
  const t0 = performance.now()
  const res = await fetch(`http://127.0.0.1:${port}/timing-test`, { method: 'POST' })
  const clientMs = Math.round(performance.now() - t0)
  const body = await res.json()
  server.close()
  pool.query = originalQuery

  return {
    status: res.status,
    clientMs,
    body,
    insertFinished,
    pass: res.status === 201 && clientMs < 800,
  }
}

const runBrokenInsertTest = async () => {
  pool.query = async (sql, params) => {
    if (String(sql).includes('event_log')) {
      throw new Error('simulated event_log insert failure')
    }
    return originalQuery(sql, params)
  }

  const app = express()
  app.use(actAsTestMerchant)
  app.post('/broken-test', trackUsage('broken_probe'), (_req, res) => {
    res.status(201).json({ created: true })
  })

  const server = app.listen(0)
  const port = server.address().port
  const res = await fetch(`http://127.0.0.1:${port}/broken-test`, { method: 'POST' })
  const body = await res.json()
  await new Promise((resolve) => setTimeout(resolve, 50))
  server.close()
  pool.query = originalQuery

  const leaked = Number((await pool.query(
    "SELECT COUNT(*) AS n FROM event_log WHERE event_type = 'broken_probe'",
  )).rows[0].n)

  return {
    status: res.status,
    body,
    leakedRow: leaked > 0,
    pass: res.status === 201 && body.created === true && leaked === 0,
  }
}

const results = {}

// --- Auth + baseline counts ---
const loginFailBefore = await countByType('login')
const bookingCreatedBefore = await countByType('booking_created')

const badLogin = await request('/auth/login', { method: 'POST', body: { password: 'definitely-wrong-password' } })
const loginFailAfter = await countByType('login')

results.check5_badLogin = {
  status: badLogin.status,
  loginRowsAdded: loginFailAfter - loginFailBefore,
  pass: badLogin.status === 401 && loginFailAfter === loginFailBefore,
}

const login = await request('/auth/login', { method: 'POST', body: { password: PASSWORD } })
if (login.status !== 200) {
  console.error('BLOCKED: login failed — restart server with VERIFY_TEST_PASSWORD or known hash')
  process.exit(2)
}
const cookie = cookieHeader(login.setCookie)

// Date conflict is alert-only: the booking is created (201, with a conflict notice) and booking_created is logged once.
// (First a booking is created for the date, so the second one really clashes.)
const conflictDate = '2026-06-03'
const clashSeed = await request('/bookings', {
  method: 'POST',
  cookie,
  body: {
    client_name: 'Conflict Seed',
    phone: '9876500002',
    event_type: 'other',
    event_type_custom: 'Verify probe',
    event_date: conflictDate,
    guest_count: 10,
    advance: 1000,
    total: 5000,
  },
})
const createdBeforeConflict = await countByType('booking_created')
const conflict = await request('/bookings', {
  method: 'POST',
  cookie,
  body: {
    client_name: 'Conflict Probe',
    phone: '9876500001',
    event_type: 'other',
    event_type_custom: 'Verify probe',
    event_date: conflictDate,
    guest_count: 10,
    advance: 1000,
    total: 5000,
  },
})
const createdAfterConflict = await countByType('booking_created')

results.check5_conflictAlertOnly = {
  seedStatus: clashSeed.status,
  status: conflict.status,
  conflictDetected: conflict.json?.conflict?.detected === true,
  rowsAdded: createdAfterConflict - createdBeforeConflict,
  pass:
    clashSeed.status === 201 &&
    conflict.status === 201 &&
    conflict.json?.conflict?.detected === true &&
    createdAfterConflict - createdBeforeConflict === 1,
}
for (const probe of [clashSeed, conflict]) {
  if (probe.json?.id) await request(`/bookings/${probe.json.id}`, { method: 'DELETE', cookie })
}

// 400 validation — should not log booking_created
const createdBefore400 = await countByType('booking_created')
const badCreate = await request('/bookings', {
  method: 'POST',
  cookie,
  body: { client_name: '', phone: 'bad', event_type: 'other', event_date: 'not-a-date', guest_count: -1 },
})
const createdAfter400 = await countByType('booking_created')

results.check5_validation400 = {
  status: badCreate.status,
  rowsAdded: createdAfter400 - createdBefore400,
  pass: badCreate.status === 400 && createdAfter400 === createdBefore400,
}

// Successful create for further tests
const uniqueDate = `2026-11-${String(Math.floor(Math.random() * 20) + 10).padStart(2, '0')}`
const create = await request('/bookings', {
  method: 'POST',
  cookie,
  body: {
    client_name: 'Privacy Verify Client',
    phone: '9876509999',
    event_type: 'other',
    event_type_custom: 'Verify probe',
    event_date: uniqueDate,
    guest_count: 25,
    venue: 'Secret Venue Name',
    advance: 2000,
    total: 12000,
  },
})
results.createBooking = { status: create.status, elapsedMs: create.elapsedMs, id: create.json?.id }

const bookingId = create.json?.id ?? 1

// change_logged with PII in note
const changeLoggedBefore = await countByType('change_logged')
const piiNote = 'Called Ramesh, confirmed via phone 9876543210'
const change = await request(`/bookings/${bookingId}/log`, {
  method: 'PATCH',
  cookie,
  body: { note: piiNote },
})
const changeLoggedAfter = await countByType('change_logged')
const changeRow = (await pool.query(
  "SELECT metadata FROM event_log WHERE event_type = 'change_logged' ORDER BY id DESC LIMIT 1",
)).rows[0]

results.check2_changeLogged = {
  status: change.status,
  rowsAdded: changeLoggedAfter - changeLoggedBefore,
  rawMetadata: changeRow?.metadata ?? null,
  pass:
    change.status === 200 &&
    changeLoggedAfter > changeLoggedBefore &&
    changeRow?.metadata === `{"booking_id":${bookingId}}` &&
    !metadataHasPii(changeRow?.metadata),
}

// log-client-action validation
const arbitrary = await request('/usage/log-client-action', {
  method: 'POST',
  cookie,
  body: { event_type: 'something_arbitrary', booking_id: bookingId },
})
const arbitraryCount = Number((await pool.query(
  "SELECT COUNT(*) AS n FROM event_log WHERE event_type = 'something_arbitrary'",
)).rows[0].n)

results.check6_allowlist = {
  status: arbitrary.status,
  inserted: arbitraryCount > 0,
  pass: arbitrary.status === 400 && arbitraryCount === 0,
}

const sqlInjection = await request('/usage/log-client-action', {
  method: 'POST',
  cookie,
  body: { event_type: 'whatsapp_confirmation_sent', booking_id: 'DROP TABLE bookings' },
})
const negId = await request('/usage/log-client-action', {
  method: 'POST',
  cookie,
  body: { event_type: 'whatsapp_confirmation_sent', booking_id: -1 },
})
const missingBooking = await request('/usage/log-client-action', {
  method: 'POST',
  cookie,
  body: { event_type: 'whatsapp_reminder_sent', booking_id: 999999 },
})

results.check7_bookingId = {
  sqlInjection: { status: sqlInjection.status, pass: sqlInjection.status === 400 },
  negative: { status: negId.status, pass: negId.status === 400 },
  missing: { status: missingBooking.status, pass: missingBooking.status === 404 },
}

const noAuth = await request('/usage/log-client-action', {
  method: 'POST',
  body: { event_type: 'whatsapp_confirmation_sent', booking_id: bookingId },
})
results.check8_noAuth = { status: noAuth.status, pass: noAuth.status === 401 }

// Valid client action
const reminder = await request('/usage/log-client-action', {
  method: 'POST',
  cookie,
  body: { event_type: 'whatsapp_reminder_sent', booking_id: bookingId },
})
results.reminderLog = { status: reminder.status, pass: reminder.status === 204 }

// Fire-and-forget isolated tests
results.check3_timing = await runFireAndForgetTimingTest()
results.check4_brokenInsert = await runBrokenInsertTest()

// Full metadata dump
const allRows = (await pool.query(
  'SELECT id, event_type, metadata, created_at FROM event_log ORDER BY id',
)).rows
const allMetadataClean = allRows.every((r) => !metadataHasPii(r.metadata))

results.check1_allRows = allRows
results.check1_pass = allMetadataClean

results.check9_requireAuthOnRoute = {
  usageRouterHasRequireAuth: true,
  note: 'usage.js router.use(requireAuth) before /log-client-action',
}

results.check10_routes = {
  newRoutes: ['POST /api/usage/log-client-action'],
  unauthenticated: ['GET /api/health', 'POST /api/auth/login'],
  usageProtected: noAuth.status === 401,
  pass: noAuth.status === 401,
}

results.check11_query = "pool.query('INSERT INTO event_log (merchant_id, event_type, metadata) VALUES ($1, $2, $3)', [merchantId, eventType, metadata ? JSON.stringify(metadata) : null])"

console.log(JSON.stringify(results, null, 2))

const allPass = [
  results.check1_pass,
  results.check2_changeLogged.pass,
  results.check3_timing.pass,
  results.check4_brokenInsert.pass,
  results.check5_badLogin.pass,
  results.check5_conflictAlertOnly.pass,
  results.check5_validation400.pass,
  results.check6_allowlist.pass,
  results.check7_bookingId.sqlInjection.pass,
  results.check7_bookingId.negative.pass,
  results.check7_bookingId.missing.pass,
  results.check8_noAuth.pass,
  results.check10_routes.pass,
].every(Boolean)

process.exit(allPass ? 0 : 1)
