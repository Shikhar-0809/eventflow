import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')

const run = async () => {
  const summary = {}

  const bookings = await pool.query(
    `DELETE FROM bookings b
     USING bookings b2
     WHERE b.client_name = b2.client_name
       AND b.event_date = b2.event_date
       AND b.id > b2.id`,
  )
  summary.bookings = bookings.rowCount

  await pool.query(
    `DELETE FROM booking_inventory bi
     WHERE EXISTS (
       SELECT 1 FROM inventory_items i
       INNER JOIN (
         SELECT name, MIN(id) AS keep_id FROM inventory_items GROUP BY name
       ) k ON i.name = k.name AND i.id > k.keep_id
       WHERE bi.item_id = i.id
     )`,
  )

  await pool.query(
    `DELETE FROM inventory_damage_log dl
     WHERE EXISTS (
       SELECT 1 FROM inventory_items i
       INNER JOIN (
         SELECT name, MIN(id) AS keep_id FROM inventory_items GROUP BY name
       ) k ON i.name = k.name AND i.id > k.keep_id
       WHERE dl.item_id = i.id
     )`,
  )

  const inventoryItems = await pool.query(
    `DELETE FROM inventory_items i
     USING inventory_items i2
     WHERE i.name = i2.name AND i.id > i2.id`,
  )
  summary.inventory_items = inventoryItems.rowCount

  const bookingInventory = await pool.query(
    `DELETE FROM booking_inventory
     WHERE booking_id NOT IN (SELECT id FROM bookings)`,
  )
  summary.booking_inventory = bookingInventory.rowCount

  const damageLog = await pool.query(
    `DELETE FROM inventory_damage_log
     WHERE item_id NOT IN (SELECT id FROM inventory_items)`,
  )
  summary.inventory_damage_log = damageLog.rowCount

  console.log('Neon duplicate cleanup summary:')
  console.log(`  bookings:              ${summary.bookings} deleted`)
  console.log(`  inventory_items:       ${summary.inventory_items} deleted`)
  console.log(`  booking_inventory:     ${summary.booking_inventory} deleted`)
  console.log(`  inventory_damage_log:  ${summary.inventory_damage_log} deleted`)

  await pool.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
