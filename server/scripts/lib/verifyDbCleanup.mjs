import 'dotenv/config'
import { pool } from '../../db/database.js'

// The verify scripts log in with the dev password, i.e. as the dev merchant, so their cleanup is scoped to it
// (found by name, never a hardcoded id). Deleting by id alone could otherwise touch another merchant's row.
let verifyMerchantId = null
export const getVerifyMerchantId = async () => {
  if (verifyMerchantId === null) {
    const { rows } = await pool.query("SELECT id FROM merchants WHERE business_name = 'Bala Ji Tent House'")
    if (!rows[0]) throw new Error('Dev merchant not found; run the dev server once to seed it.')
    verifyMerchantId = rows[0].id
  }
  return verifyMerchantId
}

export const deleteBookingById = async (bookingId) => {
  if (bookingId == null) return
  try {
    const merchantId = await getVerifyMerchantId()
    await pool.query('DELETE FROM booking_inventory WHERE booking_id = $1 AND merchant_id = $2', [bookingId, merchantId])
    await pool.query('DELETE FROM change_log WHERE booking_id = $1 AND merchant_id = $2', [bookingId, merchantId])
    await pool.query('DELETE FROM bookings WHERE id = $1 AND merchant_id = $2', [bookingId, merchantId])
  } catch (err) {
    console.error(err.message)
    throw err
  }
}

export const deleteInventoryItemById = async (itemId) => {
  if (itemId == null) return
  try {
    const merchantId = await getVerifyMerchantId()
    await pool.query('DELETE FROM booking_inventory WHERE item_id = $1 AND merchant_id = $2', [itemId, merchantId])
    await pool.query('DELETE FROM inventory_damage_log WHERE item_id = $1 AND merchant_id = $2', [itemId, merchantId])
    await pool.query('DELETE FROM inventory_items WHERE id = $1 AND merchant_id = $2', [itemId, merchantId])
  } catch (err) {
    console.error(err.message)
    throw err
  }
}

// Bulk deletes by name are scoped to one merchant: names are only unique per merchant.
export const deleteBookingsByClientNames = async (merchantId, names) => {
  if (!names.length) return 0
  try {
    const placeholders = names.map((_, index) => `$${index + 2}`).join(', ')
    const { rows } = await pool.query(
      `SELECT id FROM bookings WHERE merchant_id = $1 AND client_name IN (${placeholders})`,
      [merchantId, ...names],
    )
    for (const { id } of rows) await deleteBookingById(id)
    return rows.length
  } catch (err) {
    console.error(err.message)
    throw err
  }
}

export const deleteInventoryItemsByNamePatterns = async (merchantId, patterns) => {
  let removed = 0
  try {
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
  } catch (err) {
    console.error(err.message)
    throw err
  }
}
