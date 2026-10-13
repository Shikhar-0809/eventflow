import 'dotenv/config'
import { pool } from '../db/database.js'

try {
  const { rows } = await pool.query(
    `SELECT id, event_type, metadata, created_at
     FROM event_log
     WHERE id = (
       SELECT MAX(id) FROM event_log
       WHERE event_type = 'whatsapp_confirmation_sent' AND metadata = $1
     )`,
    [JSON.stringify({ booking_id: 1 })],
  )
  console.log(JSON.stringify(rows[0] ?? null, null, 2))
  await pool.end()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
