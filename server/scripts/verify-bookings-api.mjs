import 'dotenv/config'
import { pool } from '../db/database.js'

const BASE = 'http://localhost:3001'
const COOKIE_NAME = 'eventflow_session'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'

const results = []

const record = (id, name, passed, detail = '') => {
  results.push({ id, name, passed, detail })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id}. ${name}${detail ? ` — ${detail}` : ''}`)
}

const request = async (method, path, { body, cookie } = {}) => {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  if (cookie) opts.headers.Cookie = `${COOKIE_NAME}=${cookie}`

  const res = await fetch(`${BASE}${path}`, opts)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: res.status, json, text }
}

const countOnDate = async (date) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS c FROM bookings WHERE event_date = $1',
    [date],
  )
  return Number(rows[0].c)
}

const validBooking = (overrides = {}) => ({
  client_name: 'Verify Test Client',
  phone: '9876543299',
  event_type: 'other',
  event_date: '2026-12-15',
  guest_count: 50,
  advance: 5000,
  total: 30000,
  ...overrides,
})

const login = async () => {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const cookies = loginRes.headers.getSetCookie?.() ?? []
  const token = cookies
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.split(';')[0]
    ?.split('=')[1]
  return { status: loginRes.status, token }
}

const run = async () => {
  const { status: loginStatus, token } = await login()
  if (loginStatus !== 200 || !token) {
    console.error('Login failed — cannot continue. status=', loginStatus)
    process.exit(1)
  }

  // Find seeded conflict date
  const conflictRow = (await pool.query(`
    SELECT event_date, COUNT(*) AS c FROM bookings
    GROUP BY event_date HAVING COUNT(*) >= 1
    ORDER BY c DESC, event_date ASC LIMIT 1
  `)).rows[0]
  const conflictDate = (await pool.query(`
    SELECT event_date FROM bookings
    GROUP BY event_date HAVING COUNT(*) >= 2
    LIMIT 1
  `)).rows[0]?.event_date ?? conflictRow?.event_date ?? '2026-06-25'

  // 1. empty client_name
  const beforeCount = Number((await pool.query('SELECT COUNT(*) AS c FROM bookings')).rows[0].c)
  const r1 = await request('POST', '/api/bookings', {
    cookie: token,
    body: validBooking({ client_name: '' }),
  })
  const after1 = Number((await pool.query('SELECT COUNT(*) AS c FROM bookings')).rows[0].c)
  record(1, 'POST empty client_name → 400, no DB row',
    r1.status === 400 && r1.json?.error && after1 === beforeCount,
    `status=${r1.status}, error=${r1.json?.error}, rows=${beforeCount}→${after1}`)

  // 2. bad phone
  const r2 = await request('POST', '/api/bookings', {
    cookie: token,
    body: validBooking({ phone: '12345' }),
  })
  record(2, 'POST invalid phone → 400',
    r2.status === 400 && r2.json?.error?.includes('mobile'),
    `status=${r2.status}, error=${r2.json?.error}`)

  // 3. guest_count 0
  const r3 = await request('POST', '/api/bookings', {
    cookie: token,
    body: validBooking({ guest_count: 0 }),
  })
  record(3, 'POST guest_count 0 → 400',
    r3.status === 400,
    `status=${r3.status}, error=${r3.json?.error}`)

  // 4. guest_count -5
  const r4 = await request('POST', '/api/bookings', {
    cookie: token,
    body: validBooking({ guest_count: -5 }),
  })
  record(4, 'POST guest_count -5 → 400',
    r4.status === 400,
    `status=${r4.status}, error=${r4.json?.error}`)

  // 5. conflict date POST
  const countBeforeConflict = await countOnDate(conflictDate)
  const r5 = await request('POST', '/api/bookings', {
    cookie: token,
    body: validBooking({ event_date: conflictDate }),
  })
  const countAfterConflict = await countOnDate(conflictDate)
  record(5, `POST on conflict date ${conflictDate} → 409, no extra row`,
    r5.status === 409 && r5.json?.conflict === true && r5.json?.booking && countAfterConflict === countBeforeConflict,
    `status=${r5.status}, body=${JSON.stringify(r5.json)}, rows=${countBeforeConflict}→${countAfterConflict}`)

  // 6-10. no auth
  const noAuthGet = await request('GET', '/api/bookings')
  record(6, 'GET /api/bookings no auth → 401', noAuthGet.status === 401, `status=${noAuthGet.status}`)

  const beforeNoAuthPost = Number((await pool.query('SELECT COUNT(*) AS c FROM bookings')).rows[0].c)
  const noAuthPost = await request('POST', '/api/bookings', { body: validBooking({ event_date: '2026-12-20' }) })
  const afterNoAuthPost = Number((await pool.query('SELECT COUNT(*) AS c FROM bookings')).rows[0].c)
  record(7, 'POST /api/bookings no auth → 401, no row',
    noAuthPost.status === 401 && afterNoAuthPost === beforeNoAuthPost,
    `status=${noAuthPost.status}, rows=${beforeNoAuthPost}→${afterNoAuthPost}`)

  const noAuthId = await request('GET', '/api/bookings/1')
  record(8, 'GET /api/bookings/:id no auth → 401', noAuthId.status === 401, `status=${noAuthId.status}`)

  const noAuthCheck = await request('GET', `/api/bookings/check-conflict?date=${conflictDate}`)
  record(9, 'GET check-conflict no auth → 401', noAuthCheck.status === 401, `status=${noAuthCheck.status}`)

  const noAuthPatch = await request('PATCH', '/api/bookings/1/log', { body: { note: 'test' } })
  record(10, 'PATCH /:id/log no auth → 401', noAuthPatch.status === 401, `status=${noAuthPatch.status}`)

  // 11. double-submit same payload
  const doubleDate = '2026-12-25'
  await pool.query('DELETE FROM bookings WHERE event_date = $1', [doubleDate])
  const payload = validBooking({ event_date: doubleDate, phone: '9876543298' })
  const d1 = await request('POST', '/api/bookings', { cookie: token, body: payload })
  const d2 = await request('POST', '/api/bookings', { cookie: token, body: payload })
  const doubleCount = await countOnDate(doubleDate)
  const doubleHandled = d1.status === 201 && d2.status === 409 && doubleCount === 1
  record(11, 'Double-submit same payload → not two rows',
    doubleHandled,
    `first=${d1.status}, second=${d2.status}, rowsOnDate=${doubleCount} — ${doubleHandled ? 'handled via conflict check (not idempotency keys)' : 'FINDING: duplicate or unexpected behavior'}`)

  // 16. 409 response shape
  const r16 = await request('POST', '/api/bookings', {
    cookie: token,
    body: validBooking({ event_date: conflictDate }),
  })
  const bookingKeys = r16.json?.booking ? Object.keys(r16.json.booking) : []
  const archShape = ['client_name', 'event_type']
  const leaksPhone = bookingKeys.includes('phone')
  record(16, '409 conflict body shape vs ARCHITECTURE.md',
    r16.status === 409 && r16.json?.conflict === true && !leaksPhone,
    `keys=${bookingKeys.join(',')}; ARCHITECTURE expects {client_name,event_type} only; phone leaked=${leaksPhone}`)

  // 17. rate limiter — 21 requests with unique dates
  let rateLimitHit = false
  let rateLimitStatus = null
  let rateLimitBody = null
  for (let i = 0; i < 21; i++) {
    const day = String(i + 1).padStart(2, '0')
    const res = await request('POST', '/api/bookings', {
      cookie: token,
      body: validBooking({
        event_date: `2027-01-${day}`,
        phone: `9876543${String(200 + i).slice(-3)}`,
        client_name: `Rate Test ${i}`,
      }),
    })
    if (i === 20) {
      rateLimitStatus = res.status
      rateLimitBody = res.json
      rateLimitHit = res.status === 429 && res.json?.error === 'Too many requests. Please slow down.'
    }
  }
  record(17, 'bookingCreateRateLimiter 21st request → 429',
    rateLimitHit,
    `status=${rateLimitStatus}, body=${JSON.stringify(rateLimitBody)}`)

  console.log('\n--- Summary ---')
  const failed = results.filter((r) => r.passed === false)
  console.log(`${results.length - failed.length}/${results.length} HTTP checks passed`)
  if (failed.length) console.log('Failures/findings:', failed.map((f) => `${f.id}: ${f.detail}`).join('\n'))
  process.exit(failed.filter((f) => f.id !== 11 && f.id !== 16).length > 0 ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
