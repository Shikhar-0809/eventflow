import dotenv from 'dotenv'
import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

if (process.env.CONFIRM_CLEAR !== 'yes-delete-all-bookings') {
  console.log(
    'Safety check failed. Set CONFIRM_CLEAR=yes-delete-all-bookings to run this script.',
  )
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const TABLES = ['booking_inventory', 'change_log', 'event_log', 'bookings']

async function run() {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const table of TABLES) {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`)
      console.log(`Found ${rows[0].count} rows in ${table}`)
    }

    await client.query('DELETE FROM booking_inventory')
    await client.query('DELETE FROM change_log')
    await client.query('DELETE FROM event_log')
    await client.query('DELETE FROM bookings')
    await client.query('ALTER SEQUENCE bookings_id_seq RESTART WITH 1')
    await client.query('ALTER SEQUENCE booking_inventory_id_seq RESTART WITH 1')
    await client.query('ALTER SEQUENCE change_log_id_seq RESTART WITH 1')

    await client.query('COMMIT')
    console.log('Done. All booking data cleared.')
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
