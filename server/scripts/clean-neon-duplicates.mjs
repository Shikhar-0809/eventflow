// Never for production (BUGS #103): refuses the production host outright, on top of --confirm-host and --merchant-id.
import './lib/refuseProductionDatabase.mjs'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { requireMerchantId } = await import('./lib/merchantArg.mjs')

// Removes duplicate bookings / inventory items of ONE merchant (--merchant-id=<n>). Names are only unique
// per merchant, so every grouping and self-join below is partitioned by merchant_id.
const merchantId = await requireMerchantId(pool)

const run = async () => {
  const summary = {}

  const bookings = await pool.query(
    `DELETE FROM bookings b
     USING bookings b2
     WHERE b.merchant_id = $1
       AND b2.merchant_id = b.merchant_id
       AND b.client_name = b2.client_name
       AND b.event_date = b2.event_date
       AND b.id > b2.id`,
    [merchantId],
  )
  summary.bookings = bookings.rowCount

  await pool.query(
    `DELETE FROM booking_inventory bi
     WHERE bi.merchant_id = $1
       AND EXISTS (
       SELECT 1 FROM inventory_items i
       INNER JOIN (
         SELECT name, MIN(id) AS keep_id FROM inventory_items WHERE merchant_id = $1 GROUP BY name
       ) k ON i.name = k.name AND i.id > k.keep_id
       WHERE i.merchant_id = $1 AND bi.item_id = i.id
     )`,
    [merchantId],
  )

  await pool.query(
    `DELETE FROM inventory_damage_log dl
     WHERE dl.merchant_id = $1
       AND EXISTS (
       SELECT 1 FROM inventory_items i
       INNER JOIN (
         SELECT name, MIN(id) AS keep_id FROM inventory_items WHERE merchant_id = $1 GROUP BY name
       ) k ON i.name = k.name AND i.id > k.keep_id
       WHERE i.merchant_id = $1 AND dl.item_id = i.id
     )`,
    [merchantId],
  )

  const inventoryItems = await pool.query(
    `DELETE FROM inventory_items i
     USING inventory_items i2
     WHERE i.merchant_id = $1
       AND i2.merchant_id = i.merchant_id
       AND i.name = i2.name AND i.id > i2.id`,
    [merchantId],
  )
  summary.inventory_items = inventoryItems.rowCount

  const bookingInventory = await pool.query(
    `DELETE FROM booking_inventory
     WHERE merchant_id = $1
       AND booking_id NOT IN (SELECT id FROM bookings WHERE merchant_id = $1)`,
    [merchantId],
  )
  summary.booking_inventory = bookingInventory.rowCount

  const damageLog = await pool.query(
    `DELETE FROM inventory_damage_log
     WHERE merchant_id = $1
       AND item_id NOT IN (SELECT id FROM inventory_items WHERE merchant_id = $1)`,
    [merchantId],
  )
  summary.inventory_damage_log = damageLog.rowCount

  console.log(`Neon duplicate cleanup summary (merchant ${merchantId}):`)
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
