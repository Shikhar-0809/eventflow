import 'dotenv/config'
import { pool } from '../db/database.js'

const count = async (type, bookingId) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS n FROM event_log WHERE event_type = $1 AND metadata = $2',
    [type, JSON.stringify({ booking_id: bookingId })],
  )
  return Number(rows[0].n)
}

try {
  const { rows } = await pool.query('SELECT MAX(id) AS mid FROM event_log')
  console.log(
    JSON.stringify({
      maxId: rows[0].mid,
      whatsapp_confirmation_sent_booking_1: await count('whatsapp_confirmation_sent', 1),
      whatsapp_reminder_sent_booking_1: await count('whatsapp_reminder_sent', 1),
    }),
  )
  await pool.end()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
