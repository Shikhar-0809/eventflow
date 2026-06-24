import db from '../../db/database.js'

export const deleteBookingById = (bookingId) => {
  if (bookingId == null) return
  db.prepare('DELETE FROM booking_inventory WHERE booking_id = ?').run(bookingId)
  db.prepare('DELETE FROM change_log WHERE booking_id = ?').run(bookingId)
  db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId)
}

export const deleteInventoryItemById = (itemId) => {
  if (itemId == null) return
  db.prepare('DELETE FROM booking_inventory WHERE item_id = ?').run(itemId)
  db.prepare('DELETE FROM inventory_damage_log WHERE item_id = ?').run(itemId)
  db.prepare('DELETE FROM inventory_items WHERE id = ?').run(itemId)
}

export const deleteBookingsByClientNames = (names) => {
  if (!names.length) return 0
  const placeholders = names.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT id FROM bookings WHERE client_name IN (${placeholders})`)
    .all(...names)
  for (const { id } of rows) deleteBookingById(id)
  return rows.length
}

export const deleteInventoryItemsByNamePatterns = (patterns) => {
  let removed = 0
  for (const pattern of patterns) {
    const rows = db.prepare('SELECT id FROM inventory_items WHERE name LIKE ?').all(pattern)
    for (const { id } of rows) {
      deleteInventoryItemById(id)
      removed += 1
    }
  }
  return removed
}
