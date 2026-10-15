// Dev-only: keeps the last week of "My Activity" populated for a demo merchant, so the screen is not empty on a
// day when the older demo events have aged out of the 7-day window. seed() never runs in production.
// Re-runs at most once a day (it skips while a marked event from the last 24 hours exists), replaces only its own
// marked rows, and stores booking ids in metadata, never client names or phone numbers.
const MARKER = '"demo_recent":true'

const formatTimestamp = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

export const refreshRecentActivity = async (pool, merchantId) => {
  if (process.env.NODE_ENV === 'production') return { skipped: true, reason: 'production' }

  const { rows: fresh } = await pool.query(
    `SELECT 1 FROM event_log
     WHERE merchant_id = $1 AND metadata LIKE $2 AND created_at::timestamptz > NOW() - INTERVAL '1 day'
     LIMIT 1`,
    [merchantId, `%${MARKER}%`],
  )
  if (fresh.length > 0) return { skipped: true, reason: 'fresh' }

  const { rows: bookingRows } = await pool.query(
    `SELECT id FROM bookings WHERE merchant_id = $1 AND status != 'cancelled' ORDER BY id DESC LIMIT 6`,
    [merchantId],
  )
  if (bookingRows.length === 0) return { skipped: true, reason: 'no bookings' }
  const pick = (i) => bookingRows[i % bookingRows.length].id

  const now = new Date()
  const at = (daysAgo, hour, minute) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hour, minute, 0, 0)
    return d
  }
  const earlierToday = new Date(now.getTime() - 2 * 60 * 60 * 1000)

  const events = [
    { type: 'login', at: at(6, 9, 20) },
    { type: 'login', at: at(4, 18, 5) },
    { type: 'login', at: at(2, 8, 40) },
    { type: 'login', at: earlierToday },
    { type: 'booking_created', booking: pick(0), at: at(5, 11, 15) },
    { type: 'booking_created', booking: pick(1), at: at(3, 12, 30) },
    { type: 'booking_created', booking: pick(2), at: at(1, 16, 10) },
    { type: 'booking_viewed', booking: pick(0), at: at(4, 10, 5) },
    { type: 'booking_viewed', booking: pick(1), at: at(3, 13, 0) },
    { type: 'booking_viewed', booking: pick(3), at: at(2, 9, 30) },
    { type: 'booking_edited', booking: pick(1), at: at(2, 14, 20) },
    { type: 'whatsapp_confirmation_sent', booking: pick(0), at: at(5, 11, 40) },
    { type: 'whatsapp_confirmation_sent', booking: pick(2), at: at(1, 16, 30) },
    { type: 'whatsapp_reminder_sent', booking: pick(3), at: at(1, 10, 15) },
  ]

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM event_log WHERE merchant_id = $1 AND metadata LIKE $2', [merchantId, `%${MARKER}%`])
    for (const event of events) {
      const metadata = event.booking
        ? { booking_id: event.booking, demo_recent: true }
        : { demo_recent: true }
      await client.query(
        'INSERT INTO event_log (merchant_id, event_type, metadata, created_at) VALUES ($1, $2, $3, $4)',
        [merchantId, event.type, JSON.stringify(metadata), formatTimestamp(event.at)],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return { inserted: events.length }
}
