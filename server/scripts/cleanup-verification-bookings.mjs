// Never for production (BUGS #103): refuses the production host outright, on top of --confirm-host and --merchant-id.
import './lib/refuseProductionDatabase.mjs'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { requireMerchantId } = await import('./lib/merchantArg.mjs')

// Acts on ONE merchant only (--merchant-id=<n>), in addition to the --confirm-host guard.
const merchantId = await requireMerchantId(pool)

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
   WHERE merchant_id = $1 AND (event_date < '2026-06-01' OR event_date >= '2026-07-01')
   ORDER BY event_date, id`,
  [merchantId],
)

const seedPlaceholders = SEED_NAMES.map((_, i) => `$${i + 2}`).join(', ')
const { rows: nonSeed } = await pool.query(
  `SELECT id, client_name, event_date, phone, created_at
   FROM bookings
   WHERE merchant_id = $1 AND client_name NOT IN (${seedPlaceholders})
   ORDER BY event_date, id`,
  [merchantId, ...SEED_NAMES],
)

const deleteIds = nonSeed.map((r) => r.id)

if (deleteIds.length > 0) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const id of deleteIds) {
      await client.query('DELETE FROM change_log WHERE booking_id = $1 AND merchant_id = $2', [id, merchantId])
      await client.query('DELETE FROM bookings WHERE id = $1 AND merchant_id = $2', [id, merchantId])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

const { rows: remainingRows } = await pool.query('SELECT COUNT(*)::int AS n FROM bookings WHERE merchant_id = $1', [
  merchantId,
])
const remaining = remainingRows[0].n

console.log(
  JSON.stringify(
    {
      // Ids and dates only: client names and phone numbers must never be printed.
      outsideJuneListed: outsideJune.map(({ id, event_date }) => ({ id, event_date })),
      nonSeedDeleted: nonSeed.map(({ id, event_date }) => ({ id, event_date })),
      deletedCount: deleteIds.length,
      remainingBookings: remaining,
    },
    null,
    2,
  ),
)
