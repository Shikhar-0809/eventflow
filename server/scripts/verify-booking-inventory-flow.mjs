import {
  deleteBookingById,
  deleteInventoryItemById,
} from './lib/verifyDbCleanup.mjs'
import { resolveVerifyPassword } from './lib/verifyScriptAuth.mjs'

const BASE = 'http://127.0.0.1:3001/api'
const PASSWORD = resolveVerifyPassword()

const TEST_ITEM_NAME = 'ZZZ_TEST_Booking Inventory Flow'

const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  if (res.status !== 200) throw new Error(`Login failed: ${res.status}`)
  return (res.headers.getSetCookie?.() ?? []).map((r) => r.split(';')[0]).join('; ')
}

const authFetch = (cookie, path, options = {}) =>
  fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(options.headers || {}),
    },
  })

const json = async (res) => {
  const body = await res.json()
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`)
  return body
}

const cookie = await login()

let testItemId = null
let overBookingId = null
let okBookingId = null

try {
  const createdItem = await json(await authFetch(cookie, '/inventory', {
    method: 'POST',
    body: JSON.stringify({ name: TEST_ITEM_NAME, total_quantity: 50 }),
  }))
  testItemId = createdItem.id
  const tables = createdItem

  const testDate = '2026-08-01'
  console.log(`Using item "${tables.name}" (id=${tables.id}), date ${testDate}`)

  const avail = await json(await authFetch(cookie, '/inventory/check-availability', {
    method: 'POST',
    body: JSON.stringify({
      date: testDate,
      items: [{ item_id: tables.id, quantity: 0 }],
    }),
  }))
  const available = avail.availability?.[0]?.available
  console.log('Available for date:', available)

  const overRequest = available + 10
  const shortCheck = await json(await authFetch(cookie, '/inventory/check-availability', {
    method: 'POST',
    body: JSON.stringify({
      date: testDate,
      items: [{ item_id: tables.id, quantity: overRequest }],
    }),
  }))
  if (!shortCheck.shortfalls?.length) {
    throw new Error('Expected shortfall for over-request')
  }
  console.log('Shortfall check OK:', shortCheck.shortfalls[0])

  const overBooking = await json(await authFetch(cookie, '/bookings', {
    method: 'POST',
    body: JSON.stringify({
      client_name: 'Inventory Flow Test',
      phone: '9876543210',
      event_type: 'wedding',
      event_date: testDate,
      guest_count: 50,
      advance: 1000,
      total: 10000,
      inventory: [{ item_id: tables.id, quantity: overRequest }],
    }),
  }))
  overBookingId = overBooking.id
  console.log('Over-allocated booking created id:', overBooking.id)

  const detail = await json(await authFetch(cookie, `/bookings/${overBooking.id}`))
  if (!detail.inventory?.some((l) => l.item_id === tables.id && l.quantity === overRequest)) {
    throw new Error('Booking detail missing inventory line')
  }
  console.log('Booking detail inventory:', detail.inventory)

  const okQty = Math.max(1, Math.min(available, 5))
  const okBooking = await json(await authFetch(cookie, '/bookings', {
    method: 'POST',
    body: JSON.stringify({
      client_name: 'Inventory OK Test',
      phone: '9876543211',
      event_type: 'birthday',
      event_date: '2026-08-02',
      guest_count: 30,
      advance: 500,
      total: 5000,
      inventory: [{ item_id: tables.id, quantity: okQty }],
    }),
  }))
  okBookingId = okBooking.id
  console.log('Sufficient-inventory booking id:', okBooking.id)

  await json(await authFetch(cookie, `/bookings/${okBooking.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      client_name: 'Inventory OK Test',
      phone: '9876543211',
      event_type: 'birthday',
      event_date: '2026-08-02',
      guest_count: 30,
      advance: 500,
      total: 5000,
      inventory: [],
    }),
  }))
  const cleared = await json(await authFetch(cookie, `/bookings/${okBooking.id}`))
  if (cleared.inventory?.length) {
    throw new Error('Expected inventory cleared after PATCH with inventory: []')
  }
  console.log('Edit clear inventory OK — rows:', cleared.inventory?.length ?? 0)

  console.log('\nAll booking-inventory flow checks passed.')
} finally {
  await deleteBookingById(overBookingId)
  await deleteBookingById(okBookingId)
  await deleteInventoryItemById(testItemId)
}
