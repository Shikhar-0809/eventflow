import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')

const TEST_BOOKING_NAMES = [
  'Inventory Test Client',
  'Inventory Flow Test',
  'Inventory OK Test',
]

const TEST_INVENTORY_PATTERNS = [
  'Verify Plastic Chairs%',
  'Round Tables UI Test',
  'ZZZ_TEST_%',
]

const deleteBookingById = async (bookingId) => {
  if (bookingId == null) return
  await pool.query('DELETE FROM booking_inventory WHERE booking_id = $1', [bookingId])
  await pool.query('DELETE FROM change_log WHERE booking_id = $1', [bookingId])
  await pool.query('DELETE FROM bookings WHERE id = $1', [bookingId])
}

const deleteInventoryItemById = async (itemId) => {
  if (itemId == null) return
  await pool.query('DELETE FROM booking_inventory WHERE item_id = $1', [itemId])
  await pool.query('DELETE FROM inventory_damage_log WHERE item_id = $1', [itemId])
  await pool.query('DELETE FROM inventory_items WHERE id = $1', [itemId])
}

const deleteBookingsByClientNames = async (names) => {
  if (!names.length) return 0
  const placeholders = names.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await pool.query(
    `SELECT id FROM bookings WHERE client_name IN (${placeholders})`,
    names,
  )
  for (const { id } of rows) await deleteBookingById(id)
  return rows.length
}

const deleteInventoryItemsByNamePatterns = async (patterns) => {
  let removed = 0
  for (const pattern of patterns) {
    const { rows } = await pool.query(
      'SELECT id FROM inventory_items WHERE name LIKE $1',
      [pattern],
    )
    for (const { id } of rows) {
      await deleteInventoryItemById(id)
      removed += 1
    }
  }
  return removed
}

const bookingsRemoved = await deleteBookingsByClientNames(TEST_BOOKING_NAMES)
const itemsRemoved = await deleteInventoryItemsByNamePatterns(TEST_INVENTORY_PATTERNS)

console.log(JSON.stringify({ bookingsRemoved, itemsRemoved }, null, 2))
