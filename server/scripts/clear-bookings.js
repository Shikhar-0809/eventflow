// Never for production (BUGS #103): refuses the production host outright, on top of --confirm-host and --merchant-id.
import './lib/refuseProductionDatabase.mjs'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { requireMerchantId } = await import('./lib/merchantArg.mjs')

// Clears the booking data of ONE merchant (--merchant-id=<n>). Sequences are shared by every merchant, so they are
// never reset here (restarting them would hand out ids that other merchants' rows already use).
const merchantId = await requireMerchantId(pool)

const TABLES = ['booking_inventory', 'change_log', 'booking_expenses', 'event_log', 'bookings']

async function run() {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const table of TABLES) {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE merchant_id = $1`, [merchantId])
      console.log(`Found ${rows[0].count} rows in ${table}`)
    }

    await client.query('DELETE FROM booking_inventory WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM change_log WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM booking_expenses WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM event_log WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM bookings WHERE merchant_id = $1', [merchantId])

    await client.query('COMMIT')
    console.log(`Done. All booking data cleared for merchant ${merchantId}.`)
    process.exit(0)
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback failures
    }
    console.error(err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
