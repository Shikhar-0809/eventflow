// Booking pricing check (BUGS #062): the server computes every derived amount and rejects bad input.
//
//   npm run verify:pricing -- --confirm-host=<dev host>      (from server/)
//
// Dev databases only: it refuses the production host outright (no override flag) and needs --confirm-host.
// It boots its own API server on a spare port, so it always tests the current code. It creates two throwaway
// merchants (PRICING-FIXTURE-1 and -2, with their own items), drives POST /bookings and PATCH /bookings/:id over
// HTTP, and asserts what was STORED (read straight from the database), not only what was returned. Both merchants
// and everything they own are removed again at the end (and at the start of the next run if a run crashed).
// Fictional data only. Output: PASS/FAIL per check, never names or phones.
//
// Expected values are written out by hand below (qty x price, sums, max(0, subtotal - discount)); the script
// does not import the server's pricing code.
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawn } from 'node:child_process'
import jwt from 'jsonwebtoken'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { errorHandler } = await import('../middleware/errorHandler.js')

const PORT = Number(process.env.PRICING_PORT) || 3010
const BASE = `http://127.0.0.1:${PORT}/api`
const NAME_PREFIX = 'PRICING-FIXTURE'
const GHOST_ITEM = 2147483000
const ADVANCE_MESSAGE = 'Advance cannot exceed total.'
const INVALID_ITEMS = 'One or more inventory items are invalid.'
const POSTS_PER_WINDOW = 18 // the booking-create limiter allows 20 per minute per IP

let failures = 0
const check = (ok, name, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
const q = async (sql, params = []) => (await pool.query(sql, params)).rows

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

let postsInWindow = 0
const call = async (cookie, method, path, body) => {
  if (method === 'POST' && path === '/bookings') {
    if (postsInWindow >= POSTS_PER_WINDOW) {
      console.log('INFO  waiting 61 s for the booking-create rate limit window')
      await new Promise((r) => setTimeout(r, 61000))
      postsInWindow = 0
    }
    postsInWindow += 1
  }
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
  const [m1, m2] = await q(
    `INSERT INTO merchants (business_name, owner_name) VALUES ($1, 'x'), ($2, 'x') RETURNING id`,
    [`${NAME_PREFIX}-1`, `${NAME_PREFIX}-2`],
  )
  const mkItem = async (merchant, name, price) => (await q(
    `INSERT INTO inventory_items (merchant_id, name, total_quantity, damaged_quantity, unit_price)
     VALUES ($1, $2, 100000, 0, $3) RETURNING id`, [merchant, name, price]))[0].id
  const chair = await mkItem(m1.id, 'PRICING chair', 100)
  const table = await mkItem(m1.id, 'PRICING table', 250)
  const tent = await mkItem(m1.id, 'PRICING tent', 5000)
  const foreignItem = await mkItem(m2.id, 'PRICING foreign', 500)

  check(await startServer(), 'server boots on its own port')
  const cookie = cookieFor(m1.id)

  const body = (extra = {}) => ({
    client_name: 'PRICING client', phone: '9000000091', event_type: 'wedding', event_date: '2099-06-15',
    guest_count: 10, advance: 0, total: 0, ...extra,
  })
  const storedBooking = async (id) => (await q(
    'SELECT advance, total, subtotal, discount, grand_total FROM bookings WHERE id = $1 AND merchant_id = $2', [id, m1.id]))[0]
  const storedLines = async (id) => (await q(
    `SELECT item_id, quantity, unit_price, line_total FROM booking_inventory
     WHERE booking_id = $1 AND merchant_id = $2 ORDER BY item_id`, [id, m1.id]))
  const bookingCount = async () => (await q('SELECT COUNT(*)::int AS n FROM bookings WHERE merchant_id = $1', [m1.id]))[0].n
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const totalsOf = (b) => ({ advance: b.advance, total: b.total, subtotal: b.subtotal, discount: b.discount, grand_total: b.grand_total })
  const line = (item_id, quantity, unit_price, line_total) => ({ item_id, quantity, unit_price, line_total })

  // Create a booking that must succeed; returns its id.
  const create = async (name, payload, expectTotals, expectLines) => {
    const r = await call(cookie, 'POST', '/bookings', payload)
    if (r.status !== 201) { check(false, name, `status ${r.status} ${JSON.stringify(r.body?.error)}`); return null }
    const b = await storedBooking(r.body.id)
    const l = await storedLines(r.body.id)
    check(same(totalsOf(b), expectTotals) && same(l, expectLines), name,
      same(totalsOf(b), expectTotals) && same(l, expectLines) ? '' : `stored ${JSON.stringify(totalsOf(b))} ${JSON.stringify(l)}`)
    return r.body.id
  }
  // A request that must be rejected with 400 and a given message, and create nothing.
  const reject = async (name, method, path, payload, message) => {
    const before = await bookingCount()
    const r = await call(cookie, method, path, payload)
    const messageOk = message instanceof RegExp ? message.test(r.body?.error ?? '') : r.body?.error === message
    const ok = r.status === 400 && messageOk && await bookingCount() === before
    check(ok, name, ok ? '' : `got ${r.status} ${JSON.stringify(r.body?.error)}`)
    return r
  }

  console.log('\n-- create: the server computes the derived values (P1-P3, P6)')
  // P1: a consistent booking.
  const p1 = await create('P1 consistent: 2 chairs at 100, total 200, advance 50',
    body({ advance: 50, total: 200, subtotal: 200, discount: 0, grand_total: 200, inventory: [line(chair, 2, 100, 200)] }),
    { advance: 50, total: 200, subtotal: 200, discount: 0, grand_total: 200 }, [line(chair, 2, 100, 200)])
  // P2: inconsistent client numbers. The sent unit_price (override) is kept; everything derived is recomputed.
  await create('P2 junk client values (line_total 999999, subtotal 7, grand_total 3, total 5): stored values recomputed, sent unit_price 1 kept',
    body({ total: 5, subtotal: 7, discount: 0, grand_total: 3, inventory: [line(chair, 2, 1, 999999)] }),
    { advance: 0, total: 2, subtotal: 2, discount: 0, grand_total: 2 }, [line(chair, 2, 1, 2)])
  // P3: omitted prices use the item's stored rate; the client's total is ignored.
  await create('P3 omitted unit_price uses the stored rate (chair 100, table 250); client total 5000 ignored',
    body({ total: 5000, inventory: [{ item_id: chair, quantity: 2 }, { item_id: table, quantity: 1 }] }),
    { advance: 0, total: 450, subtotal: 450, discount: 0, grand_total: 450 }, [line(chair, 2, 100, 200), line(table, 1, 250, 250)])
  // Override + discount are kept: table sold at 200 instead of 250, discount 100.
  await create('override + discount kept: 3 tables at 200 (stored rate 250), 2 chairs at stored rate, discount 100',
    body({ total: 1, discount: 100, inventory: [line(table, 3, 200), { item_id: chair, quantity: 2 }] }),
    { advance: 0, total: 700, subtotal: 800, discount: 100, grand_total: 700 }, [line(chair, 2, 100, 200), line(table, 3, 200, 600)])
  // Sent override of 0 (a free item) is kept, not replaced by the rate.
  await create('an explicit unit_price of 0 is kept (not replaced by the stored rate)',
    body({ inventory: [line(chair, 4, 0)] }),
    { advance: 0, total: 0, subtotal: 0, discount: 0, grand_total: 0 }, [line(chair, 4, 0, 0)])
  // P6: a discount larger than the subtotal clamps the grand total at 0.
  await create('P6 discount 9000000 over a 200 subtotal: grand_total and total clamp to 0',
    body({ discount: 9000000, inventory: [line(chair, 2, 100)] }),
    { advance: 0, total: 0, subtotal: 200, discount: 9000000, grand_total: 0 }, [line(chair, 2, 100, 200)])
  // P8: huge client-sent derived values are ignored, not stored and not an error.
  await create('P8 client line_total/subtotal 2000000000 and grand_total are ignored when lines exist',
    body({ total: 1, subtotal: 2000000000, grand_total: 2000000000, inventory: [line(chair, 1, 1, 2000000000)] }),
    { advance: 0, total: 1, subtotal: 1, discount: 0, grand_total: 1 }, [line(chair, 1, 1, 1)])

  console.log('\n-- create: zero-line bookings keep the typed total (P5)')
  await create('P5 no lines: typed total 123456 kept, grand_total = total (sent grand_total 7 ignored), subtotal as sent',
    body({ total: 123456, subtotal: 123456, grand_total: 7 }),
    { advance: 0, total: 123456, subtotal: 123456, discount: 0, grand_total: 123456 }, [])
  await create('no lines, subtotal/discount omitted: stored as 0, total kept',
    body({ total: 900 }),
    { advance: 0, total: 900, subtotal: 0, discount: 0, grand_total: 900 }, [])
  await create('no lines, total 0, advance 50 is allowed (an unpriced booking, same as the client rule)',
    body({ advance: 50, total: 0 }),
    { advance: 50, total: 0, subtotal: 0, discount: 0, grand_total: 0 }, [])
  await create('advance equal to total is allowed',
    body({ advance: 200, inventory: [line(chair, 2, 100)] }),
    { advance: 200, total: 200, subtotal: 200, discount: 0, grand_total: 200 }, [line(chair, 2, 100, 200)])

  console.log('\n-- create: rejected with 400 and a readable message, nothing stored (P4, P7, P9-P12)')
  await reject('P4 advance 500 > typed total 100 (no lines)', 'POST', '/bookings', body({ advance: 500, total: 100 }), ADVANCE_MESSAGE)
  await reject('P4b advance 500 > total 100 with a grand_total 100 sent', 'POST', '/bookings', body({ advance: 500, total: 100, grand_total: 100 }), ADVANCE_MESSAGE)
  await reject('P4c advance 500 > COMPUTED total 200 (client claims total 9999)', 'POST', '/bookings',
    body({ advance: 500, total: 9999, inventory: [line(chair, 2, 100)] }), ADVANCE_MESSAGE)
  await reject('advance above the total after the discount (200 - 150 = 50 < advance 100)', 'POST', '/bookings',
    body({ advance: 100, discount: 150, inventory: [line(chair, 2, 100)] }), ADVANCE_MESSAGE)
  const p7 = await reject('P7 unit_price 3,000,000,000 (over int4) is a 400, not a 500', 'POST', '/bookings',
    body({ inventory: [line(chair, 1, 3000000000)] }), /./)
  check(!/out of range for type integer/.test(JSON.stringify(p7.body)), 'P7 response does not contain the Postgres error text')
  await reject('unit_price above 10,000,000 is rejected', 'POST', '/bookings', body({ inventory: [line(chair, 1, 10000001)] }), /./)
  await reject('computed line total over 10,000,000 (10000 tents at 5000 = 50,000,000)', 'POST', '/bookings',
    body({ inventory: [{ item_id: tent, quantity: 10000 }] }), /cannot be more than/)
  await reject('computed subtotal over 10,000,000 (two lines of 6,000,000)', 'POST', '/bookings',
    body({ inventory: [line(chair, 6, 1000000), line(table, 6, 1000000)] }), /Subtotal cannot be more than/)
  await reject('P9 negative unit_price', 'POST', '/bookings', body({ inventory: [line(chair, 1, -5)] }), /./)
  await reject('P10 negative total', 'POST', '/bookings', body({ total: -1 }), /./)
  await reject('P11 non-integer unit_price', 'POST', '/bookings', body({ inventory: [line(chair, 1, 99.5)] }), /./)
  await reject('P12 the same item on two lines', 'POST', '/bookings',
    body({ inventory: [line(chair, 1, 5), line(chair, 1, 5)] }), /listed more than once/)
  await reject('another merchant\'s item on a line', 'POST', '/bookings', body({ inventory: [line(foreignItem, 1, 5)] }), INVALID_ITEMS)
  await reject('a nonexistent item on a line (same answer as a foreign item)', 'POST', '/bookings', body({ inventory: [line(GHOST_ITEM, 1, 5)] }), INVALID_ITEMS)

  console.log('\n-- edit (PATCH)')
  check(p1 !== null, 'PATCH target created')
  // P1 edited with junk derived values: recomputed.
  const e1 = await call(cookie, 'PATCH', `/bookings/${p1}`,
    body({ advance: 0, total: 1, subtotal: 999, grand_total: 1, inventory: [line(chair, 3, 100, 777), line(table, 1, 250, 1)] }))
  const e1b = await storedBooking(p1)
  const e1l = await storedLines(p1)
  check(e1.status === 200 && same(totalsOf(e1b), { advance: 0, total: 550, subtotal: 550, discount: 0, grand_total: 550 })
    && same(e1l, [line(chair, 3, 100, 300), line(table, 1, 250, 250)]),
  'PATCH with junk derived values stores the recomputed ones', e1.status === 200 ? '' : `status ${e1.status}`)

  // Rate change: a PATCH without `inventory` keeps the lines and their stored prices; one that sends a line without a price takes the new rate.
  await pool.query('UPDATE inventory_items SET unit_price = 999 WHERE id = $1 AND merchant_id = $2', [chair, m1.id])
  const e2 = await call(cookie, 'PATCH', `/bookings/${p1}`, body({ advance: 10, total: 123 }))
  const e2b = await storedBooking(p1)
  const e2l = await storedLines(p1)
  check(e2.status === 200 && same(e2l, [line(chair, 3, 100, 300), line(table, 1, 250, 250)])
    && same(totalsOf(e2b), { advance: 10, total: 550, subtotal: 550, discount: 0, grand_total: 550 }),
  'PATCH without inventory keeps the stored lines and prices, and the totals follow them (client total 123 ignored)')
  const e3 = await call(cookie, 'PATCH', `/bookings/${p1}`, body({ inventory: [{ item_id: chair, quantity: 1 }] }))
  const e3l = await storedLines(p1)
  check(e3.status === 200 && same(e3l, [line(chair, 1, 999, 999)]), 'PATCH with a line that sends no unit_price uses the rate as it is now (999)')
  await pool.query('UPDATE inventory_items SET unit_price = 100 WHERE id = $1 AND merchant_id = $2', [chair, m1.id])

  // PATCH to zero lines keeps the typed total.
  const e4 = await call(cookie, 'PATCH', `/bookings/${p1}`, body({ total: 4000, inventory: [] }))
  check(e4.status === 200 && same(await storedLines(p1), []) && same(totalsOf(await storedBooking(p1)), { advance: 0, total: 4000, subtotal: 0, discount: 0, grand_total: 4000 }),
    'PATCH to zero lines removes the lines and keeps the typed total (grand_total = total)')

  // Rejected edits leave the stored booking untouched.
  const beforeReject = JSON.stringify([await storedBooking(p1), await storedLines(p1)])
  const r1 = await call(cookie, 'PATCH', `/bookings/${p1}`, body({ advance: 99999, total: 4000 }))
  const r2 = await call(cookie, 'PATCH', `/bookings/${p1}`, body({ inventory: [line(chair, 1, 5), line(chair, 2, 5)] }))
  const r3 = await call(cookie, 'PATCH', `/bookings/${p1}`, body({ inventory: [line(foreignItem, 1, 5)] }))
  check(r1.status === 400 && r1.body?.error === ADVANCE_MESSAGE && r2.status === 400 && r3.status === 400 && r3.body?.error === INVALID_ITEMS
    && beforeReject === JSON.stringify([await storedBooking(p1), await storedLines(p1)]),
  'rejected PATCHes (advance over total, duplicate item, foreign item) return 400 and change nothing')

  console.log('\n-- error handler')
  const respond = (nodeEnv) => {
    const saved = process.env.NODE_ENV
    const origError = console.error
    console.error = () => {}
    process.env.NODE_ENV = nodeEnv
    let out = null
    try {
      errorHandler(new Error('value "3000000000" is out of range for type integer'), {}, { status: () => ({ json: (j) => { out = j } }) }, () => {})
    } finally {
      console.error = origError
      if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved
    }
    return out?.error
  }
  check(respond('production') === 'Something went wrong. Please try again.', 'in production an unexpected error returns the generic message, not the Postgres text')

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
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
