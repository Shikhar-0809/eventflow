import 'dotenv/config'
import { pool } from '../../db/database.js'

export const deleteBookingById = async (bookingId) => {
  if (bookingId == null) return
  try {
    await pool.query('DELETE FROM booking_inventory WHERE booking_id = $1', [bookingId])
    await pool.query('DELETE FROM change_log WHERE booking_id = $1', [bookingId])
    await pool.query('DELETE FROM bookings WHERE id = $1', [bookingId])
  } catch (err) {
    console.error(err.message)
    throw err
  }
}

export const deleteInventoryItemById = async (itemId) => {
  if (itemId == null) return
  try {
    await pool.query('DELETE FROM booking_inventory WHERE item_id = $1', [itemId])
    await pool.query('DELETE FROM inventory_damage_log WHERE item_id = $1', [itemId])
    await pool.query('DELETE FROM inventory_items WHERE id = $1', [itemId])
  } catch (err) {
    console.error(err.message)
    throw err
  }
}

export const deleteBookingsByClientNames = async (names) => {
  if (!names.length) return 0
  try {
    const placeholders = names.map((_, index) => `$${index + 1}`).join(', ')
    const { rows } = await pool.query(
      `SELECT id FROM bookings WHERE client_name IN (${placeholders})`,
      names,
    )
    for (const { id } of rows) await deleteBookingById(id)
    return rows.length
  } catch (err) {
    console.error(err.message)
    throw err
  }
}

export const deleteInventoryItemsByNamePatterns = async (patterns) => {
  let removed = 0
  try {
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
  } catch (err) {
    console.error(err.message)
    throw err
  }
}
