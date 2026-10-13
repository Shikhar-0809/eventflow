import 'dotenv/config'
import { pool } from '../db/database.js'

try {
  const items = (await pool.query(
    'SELECT id, name, total_quantity, damaged_quantity FROM inventory_items ORDER BY name',
  )).rows

  const bookingLines = (await pool.query(`
    SELECT b.client_name, ii.name AS item_name, bi.quantity
    FROM booking_inventory bi
    INNER JOIN bookings b ON b.id = bi.booking_id
    INNER JOIN inventory_items ii ON ii.id = bi.item_id
    ORDER BY b.client_name, ii.name
  `)).rows

  const damageLog = (await pool.query('SELECT * FROM inventory_damage_log')).rows
  const poles = items.find((item) => item.name === 'Poles')

  console.log(JSON.stringify({ items, bookingLines, damageLog, polesPresent: Boolean(poles) }, null, 2))
  await pool.end()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
