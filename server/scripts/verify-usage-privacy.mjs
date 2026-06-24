import express from 'express'
import db from '../db/database.js'
import { trackUsage } from '../middleware/trackUsage.js'

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

const countByType = (type) =>
  db.prepare('SELECT COUNT(*) AS n FROM event_log WHERE event_type = ?').get(type).n

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

const originalPrepare = db.prepare.bind(db)

const runFireAndForgetTimingTest = async () => {
  db.prepare = (sql) => {
    const stmt = originalPrepare(sql)
    if (!sql.includes('event_log')) return stmt
    return {
      run: (...args) => {
        const start = Date.now()
        while (Date.now() - start < 1500) {
          // deliberate slow sync insert in finish handler
        }
        return stmt.run(...args)
      },
    }
  }

  const app = express()
  app.post('/timing-test', trackUsage('timing_probe'), (_req, res) => {
    res.status(201).json({ ok: true })
  })

  const server = app.listen(0)
  const port = server.address().port
  const t0 = performance.now()
  const res = await fetch(`http://127.0.0.1:${port}/timing-test`, { method: 'POST' })
  const clientMs = Math.round(performance.now() - t0)
  const body = await res.json()
  await new Promise((r) => setTimeout(r, 50))
  server.close()
  db.prepare = originalPrepare

  return {
    status: res.status,
    clientMs,
    body,
    pass: res.status === 201 && clientMs < 800,
  }
}

const runBrokenInsertTest = async () => {
  db.prepare = (sql) => {
    const stmt = originalPrepare(sql)
    if (!sql.includes('event_log')) return stmt
    return {
      run: () => {
        throw new Error('simulated event_log insert failure')
      },
    }
  }

  const app = express()
  app.post('/broken-test', trackUsage('broken_probe'), (_req, res) => {
    res.status(201).json({ created: true })
  })

  const server = app.listen(0)
  const port = server.address().port
  const res = await fetch(`http://127.0.0.1:${port}/broken-test`, { method: 'POST' })
  const body = await res.json()
  await new Promise((r) => setTimeout(r, 50))
  server.close()
  db.prepare = originalPrepare

  const leaked = db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE event_type = 'broken_probe'").get().n

  return {
    status: res.status,
    body,
    leakedRow: leaked > 0,
    pass: res.status === 201 && body.created === true && leaked === 0,
  }
}

const results = {}

// --- Auth + baseline counts ---
const loginFailBefore = countByType('login')
const bookingCreatedBefore = countByType('booking_created')

const badLogin = await request('/auth/login', { method: 'POST', body: { password: 'definitely-wrong-password' } })
const loginFailAfter = countByType('login')

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

// 409 conflict — should not log booking_created
const conflictDate = '2026-06-03'
const createdBeforeConflict = countByType('booking_created')
const conflict = await request('/bookings', {
  method: 'POST',
  cookie,
  body: {
    client_name: 'Conflict Probe',
    phone: '9876500001',
    event_type: 'other',
    event_date: conflictDate,
    guest_count: 10,
    advance: 1000,
    total: 5000,
  },
})
const createdAfterConflict = countByType('booking_created')

results.check5_conflict409 = {
  status: conflict.status,
  rowsAdded: createdAfterConflict - createdBeforeConflict,
  pass: conflict.status === 409 && createdAfterConflict === createdBeforeConflict,
}

// 400 validation — should not log booking_created
const createdBefore400 = countByType('booking_created')
const badCreate = await request('/bookings', {
  method: 'POST',
  cookie,
  body: { client_name: '', phone: 'bad', event_type: 'other', event_date: 'not-a-date', guest_count: -1 },
})
const createdAfter400 = countByType('booking_created')

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
const changeLoggedBefore = countByType('change_logged')
const piiNote = 'Called Ramesh, confirmed via phone 9876543210'
const change = await request(`/bookings/${bookingId}/log`, {
  method: 'PATCH',
  cookie,
  body: { note: piiNote },
})
const changeLoggedAfter = countByType('change_logged')
const changeRow = db
  .prepare("SELECT metadata FROM event_log WHERE event_type = 'change_logged' ORDER BY id DESC LIMIT 1")
  .get()

results.check2_changeLogged = {
  status: change.status,
  rowsAdded: changeLoggedAfter - changeLoggedBefore,
  rawMetadata: changeRow?.metadata ?? null,
  pass:
    change.status === 200 &&
    changeLoggedAfter > changeLoggedBefore &&
    changeRow?.metadata === `{"booking_id":${bookingId}` &&
    !metadataHasPii(changeRow?.metadata),
}

// log-client-action validation
const arbitrary = await request('/usage/log-client-action', {
  method: 'POST',
  cookie,
  body: { event_type: 'something_arbitrary', booking_id: bookingId },
})
const arbitraryCount = db
  .prepare("SELECT COUNT(*) AS n FROM event_log WHERE event_type = 'something_arbitrary'")
  .get().n

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
const allRows = db.prepare('SELECT id, event_type, metadata, created_at FROM event_log ORDER BY id').all()
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

results.check11_query = "db.prepare('INSERT INTO event_log (event_type, metadata) VALUES (?, ?)').run(eventType, metadata ? JSON.stringify(metadata) : null)"

console.log(JSON.stringify(results, null, 2))

const allPass = [
  results.check1_pass,
  results.check2_changeLogged.pass,
  results.check3_timing.pass,
  results.check4_brokenInsert.pass,
  results.check5_badLogin.pass,
  results.check5_conflict409.pass,
  results.check5_validation400.pass,
  results.check6_allowlist.pass,
  results.check7_bookingId.sqlInjection.pass,
  results.check7_bookingId.negative.pass,
  results.check7_bookingId.missing.pass,
  results.check8_noAuth.pass,
  results.check10_routes.pass,
].every(Boolean)

process.exit(allPass ? 0 : 1)
