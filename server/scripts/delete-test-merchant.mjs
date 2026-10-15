// Deletes ONE throwaway merchant and everything attached to it (dev databases only).
//   node scripts/delete-test-merchant.mjs --confirm-host=<host> --merchant-id=<n> --expect-name="<business name>"
// --expect-name must equal the merchant's business_name, so a mistyped id cannot delete the wrong tenant.
// Merchant 1 and the seeded demo merchants are refused. Prints table names and row counts only, never row data.
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'
import './lib/refuseProductionDatabase.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { requireMerchantId } = await import('./lib/merchantArg.mjs')
const { DEMO_MERCHANTS, PRIMARY_MERCHANT_ID } = await import('../db/seedMerchants.js')

const merchantId = await requireMerchantId(pool)

const expectArg = process.argv.find((a) => a.startsWith('--expect-name='))
const expectedName = expectArg ? expectArg.slice('--expect-name='.length) : null
if (!expectedName) {
  console.error('Refusing to run: pass --expect-name="<the merchant\'s business name>".')
  process.exit(1)
}

const { rows } = await pool.query('SELECT business_name FROM merchants WHERE id = $1', [merchantId])
if (rows[0].business_name !== expectedName) {
  console.error('Refusing to run: --expect-name does not match this merchant.')
  process.exit(1)
}
if (merchantId === PRIMARY_MERCHANT_ID || DEMO_MERCHANTS.some((m) => m.business_name === expectedName)) {
  console.error('Refusing to run: this is merchant 1 or a seeded demo merchant.')
  process.exit(1)
}

// Children before parents, so the composite foreign keys are never violated.
const TABLES = [
  'booking_inventory',
  'booking_expenses',
  'change_log',
  'inventory_damage_log',
  'event_log',
  'merchant_settings',
  'bookings',
  'inventory_items',
]

const client = await pool.connect()
try {
  await client.query('BEGIN')
  for (const table of TABLES) {
    const { rowCount } = await client.query(`DELETE FROM ${table} WHERE merchant_id = $1`, [merchantId])
    console.log(`  ${table}: ${rowCount} row(s) deleted`)
  }
  await client.query('DELETE FROM merchants WHERE id = $1', [merchantId])
  await client.query('COMMIT')
  console.log(`Deleted merchant ${merchantId} (${expectedName})`)
} catch (err) {
  await client.query('ROLLBACK')
  console.error(`Failed, rolled back: ${err.message}`)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
