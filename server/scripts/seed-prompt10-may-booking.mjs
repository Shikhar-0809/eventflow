import db from '../db/database.js'

const VERIFY_NAME = 'VERIFY Prompt10 May Client'

const existing = db
  .prepare('SELECT id FROM bookings WHERE client_name = ?')
  .get(VERIFY_NAME)

if (existing) {
  console.log(JSON.stringify({ action: 'skip', reason: 'already exists', id: existing.id }, null, 2))
  process.exit(0)
}

const result = db
  .prepare(
    `INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    VERIFY_NAME,
    '9000000010',
    'birthday',
    '2026-05-15',
    50,
    'Verification Hall, Mumbai',
    5000,
    40000,
    'confirmed',
    'Prompt 10 chart verification — delete after pass',
  )

const monthsWithBookings = db
  .prepare(
    `SELECT strftime('%Y-%m', event_date) AS month, COUNT(*) AS bookings
     FROM bookings
     WHERE event_date >= '2026-01-01' AND event_date < '2026-07-01'
     GROUP BY month
     HAVING bookings > 0
     ORDER BY month`,
  )
  .all()

console.log(
  JSON.stringify(
    {
      action: 'inserted',
      id: result.lastInsertRowid,
      monthsWithBookings,
    },
    null,
    2,
  ),
)
