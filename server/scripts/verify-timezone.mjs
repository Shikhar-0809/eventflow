// Merchant time zone check (BUGS #100): "today", "this month" and "this week" are the Asia/Kolkata day, not the server's.
//
//   npm run verify:timezone -- --confirm-host=<dev host>      (from server/)
//
// Dev databases only (refuses the production host outright; needs --confirm-host). The whole script and every API server
// it starts run with TZ=UTC, like Render. Part 1 needs no database: it checks services/merchantTime.js and the client's
// utils/merchantTime.js at the IST day, month, year and week boundaries with an injected `now`. Part 2 creates one
// throwaway merchant (TIMEZONE-FIXTURE-1) with bookings on boundary dates and event_log rows at boundary instants, then,
// for each pinned "now", starts the real API server with MERCHANT_NOW_OVERRIDE (honoured only when NODE_ENV is not
// 'production': part 1 proves that) and reads analytics summary / monthly, inventory in_use_today, pending balances,
// the profile's upcoming count and the usage week. The merchant and everything it owns are removed at the end (and at
// the start of the next run if a run crashed). Fictional data only; output is PASS/FAIL per check, never names or phones.
//
// What is NOT covered: the real wall clock (the pinned instants stand in for it) and the Render dashboard's own time
// zone setting; the code no longer depends on either.
process.env.TZ = 'UTC'

import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'
import * as server from '../services/merchantTime.js'

assertConfirmedDatabaseHost()

const here = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(here, '..')
const repoRoot = path.resolve(serverDir, '..')

let failures = 0
let passes = 0
const check = (ok, name, detail = '') => {
  if (ok) passes += 1
  else failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  ' + detail : ''}`)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const at = (iso) => new Date(iso)

// ================================================================ Part 1: units (no database)
console.log('-- Part 1: merchantTime helpers at the boundaries (process TZ forced to UTC)')
check(new Date(2026, 0, 1).getTimezoneOffset() === 0, 'this process runs in UTC, like Render')

const { buildSync } = createRequire(path.join(repoRoot, 'client/package.json'))('esbuild')
const bundle = buildSync({
  entryPoints: [path.join(repoRoot, 'client/src/utils/merchantTime.js')],
  bundle: true,
  write: false,
  format: 'esm',
}).outputFiles[0].text
const client = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`)

const cases = [
  { now: '2026-10-31T18:29:00Z', today: '2026-10-31', month: '2026-10', hour: 23, label: 'still Oct 31 in IST (23:59)' },
  { now: '2026-10-31T18:31:00Z', today: '2026-11-01', month: '2026-11', hour: 0, label: 'Nov 1 in IST (00:01)' },
  { now: '2026-12-31T18:31:00Z', today: '2027-01-01', month: '2027-01', hour: 0, label: 'new year in IST (00:01)' },
  { now: '2026-10-19T06:30:00Z', today: '2026-10-19', month: '2026-10', hour: 12, label: 'mid-day (12:00 IST)' },
]
for (const c of cases) {
  const now = at(c.now)
  check(server.todayISO(now) === c.today, `server todayISO(${c.now}) = ${c.today} (${c.label})`, server.todayISO(now))
  check(client.todayISO(now) === c.today, `client todayISO(${c.now}) = ${c.today}`, client.todayISO(now))
  check(server.monthRange(now).month === c.month && server.monthRange(now).start === `${c.month}-01`, `server monthRange month = ${c.month}`, JSON.stringify(server.monthRange(now)))
  check(client.currentMonthKey(now) === c.month && client.monthStartISO(now) === `${c.month}-01`, `client month = ${c.month}`)
  check(server.merchantHour(now) === c.hour && client.merchantHour(now) === c.hour, `merchantHour = ${c.hour}`)
}
check(server.monthRange(at('2026-10-31T18:31:00Z')).end === '2026-12-01', 'monthRange end is the first day of the next month (exclusive)')
check(server.monthRange(at('2026-12-31T18:31:00Z')).end === '2027-02-01', 'monthRange end rolls over the year')
check(same(server.lastMonths(at('2026-12-31T18:31:00Z'), 6).keys, ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']), 'lastMonths across the year rollover')
check(server.lastMonths(at('2026-12-31T18:31:00Z'), 6).start === '2026-08-01' && server.lastMonths(at('2026-12-31T18:31:00Z'), 6).end === '2027-02-01', 'lastMonths window bounds')
check(server.startOfDayInstant('2026-11-01').toISOString() === '2026-10-31T18:30:00.000Z', 'startOfDayInstant(2026-11-01) = 2026-10-31T18:30Z (IST midnight)')
check(server.addDaysISO('2026-12-31', 1) === '2027-01-01' && server.daysBetweenISO('2026-10-31', '2026-11-02') === 2 && client.daysBetweenISO('2026-10-31', '2026-11-02') === 2, 'calendar-date arithmetic')

const wkBefore = server.weekRange(at('2026-10-18T18:29:00Z'))
const wkAfter = server.weekRange(at('2026-10-18T18:31:00Z'))
check(wkBefore.startDate === '2026-10-12' && wkBefore.endDate === '2026-10-18', 'Sun 23:59 IST is still the week of Mon Oct 12', JSON.stringify(wkBefore))
check(wkAfter.startDate === '2026-10-19' && wkAfter.endDate === '2026-10-25' && wkAfter.startInstant.toISOString() === '2026-10-18T18:30:00.000Z' && wkAfter.endInstantExclusive.toISOString() === '2026-10-25T18:30:00.000Z', 'Mon 00:01 IST starts the week of Mon Oct 19; instants are the IST midnights', JSON.stringify(wkAfter))
check(client.weekRangeISO(at('2026-10-18T18:31:00Z')).weekStart === '2026-10-19' && client.weekRangeISO(at('2026-10-18T18:29:00Z')).weekEnd === '2026-10-18', 'client week agrees with the server')
check(server.weekRange(at('2026-10-20T06:00:00Z'), 1).startDate === '2026-10-12', 'weekOffset 1 is the previous week')

{
  const savedEnv = { NODE_ENV: process.env.NODE_ENV, MERCHANT_NOW_OVERRIDE: process.env.MERCHANT_NOW_OVERRIDE }
  process.env.MERCHANT_NOW_OVERRIDE = '2001-02-03T04:05:06Z'
  process.env.NODE_ENV = 'development'
  const pinned = server.merchantNow().toISOString() === '2001-02-03T04:05:06.000Z'
  process.env.NODE_ENV = 'production'
  const ignored = Math.abs(server.merchantNow().getTime() - Date.now()) < 5000
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  check(pinned, 'MERCHANT_NOW_OVERRIDE pins "now" when NODE_ENV is development')
  check(ignored, 'MERCHANT_NOW_OVERRIDE is ignored when NODE_ENV is production')

  // An allowlist: only 'development' and 'test' may pin the clock; unset, misspelled or other values may not.
  const pinnedIn = (nodeEnv) => {
    const saved = { NODE_ENV: process.env.NODE_ENV, MERCHANT_NOW_OVERRIDE: process.env.MERCHANT_NOW_OVERRIDE }
    process.env.MERCHANT_NOW_OVERRIDE = '2001-02-03T04:05:06Z'
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv
    const result = server.merchantNow().toISOString() === '2001-02-03T04:05:06.000Z'
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    return result
  }
  check(pinnedIn('test') === true, 'NODE_ENV=test may pin the clock')
  check(pinnedIn(undefined) === false, 'an unset NODE_ENV may not pin the clock')
  check(pinnedIn('staging') === false && pinnedIn('Production') === false && pinnedIn('dev') === false, 'staging, Production (capitalised) and dev may not pin the clock')

  // The boot warning: silent without the variable, loud with it, and different when it is ignored.
  check(server.nowOverrideWarning({ NODE_ENV: 'production' }) === null, 'no boot warning when MERCHANT_NOW_OVERRIDE is not set')
  const warnDev = server.nowOverrideWarning({ NODE_ENV: 'development', MERCHANT_NOW_OVERRIDE: '2026-10-31T18:31:00Z' })
  const warnProd = server.nowOverrideWarning({ NODE_ENV: 'production', MERCHANT_NOW_OVERRIDE: '2026-10-31T18:31:00Z' })
  const warnUnset = server.nowOverrideWarning({ MERCHANT_NOW_OVERRIDE: '2026-10-31T18:31:00Z' })
  check(/PINNED/.test(warnDev ?? '') && /WARNING/.test(warnDev ?? ''), 'boot warning says the clock is PINNED when it is honoured')
  check(/IGNORED/.test(warnProd ?? '') && /WARNING/.test(warnProd ?? '') && /IGNORED/.test(warnUnset ?? ''), 'boot warning says IGNORED in production and when NODE_ENV is unset')
}

// ================================================================ Part 2: the real routes
const { pool } = await import('../db/database.js')
const PORT = Number(process.env.TIMEZONE_PORT) || 3014
const BASE = `http://127.0.0.1:${PORT}/api`
const NAME_PREFIX = 'TIMEZONE-FIXTURE'
const q = async (sql, params = []) => (await pool.query(sql, params)).rows

const cleanup = async () => {
  const merchants = await q('SELECT id FROM merchants WHERE business_name LIKE $1', [`${NAME_PREFIX}%`])
  const ids = merchants.map((m) => m.id)
  if (ids.length === 0) return 0
  const tables = (await q(
    `SELECT DISTINCT table_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND column_name = 'merchant_id' AND table_name <> 'merchants'`,
  )).map((r) => r.table_name)
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

let child = null
let bootOutput = ''
const stopServer = async () => {
  if (child) { child.kill(); child = null }
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 300))
    try { await fetch(`${BASE}/health`) } catch { return true }
  }
  return false
}
const startServer = async (nowIso) => {
  bootOutput = ''
  child = spawn('node', ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', TZ: 'UTC', MERCHANT_NOW_OVERRIDE: nowIso },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => { bootOutput += d })
  child.stderr.on('data', (d) => { bootOutput += d })
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    try { if ((await fetch(`${BASE}/health`)).status === 200) return true } catch { /* not up yet */ }
  }
  return false
}
process.on('exit', () => { try { child?.kill() } catch { /* already gone */ } })

let fixturesReady = false
try {
  console.log('\n-- Part 2: routes, API server running with TZ=UTC and a pinned "now"')
  const leftovers = await cleanup()
  if (leftovers > 0) console.log(`INFO  removed ${leftovers} fixture merchant(s) left by a previous run`)

  fixturesReady = true
  const [m] = await q(`INSERT INTO merchants (business_name, owner_name) VALUES ($1, 'x') RETURNING id`, [`${NAME_PREFIX}-1`])
  const cookie = `${process.env.SESSION_COOKIE_NAME}=${jwt.sign({ merchant_id: m.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`
  const [item] = await q(
    `INSERT INTO inventory_items (merchant_id, name, total_quantity, damaged_quantity, unit_price)
     VALUES ($1, 'TZ chair', 1000, 0, 10) RETURNING id`, [m.id])

  let phone = 9000000300
  const booking = async (eventDate, total, qty = 0) => {
    phone += 1
    const [b] = await q(
      `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, advance, total, subtotal, discount, grand_total)
       VALUES ($1, 'TZ client', $2, 'wedding', $3, 10, 0, $4, $4, 0, $4) RETURNING id`,
      [m.id, String(phone), eventDate, total])
    if (qty > 0) {
      await q(
        `INSERT INTO booking_inventory (merchant_id, booking_id, item_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, 10, $5)`, [m.id, b.id, item.id, qty, qty * 10])
    }
    return b.id
  }
  const P = await booking('2026-10-31', 2000, 4)
  const Q = await booking('2026-11-01', 1000, 5)
  const R = await booking('2026-11-02', 500)
  const S = await booking('2026-10-01', 300)
  const T = await booking('2027-01-01', 700)

  // event_log rows at boundary instants for the usage week (created_at is text with an explicit offset).
  const logins = ['2026-10-18 18:29:00+00', '2026-10-18 18:31:00+00', '2026-10-19 10:00:00+00', '2026-10-25 18:29:00+00', '2026-10-25 18:31:00+00']
  for (const when of logins) {
    await q(`INSERT INTO event_log (merchant_id, event_type, metadata, created_at) VALUES ($1, 'login', NULL, $2)`, [m.id, when])
  }

  const get = async (route) => {
    const res = await fetch(`${BASE}${route}`, { headers: { Cookie: cookie } })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const lastMonth = (monthly) => monthly[monthly.length - 1]
  const entry = (monthly, key) => monthly.find((x) => x.month === key)
  const inUse = async () => (await get('/inventory')).body.find((i) => i.id === item.id).in_use_today
  const pendingIds = async () => (await get('/bookings/pending-balances')).body.map((b) => [b.id, b.days_until_event])

  const scenario = async (title, nowIso, run) => {
    console.log(`\n-- ${title}  (now = ${nowIso})`)
    if (!(await startServer(nowIso))) { check(false, 'API server boots'); return }
    check(bootOutput.includes('WARNING: MERCHANT_NOW_OVERRIDE is set') && bootOutput.includes('PINNED'), 'the server logged the loud boot warning for the pinned clock')
    try { await run() } finally { await stopServer() }
  }

  await scenario('23:59 IST on Oct 31: still October', '2026-10-31T18:29:00Z', async () => {
    const s = (await get('/analytics/summary')).body
    const mo = (await get('/analytics/monthly')).body
    check(s.revenueThisMonth === 2300 && s.bookingsThisMonth === 2, 'summary is October: revenue 2300 (2000 + 300), 2 bookings', JSON.stringify(s))
    check(lastMonth(mo).month === '2026-10' && lastMonth(mo).bookings === 2 && lastMonth(mo).revenue === 2300, 'monthly series ends at 2026-10', JSON.stringify(lastMonth(mo)))
    check(await inUse() === 4, 'in_use_today = 4 (the Oct 31 booking)')
    check(same(await pendingIds(), [[P, 0], [Q, 1], [R, 2], [T, 62]]), 'pending balances: Oct 31 is day 0, Nov 1 is day 1, past Oct 1 excluded', JSON.stringify(await pendingIds()))
    check((await get('/profile')).body?.summary?.upcoming === 4, 'profile upcoming = 4 (Oct 31, Nov 1, Nov 2, Jan 1)')
  })

  await scenario('00:01 IST on Nov 1: already November (server clock in UTC says Oct 31)', '2026-10-31T18:31:00Z', async () => {
    const s = (await get('/analytics/summary')).body
    const mo = (await get('/analytics/monthly')).body
    check(s.revenueThisMonth === 1500 && s.bookingsThisMonth === 2, 'summary is November: revenue 1500 (1000 + 500), 2 bookings', JSON.stringify(s))
    check(lastMonth(mo).month === '2026-11' && lastMonth(mo).bookings === 2 && lastMonth(mo).revenue === 1500, 'monthly series ends at 2026-11', JSON.stringify(lastMonth(mo)))
    check(entry(mo, '2026-10')?.bookings === 2 && entry(mo, '2026-10')?.revenue === 2300, 'October is still in the six-month window with its 2 bookings')
    check(await inUse() === 5, 'in_use_today = 5 (the Nov 1 booking)')
    check(same(await pendingIds(), [[Q, 0], [R, 1], [T, 61]]), 'pending balances: Nov 1 is day 0, Oct 31 is gone', JSON.stringify(await pendingIds()))
    check((await get('/profile')).body?.summary?.upcoming === 3, 'profile upcoming = 3')
  })

  await scenario('00:01 IST on Jan 1: new year', '2026-12-31T18:31:00Z', async () => {
    const s = (await get('/analytics/summary')).body
    const mo = (await get('/analytics/monthly')).body
    check(s.revenueThisMonth === 700 && s.bookingsThisMonth === 1, 'summary is January 2027: revenue 700, 1 booking', JSON.stringify(s))
    check(same(mo.map((x) => x.month), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']), 'monthly keys run 2026-08 .. 2027-01')
    check(lastMonth(mo).bookings === 1 && lastMonth(mo).revenue === 700, 'January 2027 bucket holds the Jan 1 booking')
    check(s.peakMonth?.month === '2026-11' && s.peakMonth?.count === 2, 'peak month over the window is 2026-11 (2 bookings, ties go to the later month)', JSON.stringify(s.peakMonth))
    check(same(await pendingIds(), [[T, 0]]), 'pending balances: only the Jan 1 booking, day 0', JSON.stringify(await pendingIds()))
    check(await inUse() === 0, 'in_use_today = 0 on Jan 1')
  })

  await scenario('Tuesday 11:30 IST: the usage week', '2026-10-20T06:00:00Z', async () => {
    const w0 = (await get('/usage/me')).body
    check(w0.loginsThisWeek === 3, 'week Oct 19-25 (IST) counts 3 logins: Sun 23:59 IST before it and Mon 00:01 IST after it are outside', JSON.stringify(w0))
    check(w0.daysActiveThisWeek === 2, 'days active = 2 in IST days (two logins on IST Oct 19 that straddle a UTC date, one on Oct 25)', String(w0.daysActiveThisWeek))
    check(w0.weekLabel === '19 Oct – 25 Oct 2026', 'week label', w0.weekLabel)
    const w1 = (await get('/usage/me?weekOffset=1')).body
    check(w1.loginsThisWeek === 1 && w1.daysActiveThisWeek === 1 && w1.weekLabel === '12 Oct – 18 Oct 2026', 'previous week Oct 12-18 holds the Sun 23:59 IST login', JSON.stringify(w1))
  })
} catch (err) {
  failures += 1
  console.log(`ERROR  ${String(err.message).slice(0, 200)}`)
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
