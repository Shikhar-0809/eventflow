import { pool } from '../db/database.js'

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
      // Login runs before requireAuth, so the login handler puts the merchant in res.locals.
      const merchantId = res.locals.merchantId ?? req.merchantId
      if (!Number.isInteger(merchantId)) {
        // Never guess a merchant. Log the event type only, no request data.
        console.error(`trackUsage: no merchant for event ${eventType}; event not recorded`)
        return
      }

      const metadata = resolveMetadata(req, res, getMetadata)
      pool.query(
        'INSERT INTO event_log (merchant_id, event_type, metadata) VALUES ($1, $2, $3)',
        [merchantId, eventType, metadata ? JSON.stringify(metadata) : null],
      ).catch(() => {})
    } catch {
      // Logging must never break or delay the merchant-facing response.
    }
  })

  next()
}
