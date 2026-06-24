import db from '../db/database.js'

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

const outsideJune = db
  .prepare(
    `SELECT id, client_name, event_date, phone, created_at
     FROM bookings
     WHERE event_date < '2026-06-01' OR event_date >= '2026-07-01'
     ORDER BY event_date, id`,
  )
  .all()

const nonSeed = db
  .prepare(
    `SELECT id, client_name, event_date, phone, created_at
     FROM bookings
     WHERE client_name NOT IN (${SEED_NAMES.map(() => '?').join(', ')})
     ORDER BY event_date, id`,
  )
  .all(...SEED_NAMES)

const deleteIds = nonSeed.map((r) => r.id)

const deleteChangeLog = db.prepare('DELETE FROM change_log WHERE booking_id = ?')
const deleteBooking = db.prepare('DELETE FROM bookings WHERE id = ?')

const tx = db.transaction((ids) => {
  for (const id of ids) {
    deleteChangeLog.run(id)
    deleteBooking.run(id)
  }
})

tx(deleteIds)

const remaining = db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n

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
