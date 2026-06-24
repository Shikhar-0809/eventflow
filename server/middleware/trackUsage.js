import db from '../db/database.js'

const sanitizeMetadata = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const bookingId = Number(raw.booking_id)
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null
  return { booking_id: bookingId }
}

const resolveMetadata = (req, res, getMetadata) => {
  if (getMetadata) return sanitizeMetadata(getMetadata(req, res))
  if (res.locals.usageMetadata) return sanitizeMetadata(res.locals.usageMetadata)
  if (req.params?.id) return sanitizeMetadata({ booking_id: Number(req.params.id) })
  return null
}

export const trackUsage = (eventType, getMetadata) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return

    try {
      const metadata = resolveMetadata(req, res, getMetadata)
      db.prepare('INSERT INTO event_log (event_type, metadata) VALUES (?, ?)').run(
        eventType,
        metadata ? JSON.stringify(metadata) : null,
      )
    } catch {
      // Logging must never break or delay the merchant-facing response.
    }
  })

  next()
}
