import db from '../db/database.js'

const count = (type, bookingId) =>
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM event_log WHERE event_type = ? AND metadata = ?",
    )
    .get(type, JSON.stringify({ booking_id: bookingId })).n

const maxId = db.prepare('SELECT MAX(id) AS mid FROM event_log').get().mid

console.log(
  JSON.stringify({
    maxId,
    whatsapp_confirmation_sent_booking_1: count('whatsapp_confirmation_sent', 1),
    whatsapp_reminder_sent_booking_1: count('whatsapp_reminder_sent', 1),
  }),
)
