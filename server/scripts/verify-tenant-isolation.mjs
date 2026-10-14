// Proves that one merchant cannot see or change another merchant's data through the API.
//
//   npm run verify:isolation -- --confirm-host=<dev host>
//
// Dev databases only: it refuses the production host outright (no override flag) and needs --confirm-host.
// It boots its own server on a spare port, so it always tests the current code. Merchants are looked up BY NAME.
// Every fixture row it creates carries the label ISOLATION-FIXTURE and is removed again (also at the start of the
// next run if a previous run crashed). Output: PASS/FAIL per check, route names and ids only, never names or phones.
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawn } from 'node:child_process'
import jwt from 'jsonwebtoken'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')

const NAME_A = 'Bala Ji Tent House'
const NAME_B = 'Test Tent Co'
const LABEL = 'ISOLATION-FIXTURE'
const PORT = Number(process.env.ISOLATION_PORT) || 3007
const BASE = `http://127.0.0.1:${PORT}/api`
const NONEXISTENT_ID = 2147483000
const SETTINGS_KEY = 'monthly_revenue_target'
const MARKER_KEY = 'isolation_fixture_settings'
const TENANT_TABLES = [
  'bookings', 'change_log', 'booking_inventory', 'inventory_items',
  'inventory_damage_log', 'booking_expenses', 'event_log', 'merchant_settings',
]

let failures = 0
const check = (ok, name, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const sortedIds = (rows) => rows.map((r) => Number(r.id)).sort((a, b) => a - b)
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const hasMerchantKey = (value) => JSON.stringify(value ?? null).includes('"merchant_id"')
// Compare responses ignoring the numbers in them (ids echoed in messages).
const shape = (res) => `${res.status} ${JSON.stringify(res.body ?? null).replace(/\d+/g, '#')}`

const q = async (sql, params = []) => (await pool.query(sql, params)).rows

// ---------------------------------------------------------------- fixtures

const cleanupFixtures = async (merchantIds) => {
  let removed = 0
  const run = async (sql) => {
    const res = await pool.query(sql, [merchantIds])
    removed += res.rowCount
  }
  await run(`DELETE FROM event_log WHERE merchant_id = ANY($1) AND metadata LIKE '%isolation_fixture%'`)
  await run(`DELETE FROM booking_expenses WHERE merchant_id = ANY($1) AND label LIKE '${LABEL}%'`)
  await run(`DELETE FROM change_log WHERE merchant_id = ANY($1) AND change_note LIKE '${LABEL}%'`)
  await run(`DELETE FROM inventory_damage_log WHERE merchant_id = ANY($1)
             AND (note LIKE '${LABEL}%' OR item_id IN (SELECT id FROM inventory_items WHERE merchant_id = ANY($1) AND name LIKE '${LABEL}%'))`)
  await run(`DELETE FROM booking_inventory WHERE merchant_id = ANY($1)
             AND (booking_id IN (SELECT id FROM bookings WHERE merchant_id = ANY($1) AND client_name LIKE '${LABEL}%')
                  OR item_id IN (SELECT id FROM inventory_items WHERE merchant_id = ANY($1) AND name LIKE '${LABEL}%'))`)
  await run(`DELETE FROM bookings WHERE merchant_id = ANY($1) AND client_name LIKE '${LABEL}%'`)
  await run(`DELETE FROM inventory_items WHERE merchant_id = ANY($1) AND name LIKE '${LABEL}%'`)

  // Settings: put the monthly target back to what it was before the fixture (stored in the marker row).
  const markers = await q(`SELECT merchant_id, value FROM merchant_settings WHERE merchant_id = ANY($1) AND key = $2`, [merchantIds, MARKER_KEY])
  for (const marker of markers) {
    let prior = null
    try { prior = JSON.parse(marker.value).prior ?? null } catch { prior = null }
    if (prior === null) {
      await pool.query('DELETE FROM merchant_settings WHERE merchant_id = $1 AND key = $2', [marker.merchant_id, SETTINGS_KEY])
    } else {
      await pool.query('UPDATE merchant_settings SET value = $3 WHERE merchant_id = $1 AND key = $2', [marker.merchant_id, SETTINGS_KEY, String(prior)])
    }
    await pool.query('DELETE FROM merchant_settings WHERE merchant_id = $1 AND key = $2', [marker.merchant_id, MARKER_KEY])
    removed += 1
  }
  return removed
}

const createFixtures = async (m, tag, date, phone, settingValue) => {
  const [item] = await q(
    `INSERT INTO inventory_items (merchant_id, name, total_quantity, damaged_quantity, unit_price)
     VALUES ($1, $2, 10, 0, 7) RETURNING id`, [m, `${LABEL} item ${tag}`])
  const [booking] = await q(
    `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, advance, total, status)
     VALUES ($1, $2, $3, 'wedding', $4, 1, 0, 1000, 'confirmed') RETURNING id`, [m, `${LABEL} client ${tag}`, phone, date])
  await q(`INSERT INTO booking_inventory (merchant_id, booking_id, item_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, 2, 7, 14)`, [m, booking.id, item.id])
  const [expense] = await q(`INSERT INTO booking_expenses (merchant_id, booking_id, label, amount) VALUES ($1, $2, $3, 5) RETURNING id`, [m, booking.id, `${LABEL} expense ${tag}`])
  const [change] = await q(`INSERT INTO change_log (merchant_id, booking_id, change_note) VALUES ($1, $2, $3) RETURNING id`, [m, booking.id, `${LABEL} note ${tag}`])
  await q(`INSERT INTO inventory_damage_log (merchant_id, item_id, change, note) VALUES ($1, $2, 1, $3)`, [m, item.id, `${LABEL} damage ${tag}`])
  await q(`INSERT INTO event_log (merchant_id, event_type, metadata) VALUES ($1, 'booking_viewed', $2)`, [m, JSON.stringify({ isolation_fixture: true, booking_id: booking.id })])
  const [prior] = await q(`SELECT value FROM merchant_settings WHERE merchant_id = $1 AND key = $2`, [m, SETTINGS_KEY])
  await q(
    `INSERT INTO merchant_settings (merchant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (merchant_id, key) DO UPDATE SET value = EXCLUDED.value`, [m, MARKER_KEY, JSON.stringify({ prior: prior?.value ?? null })])
  await q(
    `INSERT INTO merchant_settings (merchant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (merchant_id, key) DO UPDATE SET value = EXCLUDED.value`, [m, SETTINGS_KEY, settingValue])
  return { item: item.id, booking: booking.id, expense: expense.id, change: change.id, date, settingValue }
}

// ---------------------------------------------------------------- snapshots

const snapshot = async (m) => {
  const counts = {}
  for (const t of TENANT_TABLES) counts[t] = (await q(`SELECT COUNT(*)::int AS n FROM ${t} WHERE merchant_id = $1`, [m]))[0].n
  const [b] = await q(`SELECT COALESCE(md5(string_agg(t::text, '|' ORDER BY id)), '') AS h FROM bookings t WHERE merchant_id = $1`, [m])
  const [i] = await q(`SELECT COALESCE(md5(string_agg(t::text, '|' ORDER BY id)), '') AS h FROM inventory_items t WHERE merchant_id = $1`, [m])
  return { counts, bookings: b.h, inventory: i.h }
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

const call = async (cookie, method, path, { body, headers } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, body: json, text }
}

// ---------------------------------------------------------------- oracles (same rules as the routes, scoped in SQL)

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthStart = (y, mIdx) => `${y}-${pad(mIdx + 1)}-01`
const nextMonthStart = (y, mIdx) => (mIdx === 11 ? `${y + 1}-01-01` : monthStart(y, mIdx + 1))
const weekWindow = () => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const back = today.getDay() === 0 ? 6 : today.getDay() - 1
  const monday = new Date(today); monday.setDate(today.getDate() - back)
  const next = new Date(monday); next.setDate(monday.getDate() + 7)
  return [`${ymd(monday)} 00:00:00`, `${ymd(next)} 00:00:00`]
}

// ================================================================ main

const merchantRows = await q('SELECT id, business_name FROM merchants WHERE business_name = ANY($1)', [[NAME_A, NAME_B]])
const idA = merchantRows.find((r) => r.business_name === NAME_A)?.id
const idB = merchantRows.find((r) => r.business_name === NAME_B)?.id
if (!idA || !idB || idA === idB) {
  console.error('Both dev merchants must exist (run the dev server once to seed them).')
  process.exit(1)
}
const ME = { A: { id: idA, tag: 'A' }, B: { id: idB, tag: 'B' } }
console.log(`merchants: A=${idA}, B=${idB}`)

let fixturesReady = false
try {
  const leftovers = await cleanupFixtures([idA, idB])
  if (leftovers > 0) console.log(`INFO  removed ${leftovers} fixture row(s) left by a previous run`)

  const [defaults] = await q(`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'merchant_id' AND column_default IS NOT NULL`)
  console.log(`INFO  merchant_id columns that still have a DEFAULT: ${defaults.n} (0 once migration 004 is applied)`)

  fixturesReady = true
  ME.A.fx = await createFixtures(idA, 'A', '2099-12-31', '9000000071', '111111')
  ME.B.fx = await createFixtures(idB, 'B', '2099-12-30', '9000000072', '222222')

  check(await startServer(), 'server boots on its own port')
  ME.A.cookie = cookieFor(idA)
  ME.B.cookie = cookieFor(idB)

  // Ids each merchant owns, straight from the DB.
  for (const m of [ME.A, ME.B]) {
    m.ids = {
      bookings: sortedIds(await q('SELECT id FROM bookings WHERE merchant_id = $1', [m.id])),
      items: sortedIds(await q('SELECT id FROM inventory_items WHERE merchant_id = $1', [m.id])),
      expenses: sortedIds(await q('SELECT id FROM booking_expenses WHERE merchant_id = $1', [m.id])),
      changes: sortedIds(await q('SELECT id FROM change_log WHERE merchant_id = $1', [m.id])),
    }
  }
  check(ME.A.ids.expenses.length > 0 && ME.B.ids.expenses.length > 0 && ME.A.ids.changes.length > 0 && ME.B.ids.changes.length > 0,
    'both merchants own bookings, expenses, change-log rows and inventory (cross-checks are not vacuous)')

  // ---- sessions
  console.log('\n-- sessions')
  const emptyToken = `${process.env.SESSION_COOKIE_NAME}=${jwt.sign({}, process.env.JWT_SECRET, { algorithm: 'HS256' })}`
  const ghostToken = cookieFor(NONEXISTENT_ID)
  const e1 = await call(emptyToken, 'GET', '/bookings')
  const e2 = await call(ghostToken, 'GET', '/bookings')
  check(e1.status === 401 && /session has expired/.test(e1.text), 'token without merchant_id -> 401 "session has expired"')
  check(e2.status === 401 && /session has expired/.test(e2.text), 'token for a merchant that does not exist -> 401')
  check((await call(null, 'GET', '/bookings')).status === 401, 'no cookie -> 401')
  // A merchant_id in the body must be ignored.
  const spoof = await call(ME.A.cookie, 'POST', '/inventory', { body: { name: `${LABEL} spoof`, total_quantity: 1, merchant_id: idB } })
  const [spoofRow] = await q('SELECT merchant_id FROM inventory_items WHERE name = $1', [`${LABEL} spoof`])
  check(spoof.status === 201 && spoofRow?.merchant_id === idA && !hasMerchantKey(spoof.body), 'merchant_id in the request body is ignored (item created for the logged-in merchant, not echoed back)')
  await cleanupFixtures([idA, idB]) // removes the spoof item and the marker rows; recreate the fixtures
  ME.A.fx = await createFixtures(idA, 'A', '2099-12-31', '9000000071', '111111')
  ME.B.fx = await createFixtures(idB, 'B', '2099-12-30', '9000000072', '222222')
  for (const m of [ME.A, ME.B]) {
    m.ids = {
      bookings: sortedIds(await q('SELECT id FROM bookings WHERE merchant_id = $1', [m.id])),
      items: sortedIds(await q('SELECT id FROM inventory_items WHERE merchant_id = $1', [m.id])),
      expenses: sortedIds(await q('SELECT id FROM booking_expenses WHERE merchant_id = $1', [m.id])),
      changes: sortedIds(await q('SELECT id FROM change_log WHERE merchant_id = $1', [m.id])),
    }
  }

  // ---- snapshots before the attacks
  const before = { A: await snapshot(idA), B: await snapshot(idB) }

  // ---- attacks, both directions
  console.log('\n-- cross-merchant attacks (every one must look exactly like a nonexistent id)')
  const validBooking = (extra = {}) => ({
    client_name: `${LABEL} attack`, phone: '9000000098', event_type: 'wedding', event_date: '2099-11-11',
    guest_count: 1, advance: 0, total: 0, ...extra,
  })
  const attacks = (attacker, victim) => {
    const v = victim.fx
    const own = attacker.fx
    const list = [
      ['GET /bookings/:id', 'GET', `/bookings/${v.booking}`, `/bookings/${NONEXISTENT_ID}`],
      ['PATCH /bookings/:id', 'PATCH', `/bookings/${v.booking}`, `/bookings/${NONEXISTENT_ID}`, validBooking()],
      ['DELETE /bookings/:id', 'DELETE', `/bookings/${v.booking}`, `/bookings/${NONEXISTENT_ID}`],
      ['PATCH /bookings/:id/status', 'PATCH', `/bookings/${v.booking}/status`, `/bookings/${NONEXISTENT_ID}/status`, { status: 'cancelled' }],
      ['PATCH /bookings/:id/log', 'PATCH', `/bookings/${v.booking}/log`, `/bookings/${NONEXISTENT_ID}/log`, { note: 'x' }],
      ['POST /bookings/:id/expenses', 'POST', `/bookings/${v.booking}/expenses`, `/bookings/${NONEXISTENT_ID}/expenses`, { label: 'x', amount: 1 }],
      ['DELETE /bookings/:id/expenses/:expenseId (foreign booking)', 'DELETE', `/bookings/${v.booking}/expenses/${v.expense}`, `/bookings/${NONEXISTENT_ID}/expenses/${NONEXISTENT_ID}`],
      ['DELETE /bookings/:id/expenses/:expenseId (own booking, foreign expense)', 'DELETE', `/bookings/${own.booking}/expenses/${v.expense}`, `/bookings/${own.booking}/expenses/${NONEXISTENT_ID}`],
      ['PATCH /inventory/:id', 'PATCH', `/inventory/${v.item}`, `/inventory/${NONEXISTENT_ID}`, { total_quantity: 1 }],
      ['DELETE /inventory/:id', 'DELETE', `/inventory/${v.item}`, `/inventory/${NONEXISTENT_ID}`],
      ['PATCH /inventory/:id/price', 'PATCH', `/inventory/${v.item}/price`, `/inventory/${NONEXISTENT_ID}/price`, { unit_price: 1 }],
      ['POST /inventory/:id/damage', 'POST', `/inventory/${v.item}/damage`, `/inventory/${NONEXISTENT_ID}/damage`, { change: 1 }],
      ['POST /inventory/check-availability (foreign item)', 'POST', '/inventory/check-availability', '/inventory/check-availability',
        { date: '2099-01-01', items: [{ item_id: v.item, quantity: 1 }] }, { date: '2099-01-01', items: [{ item_id: NONEXISTENT_ID, quantity: 1 }] }],
      ['POST /bookings (foreign inventory lines)', 'POST', '/bookings', '/bookings',
        validBooking({ inventory: [{ item_id: v.item, quantity: 1 }] }), validBooking({ inventory: [{ item_id: NONEXISTENT_ID, quantity: 1 }] })],
      ['PATCH /bookings/:id (foreign inventory lines on own booking)', 'PATCH', `/bookings/${own.booking}`, `/bookings/${own.booking}`,
        validBooking({ inventory: [{ item_id: v.item, quantity: 1 }] }), validBooking({ inventory: [{ item_id: NONEXISTENT_ID, quantity: 1 }] })],
      ['POST /usage/log-client-action (foreign booking)', 'POST', '/usage/log-client-action', '/usage/log-client-action',
        { event_type: 'whatsapp_reminder_sent', booking_id: v.booking }, { event_type: 'whatsapp_reminder_sent', booking_id: NONEXISTENT_ID }],
    ]
    return list
  }
  for (const [attacker, victim, label] of [[ME.A, ME.B, 'A->B'], [ME.B, ME.A, 'B->A']]) {
    for (const [name, method, foreignPath, ghostPath, body, ghostBody] of attacks(attacker, victim)) {
      const foreign = await call(attacker.cookie, method, foreignPath, { body })
      const ghost = await call(attacker.cookie, method, ghostPath, { body: ghostBody ?? body })
      const ok = (foreign.status === 404 || foreign.status === 400) && shape(foreign) === shape(ghost)
      check(ok, `${label} ${name}`, ok ? `${foreign.status}` : `got ${foreign.status}, nonexistent gives ${ghost.status}`)
    }
    // check-conflict on the other merchant's date, with and without the foreign booking id excluded.
    const c1 = await call(attacker.cookie, 'GET', `/bookings/check-conflict?date=${victim.fx.date}`)
    const c2 = await call(attacker.cookie, 'GET', `/bookings/check-conflict?date=${victim.fx.date}&excludeId=${victim.fx.booking}`)
    check(c1.status === 200 && c1.body?.conflict === false, `${label} GET /bookings/check-conflict on the other merchant's date reports no conflict`)
    check(c2.status === 200 && c2.body?.conflict === false, `${label} GET /bookings/check-conflict (excludeId = foreign booking) reports no conflict`)
  }

  // ---- lists and aggregates: hard failures
  console.log('\n-- lists and aggregates contain only the merchant\'s own data (compared with a per-merchant SQL oracle)')
  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const curStart = monthStart(now.getFullYear(), now.getMonth())
  const curEnd = nextMonthStart(now.getFullYear(), now.getMonth())
  const six = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const sixStart = monthStart(six.getFullYear(), six.getMonth())
  const [weekStart, weekEnd] = weekWindow()
  const scanned = []

  for (const [m, other, label] of [[ME.A, ME.B, 'A'], [ME.B, ME.A, 'B']]) {
    const get = async (path) => { const r = await call(m.cookie, 'GET', path); scanned.push([path, r]); return r }

    const bookings = await get('/bookings')
    check(bookings.status === 200 && sameList(sortedIds(bookings.body ?? []), m.ids.bookings), `${label} GET /bookings = exactly its ${m.ids.bookings.length} bookings`)

    const pendingOracle = sortedIds(await q(`SELECT id FROM bookings WHERE merchant_id = $1 AND status IN ('confirmed','pending') AND (total - advance) > 0 AND event_date::date >= CURRENT_DATE`, [m.id]))
    const pending = await get('/bookings/pending-balances')
    check(pending.status === 200 && sameList(sortedIds(pending.body ?? []), pendingOracle), `${label} GET /bookings/pending-balances = its own ${pendingOracle.length}`)

    const inventory = await get('/inventory')
    const bookedOracle = new Map((await q(
      `SELECT bi.item_id, SUM(bi.quantity)::int AS n FROM booking_inventory bi JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
       WHERE bi.merchant_id = $1 AND b.status != 'cancelled' AND b.event_date LIKE $2 GROUP BY bi.item_id`, [m.id, `${monthPrefix}%`])).map((r) => [Number(r.item_id), r.n]))
    const inUseOracle = new Map((await q(
      `SELECT bi.item_id, SUM(bi.quantity)::int AS n FROM booking_inventory bi JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
       WHERE bi.merchant_id = $1 AND b.status != 'cancelled' AND b.event_date = $2 GROUP BY bi.item_id`, [m.id, ymd(now)])).map((r) => [Number(r.item_id), r.n]))
    const invOk = inventory.status === 200 && sameList(sortedIds(inventory.body ?? []), m.ids.items)
      && (inventory.body ?? []).every((it) => it.booked_this_month === (bookedOracle.get(it.id) ?? 0) && it.in_use_today === (inUseOracle.get(it.id) ?? 0))
    check(invOk, `${label} GET /inventory = exactly its ${m.ids.items.length} items, with booked_this_month and in_use_today from its own bookings only`)

    const records = await get('/records')
    check(records.status === 200 && sameList(sortedIds(records.body ?? []), m.ids.bookings), `${label} GET /records = exactly its bookings`)

    const reports = await get('/reports/range?from=2099-01-01&to=2099-12-31')
    check(reports.status === 200 && reports.text.includes(`${LABEL} client ${m.tag}`) && !reports.text.includes(`${LABEL} client ${other.tag}`),
      `${label} GET /reports/range shows its own fixture booking and not the other merchant's`)

    const summary = await get('/analytics/summary')
    const [sOracle] = await q(
      `SELECT COALESCE(SUM(total) FILTER (WHERE event_date >= $2 AND event_date < $3), 0)::int AS revenue,
              COUNT(*) FILTER (WHERE event_date >= $2 AND event_date < $3)::int AS month_bookings,
              COUNT(DISTINCT phone)::int AS clients
       FROM bookings WHERE merchant_id = $1`, [m.id, curStart, curEnd])
    check(summary.status === 200 && summary.body.revenueThisMonth === sOracle.revenue && summary.body.bookingsThisMonth === sOracle.month_bookings && summary.body.totalClients === sOracle.clients,
      `${label} GET /analytics/summary matches its own data`, `totalClients=${summary.body?.totalClients} oracle=${sOracle.clients}`)

    const monthly = await get('/analytics/monthly')
    const [mOracle] = await q(`SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::int AS revenue FROM bookings WHERE merchant_id = $1 AND event_date >= $2 AND event_date < $3`, [m.id, sixStart, curEnd])
    const mSum = (monthly.body ?? []).reduce((acc, r) => ({ n: acc.n + r.bookings, revenue: acc.revenue + r.revenue }), { n: 0, revenue: 0 })
    check(monthly.status === 200 && mSum.n === mOracle.n && mSum.revenue === mOracle.revenue, `${label} GET /analytics/monthly matches its own data`)

    const me = await get('/usage/me')
    const count = async (types) => (await q(`SELECT COUNT(*)::int AS n FROM event_log WHERE merchant_id = $1 AND event_type = ANY($2) AND created_at::timestamptz >= $3::timestamptz AND created_at::timestamptz < $4::timestamptz`, [m.id, types, weekStart, weekEnd]))[0].n
    const [days] = await q(`SELECT COUNT(DISTINCT (created_at::timestamptz)::date)::int AS n FROM event_log WHERE merchant_id = $1 AND created_at::timestamptz >= $2::timestamptz AND created_at::timestamptz < $3::timestamptz`, [m.id, weekStart, weekEnd])
    const [last] = await q('SELECT MAX(created_at::timestamptz) AS t FROM event_log WHERE merchant_id = $1', [m.id])
    const meOk = me.status === 200
      && me.body.loginsThisWeek === await count(['login'])
      && me.body.bookingsViewedThisWeek === await count(['booking_viewed'])
      && me.body.bookingsThisWeek === await count(['booking_created'])
      && me.body.bookingsEditedThisWeek === await count(['booking_edited'])
      && me.body.changeNotesLoggedThisWeek === await count(['change_logged'])
      && me.body.whatsappMessagesSentThisWeek === await count(['whatsapp_confirmation_sent', 'whatsapp_reminder_sent'])
      && me.body.daysActiveThisWeek === days.n
      && me.body.lastActiveAt === (last.t ? new Date(last.t).toISOString() : null)
    check(meOk, `${label} GET /usage/me counts and last-active come from its own events only`)

    const settings = await get('/settings')
    check(settings.status === 200 && settings.body?.[SETTINGS_KEY] === m.fx.settingValue, `${label} GET /settings returns its own value, not the other merchant's`)
  }

  const leaky = scanned.filter(([, r]) => hasMerchantKey(r.body)).map(([p]) => p)
  check(leaky.length === 0, 'no response (other than the admin feed) contains a merchant_id key', leaky.join(', '))

  // ---- admin feed: cross-merchant by design, but labelled and filterable
  console.log('\n-- admin feed (/usage/admin)')
  const adminHeaders = { 'x-admin-key': process.env.ADMIN_ACCESS_KEY ?? '' }
  const [{ n: totalAll }] = await q('SELECT COUNT(*)::int AS n FROM event_log')
  const adminAll = await call(ME.A.cookie, 'GET', '/usage/admin?page=1&limit=200', { headers: adminHeaders })
  check(adminAll.status === 200 && adminAll.body.total === totalAll && adminAll.body.data.every((row) => Number.isInteger(row.merchant_id)), 'unfiltered feed covers all merchants and every row carries merchant_id', `total=${adminAll.body?.total}`)
  for (const m of [ME.A, ME.B]) {
    const [{ n }] = await q('SELECT COUNT(*)::int AS n FROM event_log WHERE merchant_id = $1', [m.id])
    const filtered = await call(ME.A.cookie, 'GET', `/usage/admin?merchant_id=${m.id}&page=1&limit=200`, { headers: adminHeaders })
    check(filtered.status === 200 && filtered.body.total === n && filtered.body.data.every((row) => row.merchant_id === m.id), `?merchant_id=${m.tag === 'A' ? 'A' : 'B'} returns only that merchant's events`, `total=${filtered.body?.total} oracle=${n}`)
  }
  check((await call(ME.A.cookie, 'GET', '/usage/admin?merchant_id=abc', { headers: adminHeaders })).status === 400, 'invalid ?merchant_id= -> 400')
  check((await call(ME.A.cookie, 'GET', '/usage/admin')).status === 401, 'admin feed without the admin key -> 401')

  // ---- after
  console.log('\n-- nothing changed')
  const after = { A: await snapshot(idA), B: await snapshot(idB) }
  for (const k of ['A', 'B']) {
    check(JSON.stringify(before[k].counts) === JSON.stringify(after[k].counts), `merchant ${k} row counts identical before and after`)
    check(before[k].bookings === after[k].bookings, `merchant ${k} bookings checksum identical before and after`)
    check(before[k].inventory === after[k].inventory, `merchant ${k} inventory checksum identical before and after`)
  }
  check(await stopServer(), 'server stopped')
} catch (err) {
  failures += 1
  console.log(`ERROR  ${String(err.message).slice(0, 160)}`)
} finally {
  await stopServer()
  if (fixturesReady) {
    try {
      const removed = await cleanupFixtures([idA, idB])
      console.log(`\nINFO  fixtures removed (${removed} row(s)); settings restored`)
    } catch (err) {
      failures += 1
      console.log(`ERROR  fixture cleanup failed: ${String(err.message).slice(0, 120)} (the next run will retry)`)
    }
  }
  await pool.end()
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
