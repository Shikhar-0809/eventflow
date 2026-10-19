// Dev databases only (BUGS #103): --confirm-host=<dev db host> is required and the production host is refused.
import './lib/guardFirst.mjs'
import './lib/refuseProductionDatabase.mjs'
import { deleteBookingById, deleteInventoryItemById } from './lib/verifyDbCleanup.mjs'
import { resolveVerifyPassword, VERIFY_LOGIN_EMAIL } from './lib/verifyScriptAuth.mjs'

const PASSWORD = resolveVerifyPassword()

const BASE = 'http://127.0.0.1:3001/api'
const TEST_ITEM_NAME = 'ZZZ_TEST_Inventory Backend Verify'

const json = async (res) => {
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

const loginRes = await fetch(`${BASE}/auth/login`, { // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- verify script against the local dev API on 127.0.0.1
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: VERIFY_LOGIN_EMAIL, password: PASSWORD }),
})
if (loginRes.status !== 200) {
  throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`)
}
const cookieHeader = (loginRes.headers.getSetCookie?.() ?? [])
  .map((raw) => raw.split(';')[0])
  .join('; ')

const authFetch = (path, options = {}) =>
  fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(options.headers || {}),
    },
  })

let createdItemId = null
let createdBookingId = null

try {
  console.log('1. POST /inventory — add test item (200 total)')
  const created = await json(
    await authFetch('/inventory', {
      method: 'POST',
      body: JSON.stringify({ name: TEST_ITEM_NAME, total_quantity: 200 }),
    }),
  )
  createdItemId = created.id
  console.log('   created:', { id: created.id, usable: created.usable, available: created.available })
  if (created.usable !== 200 || created.available !== 200) {
    throw new Error('Expected usable=200, available=200 on new item')
  }

  console.log('2. PATCH /inventory/:id — update total to 250')
  const patched = await json(
    await authFetch(`/inventory/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ total_quantity: 250 }),
    }),
  )
  console.log('   patched:', { total_quantity: patched.total_quantity, usable: patched.usable })
  if (patched.total_quantity !== 250 || patched.usable !== 250) {
    throw new Error('Expected total=250, usable=250 after patch')
  }

  console.log('3. POST /inventory/:id/damage — mark 30 damaged')
  const damaged = await json(
    await authFetch(`/inventory/${created.id}/damage`, {
      method: 'POST',
      body: JSON.stringify({ change: 30, note: 'torn seats' }),
    }),
  )
  console.log('   damaged:', { damaged_quantity: damaged.damaged_quantity, usable: damaged.usable, available: damaged.available })
  if (damaged.damaged_quantity !== 30 || damaged.usable !== 220) {
    throw new Error('Expected damaged=30, usable=220')
  }

  console.log('4. POST /inventory/:id/damage — repair 10 (net 20 damaged)')
  const repaired = await json(
    await authFetch(`/inventory/${created.id}/damage`, {
      method: 'POST',
      body: JSON.stringify({ change: -10, note: 'repaired' }),
    }),
  )
  console.log('   repaired:', { damaged_quantity: repaired.damaged_quantity, usable: repaired.usable })
  if (repaired.damaged_quantity !== 20 || repaired.usable !== 230) {
    throw new Error('Expected damaged=20, usable=230 after repair')
  }

  const testDate = '2026-07-15'
  console.log(`5. POST /bookings with inventory on ${testDate} — commit 80 chairs`)
  const booking = await json(
    await authFetch('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        client_name: 'Inventory Test Client',
        phone: '9876543210',
        event_type: 'wedding',
        event_date: testDate,
        guest_count: 100,
        advance: 5000,
        total: 50000,
        inventory: [{ item_id: created.id, quantity: 80 }],
      }),
    }),
  )
  createdBookingId = booking.id
  console.log('   booking id:', booking.id)

  console.log('6. POST /inventory/check-availability — request 160 (should shortfall)')
  const check1 = await json(
    await authFetch('/inventory/check-availability', {
      method: 'POST',
      body: JSON.stringify({
        date: testDate,
        items: [{ item_id: created.id, quantity: 160 }],
      }),
    }),
  )
  console.log('   check1:', check1)
  if (check1.sufficient !== false || check1.shortfalls.length !== 1) {
    throw new Error('Expected insufficient with one shortfall')
  }
  const sf = check1.shortfalls[0]
  if (sf.requested !== 160 || sf.available !== 150) {
    throw new Error(`Expected shortfall requested=160 available=150, got ${JSON.stringify(sf)}`)
  }

  console.log('7. POST /inventory/check-availability — exclude booking, request 160 (should pass)')
  const check2 = await json(
    await authFetch('/inventory/check-availability', {
      method: 'POST',
      body: JSON.stringify({
        date: testDate,
        items: [{ item_id: created.id, quantity: 160 }],
        excludeBookingId: booking.id,
      }),
    }),
  )
  console.log('   check2:', check2)
  if (check2.sufficient !== true || check2.shortfalls.length !== 0) {
    throw new Error('Expected sufficient when excluding own booking')
  }

  console.log('8. GET /inventory — list includes computed fields')
  const list = await json(await authFetch('/inventory'))
  const item = list.find((row) => row.id === created.id)
  console.log('   list item:', { in_use_today: item.in_use_today, available: item.available })
  if (item.in_use_today !== 0) {
    console.log('   (in_use_today uses today\'s date — 0 expected unless test date is today)')
  }

  console.log('\nAll inventory backend checks passed.')
} finally {
  await deleteBookingById(createdBookingId)
  await deleteInventoryItemById(createdItemId)
}
