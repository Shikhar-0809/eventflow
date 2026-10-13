import 'dotenv/config'
import { pool } from '../db/database.js'

const VERIFY_NAME = 'VERIFY Prompt10 May Client'

try {
  const existing = await pool.query(
    'SELECT id FROM bookings WHERE client_name = $1',
    [VERIFY_NAME],
  )

  if (existing.rows[0]) {
    console.log(JSON.stringify({ action: 'skip', reason: 'already exists', id: existing.rows[0].id }, null, 2))
    await pool.end()
    process.exit(0)
  }

  const inserted = await pool.query(
    `INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
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
    ],
  )

  const months = await pool.query(
    `SELECT to_char(event_date::date, 'YYYY-MM') AS month, COUNT(*) AS bookings
     FROM bookings
     WHERE event_date >= '2026-01-01' AND event_date < '2026-07-01'
     GROUP BY month
     HAVING COUNT(*) > 0
     ORDER BY month`,
  )

  console.log(JSON.stringify({
    action: 'inserted',
    id: inserted.rows[0].id,
    monthsWithBookings: months.rows,
  }, null, 2))
  await pool.end()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
