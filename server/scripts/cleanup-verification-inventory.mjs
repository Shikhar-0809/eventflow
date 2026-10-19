// Never for production (BUGS #103): refuses the production host outright, on top of --confirm-host and --merchant-id.
import './lib/refuseProductionDatabase.mjs'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { requireMerchantId } = await import('./lib/merchantArg.mjs')

// Acts on ONE merchant only (--merchant-id=<n>), in addition to the --confirm-host guard.
const merchantId = await requireMerchantId(pool)

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
  await pool.query('DELETE FROM booking_inventory WHERE booking_id = $1 AND merchant_id = $2', [bookingId, merchantId])
  await pool.query('DELETE FROM change_log WHERE booking_id = $1 AND merchant_id = $2', [bookingId, merchantId])
  await pool.query('DELETE FROM bookings WHERE id = $1 AND merchant_id = $2', [bookingId, merchantId])
}

const deleteInventoryItemById = async (itemId) => {
  if (itemId == null) return
  await pool.query('DELETE FROM booking_inventory WHERE item_id = $1 AND merchant_id = $2', [itemId, merchantId])
  await pool.query('DELETE FROM inventory_damage_log WHERE item_id = $1 AND merchant_id = $2', [itemId, merchantId])
  await pool.query('DELETE FROM inventory_items WHERE id = $1 AND merchant_id = $2', [itemId, merchantId])
}

const deleteBookingsByClientNames = async (names) => {
  if (!names.length) return 0
  const placeholders = names.map((_, i) => `$${i + 2}`).join(', ')
  const { rows } = await pool.query(
    `SELECT id FROM bookings WHERE merchant_id = $1 AND client_name IN (${placeholders})`,
    [merchantId, ...names],
  )
  for (const { id } of rows) await deleteBookingById(id)
  return rows.length
}

const deleteInventoryItemsByNamePatterns = async (patterns) => {
  let removed = 0
  for (const pattern of patterns) {
    const { rows } = await pool.query(
      'SELECT id FROM inventory_items WHERE merchant_id = $1 AND name LIKE $2',
      [merchantId, pattern],
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
