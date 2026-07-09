import { pool } from '../db/database.js'

const SEED_NAMES = [
  'Ramesh Sharma',
  'Priya Patel',
  'Sunil Verma',
  'Anita Desai',
  'Vikram Singh',
  'Kavita Reddy',
  'Arjun Mehta',
  'Deepa Nair',
  'Rajesh Gupta',
  'Meera Joshi',
]

const { rows: outsideJune } = await pool.query(
  `SELECT id, client_name, event_date, phone, created_at
   FROM bookings
   WHERE event_date < '2026-06-01' OR event_date >= '2026-07-01'
   ORDER BY event_date, id`,
)

const seedPlaceholders = SEED_NAMES.map((_, i) => `$${i + 1}`).join(', ')
const { rows: nonSeed } = await pool.query(
  `SELECT id, client_name, event_date, phone, created_at
   FROM bookings
   WHERE client_name NOT IN (${seedPlaceholders})
   ORDER BY event_date, id`,
  SEED_NAMES,
)

const deleteIds = nonSeed.map((r) => r.id)

if (deleteIds.length > 0) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const id of deleteIds) {
      await client.query('DELETE FROM change_log WHERE booking_id = $1', [id])
      await client.query('DELETE FROM bookings WHERE id = $1', [id])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

const { rows: remainingRows } = await pool.query('SELECT COUNT(*)::int AS n FROM bookings')
const remaining = remainingRows[0].n

console.log(
  JSON.stringify(
    {
      outsideJuneListed: outsideJune,
      nonSeedDeleted: nonSeed,
      deletedCount: deleteIds.length,
      remainingBookings: remaining,
    },
    null,
    2,
  ),
)
