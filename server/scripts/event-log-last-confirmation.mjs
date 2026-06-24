import db from '../db/database.js'

const row = db
  .prepare(
    "SELECT id, event_type, metadata, created_at FROM event_log WHERE id = (SELECT MAX(id) FROM event_log WHERE event_type = 'whatsapp_confirmation_sent' AND metadata = ?)",
  )
  .get(JSON.stringify({ booking_id: 1 }))

console.log(JSON.stringify(row, null, 2))
