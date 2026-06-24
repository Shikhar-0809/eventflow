import db from '../db/database.js'

const items = db.prepare(
  'SELECT id, name, total_quantity, damaged_quantity FROM inventory_items ORDER BY name',
).all()

const bookingLines = db.prepare(`
  SELECT b.client_name, ii.name AS item_name, bi.quantity
  FROM booking_inventory bi
  INNER JOIN bookings b ON b.id = bi.booking_id
  INNER JOIN inventory_items ii ON ii.id = bi.item_id
  ORDER BY b.client_name, ii.name
`).all()

const damageLog = db.prepare('SELECT * FROM inventory_damage_log').all()

const poles = items.find((i) => i.name === 'Poles')

console.log(JSON.stringify({ items, bookingLines, damageLog, polesPresent: Boolean(poles) }, null, 2))
