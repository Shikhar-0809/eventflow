// Analytics check (BUGS #096): cancelled bookings never count toward revenue, booking counts, peak month or clients,
// and the analytics numbers agree with the reports endpoint.
//
//   npm run verify:analytics -- --confirm-host=<dev host>      (from server/)
//
// Dev databases only: it refuses the production host outright (no override flag) and needs --confirm-host.
// It boots its own API server on a spare port and creates one throwaway merchant (ANALYTICS-FIXTURE) that starts
// empty, like a fresh signup (it is inserted directly: sign-up needs an emailed code). Bookings are created through
// POST /bookings and cancelled through PATCH /bookings/:id/status, so the real routes are exercised. The merchant
// and everything it owns are removed at the end (and at the start of the next run if a run crashed).
// Fictional data only. Output: PASS/FAIL per check, never names or phones.
//
// Expected values are written out by hand below; the script does not import the server's status predicate.
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawn } from 'node:child_process'
import jwt from 'jsonwebtoken'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')

const PORT = Number(process.env.ANALYTICS_PORT) || 3011
const BASE = `http://127.0.0.1:${PORT}/api`
const NAME_PREFIX = 'ANALYTICS-FIXTURE'

let failures = 0
let passes = 0
const check = (ok, name, detail = '') => {
  if (ok) passes += 1
  else failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  ' + detail : ''}`)
}
const q = async (sql, params = []) => (await pool.query(sql, params)).rows
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------- dates (local, like the analytics routes)

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const monthOf = (offset) => new Date(now.getFullYear(), now.getMonth() + offset, 1)
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const dayIn = (d, day) => `${keyOf(d)}-${pad(day)}`
const lastDayOf = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
const THIS = monthOf(0)
const EARLIER = monthOf(-2)
const THIS_KEY = keyOf(THIS)
const EARLIER_KEY = keyOf(EARLIER)

// ---------------------------------------------------------------- fixtures

const cleanup = async () => {
  const merchants = await q('SELECT id FROM merchants WHERE business_name LIKE $1', [`${NAME_PREFIX}%`])
  const ids = merchants.map((m) => m.id)
  if (ids.length === 0) return 0
  const tables = (await q(
    `SELECT DISTINCT table_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND column_name = 'merchant_id' AND table_name <> 'merchants'`,
  )).map((r) => r.table_name)
  // Children before parents: retry until the foreign keys let every table empty.
  for (let pass = 0; pass < 6; pass += 1) {
    let blocked = 0
    for (const table of tables) {
      try { await pool.query(`DELETE FROM ${table} WHERE merchant_id = ANY($1)`, [ids]) } catch { blocked += 1 }
    }
    if (blocked === 0) break
  }
  await pool.query('DELETE FROM merchants WHERE id = ANY($1)', [ids])
  return ids.length
}

// ---------------------------------------------------------------- server + http

let child = null
const stopServer = async () => {
  if (child) { child.kill(); child = null }
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 400))
    try { await fetch(`${BASE}/health`) } catch { return true }
  }
  return false
}
const startServer = async () => {
  child = spawn('node', ['index.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    try { if ((await fetch(`${BASE}/health`)).status === 200) return true } catch { /* not up yet */ }
  }
  return false
}
process.on('exit', () => { try { child?.kill() } catch { /* already gone */ } })

const cookieFor = (merchantId) =>
  `${process.env.SESSION_COOKIE_NAME}=${jwt.sign({ merchant_id: merchantId }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

const call = async (cookie, method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, body: json }
}

// ================================================================ main

let fixturesReady = false
try {
  const leftovers = await cleanup()
  if (leftovers > 0) console.log(`INFO  removed ${leftovers} fixture merchant(s) left by a previous run`)

  fixturesReady = true
  const [m] = await q(`INSERT INTO merchants (business_name, owner_name) VALUES ($1, 'x') RETURNING id`, [`${NAME_PREFIX}-1`])

  check(await startServer(), 'server boots on its own port')
  const cookie = cookieFor(m.id)

  const summary = async () => (await call(cookie, 'GET', '/analytics/summary')).body
  const monthly = async () => (await call(cookie, 'GET', '/analytics/monthly')).body
  const slot = (series, key) => series.find((s) => s.month === key)
  const book = async (phone, date, total) => {
    const r = await call(cookie, 'POST', '/bookings', {
      client_name: 'ANALYTICS client', phone, event_type: 'wedding', event_date: date, guest_count: 10, advance: 0, total,
    })
    if (r.status !== 201) throw new Error(`booking create failed with status ${r.status}`)
    return r.body.id
  }
  const cancel = async (id) => {
    const r = await call(cookie, 'PATCH', `/bookings/${id}/status`, { status: 'cancelled' })
    if (r.status !== 200) throw new Error(`cancel failed with status ${r.status}`)
  }
  const report = async (from, to) => (await call(cookie, 'GET', `/reports/range?from=${from}&to=${to}`)).body.summary

  console.log('\n-- baseline: a fresh merchant')
  const s0 = await summary()
  const m0 = await monthly()
  check(same(s0, { revenueThisMonth: 0, bookingsThisMonth: 0, peakMonth: { month: null, count: 0 }, totalClients: 0 }),
    'summary is all zeros with no peak month', JSON.stringify(s0))
  check(Array.isArray(m0) && m0.length === 6 && m0.every((x) => x.bookings === 0 && x.revenue === 0),
    'monthly is six months of zeros')

  // One confirmed booking two months back gives the peak month a known value (count 1) and a second month to compare.
  console.log('\n-- a confirmed booking in an earlier month (Rs 1,000, client A)')
  await book('9000000101', dayIn(EARLIER, 10), 1000)
  const s1 = await summary()
  const m1 = await monthly()
  check(s1.revenueThisMonth === 0 && s1.bookingsThisMonth === 0 && s1.totalClients === 1
    && s1.peakMonth.month === EARLIER_KEY && s1.peakMonth.count === 1,
  'summary: this month untouched, one client, peak month is the earlier month with 1', JSON.stringify(s1))
  check(same(slot(m1, EARLIER_KEY), { month: EARLIER_KEY, bookings: 1, revenue: 1000 }), 'monthly: earlier month shows 1 booking, Rs 1,000')

  console.log('\n-- a confirmed booking this month (Rs 2,500, client B): counts go up by exactly that')
  await book('9000000102', dayIn(THIS, 10), 2500)
  const s2 = await summary()
  const m2 = await monthly()
  check(s2.revenueThisMonth === 2500, 'revenueThisMonth is +2500', `got ${s2.revenueThisMonth}`)
  check(s2.bookingsThisMonth === 1, 'bookingsThisMonth is +1', `got ${s2.bookingsThisMonth}`)
  check(s2.totalClients === 2, 'totalClients is +1', `got ${s2.totalClients}`)
  check(same(slot(m2, THIS_KEY), { month: THIS_KEY, bookings: 1, revenue: 2500 }), 'monthly: this month shows 1 booking, Rs 2,500')
  check(same(slot(m2, EARLIER_KEY), slot(m1, EARLIER_KEY)), 'monthly: the earlier month did not change')
  check(s2.peakMonth.count === 1, 'peak month count is still 1 (two months tied at 1)', JSON.stringify(s2.peakMonth))

  console.log('\n-- cancelled bookings change nothing (Rs 3,000 this month, Rs 7,000 and Rs 4,000 in the earlier month)')
  const cThis = await book('9000000103', dayIn(THIS, 11), 3000) // client C: only booking
  const cEarlier = await book('9000000103', dayIn(EARLIER, 11), 7000)
  const cLate = await book('9000000104', dayIn(EARLIER, 12), 4000) // client D: only booking
  const sLive = await summary()
  check(sLive.totalClients === 4 && sLive.bookingsThisMonth === 2 && sLive.revenueThisMonth === 5500
    && sLive.peakMonth.month === EARLIER_KEY && sLive.peakMonth.count === 3,
  'before cancelling, the same bookings do count (sanity check on the test itself)', JSON.stringify(sLive))
  await cancel(cThis)
  await cancel(cEarlier)
  await cancel(cLate)
  const s3 = await summary()
  const m3 = await monthly()
  check(same(s3, s2), 'summary (revenue, count, peak month, clients) is exactly what it was before those bookings', JSON.stringify(s3))
  check(same(m3, m2), 'monthly (bookings and revenue series) is exactly what it was before those bookings')
  check(s3.totalClients === 2, 'clients whose only bookings are cancelled (C and D) do not count', `got ${s3.totalClients}`)
  const stored = await q(`SELECT COUNT(*)::int AS n FROM bookings WHERE merchant_id = $1 AND status = 'cancelled'`, [m.id])
  check(stored[0].n === 3, 'the three cancelled bookings are still stored (kept in the records)', `got ${stored[0].n}`)

  console.log('\n-- a client with a cancelled and a live booking still counts once')
  await book('9000000103', dayIn(THIS, 12), 500) // client C again, now with a live booking
  const s4 = await summary()
  check(s4.totalClients === 3 && s4.revenueThisMonth === 3000 && s4.bookingsThisMonth === 2,
    'client C counts again through the live booking; revenue +500, count +1', JSON.stringify(s4))

  console.log('\n-- analytics agrees with the reports endpoint')
  const thisFrom = dayIn(THIS, 1)
  const thisTo = dayIn(THIS, lastDayOf(THIS))
  const earlierFrom = dayIn(EARLIER, 1)
  const earlierTo = dayIn(EARLIER, lastDayOf(EARLIER))
  const rThis = await report(thisFrom, thisTo)
  const rEarlier = await report(earlierFrom, earlierTo)
  const sFinal = await summary()
  const mFinal = await monthly()
  check(rThis.totalRevenue === sFinal.revenueThisMonth && rThis.totalBookings === sFinal.bookingsThisMonth,
    'this month: report revenue and booking count equal the summary', `report ${rThis.totalRevenue}/${rThis.totalBookings}, summary ${sFinal.revenueThisMonth}/${sFinal.bookingsThisMonth}`)
  check(rThis.totalRevenue === slot(mFinal, THIS_KEY).revenue && rThis.totalBookings === slot(mFinal, THIS_KEY).bookings,
    'this month: report equals the monthly series')
  check(rEarlier.totalRevenue === slot(mFinal, EARLIER_KEY).revenue && rEarlier.totalBookings === slot(mFinal, EARLIER_KEY).bookings,
    'earlier month: report equals the monthly series', `report ${rEarlier.totalRevenue}/${rEarlier.totalBookings}`)
  const wide = await report(dayIn(monthOf(-5), 1), thisTo)
  check(wide.totalRevenue === mFinal.reduce((a, x) => a + x.revenue, 0) && wide.totalBookings === mFinal.reduce((a, x) => a + x.bookings, 0),
    'six-month report totals equal the sum of the monthly series')

  check(await stopServer(), 'server stopped')
} catch (err) {
  failures += 1
  console.log(`ERROR  ${String(err.message).slice(0, 160)}`)
} finally {
  await stopServer()
  if (fixturesReady) {
    try {
      const removed = await cleanup()
      const [{ n }] = await q('SELECT COUNT(*)::int AS n FROM merchants WHERE business_name LIKE $1', [`${NAME_PREFIX}%`])
      console.log(`\nINFO  fixtures removed (${removed} merchant(s)); ${n} left`)
      if (n !== 0) failures += 1
    } catch (err) {
      failures += 1
      console.log(`ERROR  fixture cleanup failed: ${String(err.message).slice(0, 120)} (the next run will retry)`)
    }
  }
  await pool.end()
  console.log(`\n${passes} passed, ${failures} failed`)
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
