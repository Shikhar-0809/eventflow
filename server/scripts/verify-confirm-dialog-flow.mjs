import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'
import { deleteBookingById } from './lib/verifyDbCleanup.mjs'
import { authFetch, loginVerifySession, readJson } from './lib/verifyScriptAuth.mjs'

const CLIENT_NAME = 'ZZZ_TEST_Confirm Dialog Client'
const results = []
let testBookingId = null

const pass = (name, detail) => {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}: ${detail}`)
}
const fail = (name, detail) => {
  results.push({ ok: false, name, detail })
  console.log(`FAIL  ${name}: ${detail}`)
}

const addDays = (base, days) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const run = async () => {
  console.log('=== verify-confirm-dialog-flow.mjs ===\n')
  const { cookieHeader } = await loginVerifySession()

  try {
    const invRes = await readJson(await authFetch(cookieHeader, '/inventory'))
    if (invRes.status !== 200) {
      fail('login/inventory', `GET /inventory returned ${invRes.status}`)
      return
    }
    const item = invRes.body.find((row) => row.available > 0)
    if (item) {
      pass('find inventory item', `${item.name} available=${item.available}`)
    } else {
      fail('find inventory item', 'no item with available > 0')
      return
    }

    const bookingsRes = await readJson(await authFetch(cookieHeader, '/bookings'))
    if (bookingsRes.status !== 200) {
      fail('load bookings', `status ${bookingsRes.status}`)
      return
    }
    const bookedDates = new Set(
      bookingsRes.body.filter((b) => b.status !== 'cancelled').map((b) => b.event_date),
    )
    let freeDate = null
    for (let i = 1; i <= 30; i += 1) {
      const candidate = addDays(new Date(), i)
      if (!bookedDates.has(candidate)) {
        freeDate = candidate
        break
      }
    }
    if (freeDate) pass('find free date', freeDate)
    else {
      fail('find free date', 'no free date in next 30 days')
      return
    }

    const requested = item.available + 10
    const checkRes = await readJson(
      await authFetch(cookieHeader, '/inventory/check-availability', {
        method: 'POST',
        body: JSON.stringify({
          date: freeDate,
          items: [{ item_id: item.id, quantity: requested }],
        }),
      }),
    )
    const sf = checkRes.body.shortfalls?.[0]
    if (
      checkRes.status === 200 &&
      checkRes.body.sufficient === false &&
      sf?.item_id === item.id &&
      sf.requested === requested &&
      sf.available === item.available
    ) {
      pass(
        'shortfall check',
        `${sf.name}: need ${sf.requested}, only ${sf.available} available`,
      )
    } else {
      fail(
        'shortfall check',
        `expected sufficient=false with matching shortfall; got ${JSON.stringify(checkRes.body)}`,
      )
    }

    const createRes = await readJson(
      await authFetch(cookieHeader, '/bookings', {
        method: 'POST',
        body: JSON.stringify({
          client_name: CLIENT_NAME,
          phone: '9876543213',
          event_type: 'wedding',
          event_date: freeDate,
          guest_count: 50,
          advance: 1000,
          total: 10000,
          inventory: [{ item_id: item.id, quantity: requested }],
        }),
      }),
    )
    testBookingId = createRes.body?.id ?? null
    if (createRes.status === 201 && testBookingId) {
      pass('over-allocated POST /bookings', `201 id=${testBookingId}`)
    } else {
      fail(
        'over-allocated POST /bookings',
        `expected 201; got ${createRes.status} ${JSON.stringify(createRes.body)}`,
      )
      return
    }

    const detailRes = await readJson(await authFetch(cookieHeader, `/bookings/${testBookingId}`))
    const line = detailRes.body?.inventory?.find((row) => row.item_id === item.id)
    if (detailRes.status === 200 && line?.quantity === requested) {
      pass('booking inventory lines', `${line.name} qty=${line.quantity}`)
    } else {
      fail(
        'booking inventory lines',
        `expected qty ${requested}; got ${JSON.stringify(detailRes.body?.inventory)}`,
      )
    }

    const dbLines = (await pool.query(
      'SELECT item_id, quantity FROM booking_inventory WHERE booking_id = $1',
      [testBookingId],
    )).rows
    if (dbLines.some((row) => row.item_id === item.id && row.quantity === requested)) {
      pass('booking_inventory rows', JSON.stringify(dbLines))
    } else {
      fail('booking_inventory rows', `expected item ${item.id} qty ${requested}; got ${JSON.stringify(dbLines)}`)
    }
  } finally {
    await deleteBookingById(testBookingId)
    const leftover = (await pool.query(
      'SELECT id FROM bookings WHERE client_name = $1',
      [CLIENT_NAME],
    )).rows
    if (leftover.length === 0) pass('cleanup', 'test booking removed')
    else fail('cleanup', `leftover bookings: ${leftover.map((r) => r.id).join(', ')}`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nScript result: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length} checks)\n`)
  process.exit(failed.length ? 1 : 0)
}

run().catch(async (err) => {
  await deleteBookingById(testBookingId)
  console.error(err.message)
  process.exit(1)
})
