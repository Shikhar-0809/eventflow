import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireAdminKey } from '../middleware/requireAdminKey.js'
import { validate } from '../middleware/validate.js'
import { parseId } from '../utils/ids.js'
import { MERCHANT_TZ, formatDayMonth, merchantNow, weekRange } from '../services/merchantTime.js'

const router = Router()

const clientActionSchema = z.object({
  event_type: z.enum(['whatsapp_confirmation_sent', 'whatsapp_reminder_sent']),
  booking_id: z.number().int().positive(),
})

// The week windows are the merchant's (Asia/Kolkata) Monday-Sunday weeks (services/merchantTime.js, BUGS #100). event_log.created_at
// is a timestamp, so the window is a pair of UTC instants (the IST midnights that bound the week) and "days active" buckets
// the timestamps into IST days with AT TIME ZONE; neither depends on the server or database time zone.
const getWeekWindow = (weekOffset = 0) => {
  const { startDate, endDate, startInstant, endInstantExclusive } = weekRange(merchantNow(), weekOffset)
  return {
    weekStart: startInstant.toISOString(),
    weekEndExclusive: endInstantExclusive.toISOString(),
    weekLabel: `${formatDayMonth(startDate)} – ${formatDayMonth(endDate)} ${endDate.slice(0, 4)}`,
  }
}

router.use(requireAuth)

router.post('/log-client-action', validate(clientActionSchema), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const { event_type, booking_id } = req.body

    const bookingKey = parseId(booking_id)
    const { rows: bookingRows } = bookingKey === null
      ? { rows: [] }
      : await pool.query('SELECT id FROM bookings WHERE id = $1 AND merchant_id = $2', [bookingKey, merchantId])
    if (!bookingRows[0]) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    await pool.query(
      'INSERT INTO event_log (merchant_id, event_type, metadata) VALUES ($1, $2, $3)',
      [merchantId, event_type, JSON.stringify({ booking_id })],
    )

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

router.get('/me', async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const weekOffset = Math.max(0, Number.parseInt(req.query.weekOffset, 10) || 0)
    const { weekStart, weekEndExclusive, weekLabel } = getWeekWindow(weekOffset)

    const weekScoped = (eventType) => pool.query(
      `SELECT COUNT(*)::int AS count FROM event_log
       WHERE merchant_id = $1
       AND event_type = $2
       AND created_at::timestamptz >= $3::timestamptz
       AND created_at::timestamptz < $4::timestamptz`,
      [merchantId, eventType, weekStart, weekEndExclusive],
    )

    const [
      { rows: loginRows },
      { rows: bookingsRows },
      { rows: editedRows },
      { rows: viewedRows },
      { rows: changeRows },
      { rows: whatsappRows },
      { rows: daysActiveRows },
      { rows: lastActiveRows },
    ] = await Promise.all([
      weekScoped('login'),
      weekScoped('booking_created'),
      weekScoped('booking_edited'),
      weekScoped('booking_viewed'),
      weekScoped('change_logged'),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM event_log
         WHERE merchant_id = $1
         AND event_type IN ('whatsapp_confirmation_sent', 'whatsapp_reminder_sent')
         AND created_at::timestamptz >= $2::timestamptz
         AND created_at::timestamptz < $3::timestamptz`,
        [merchantId, weekStart, weekEndExclusive],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT (created_at::timestamptz AT TIME ZONE $4::text)::date)::int AS count
         FROM event_log
         WHERE merchant_id = $1
         AND created_at::timestamptz >= $2::timestamptz
         AND created_at::timestamptz < $3::timestamptz`,
        [merchantId, weekStart, weekEndExclusive, MERCHANT_TZ],
      ),
      pool.query('SELECT MAX(created_at::timestamptz) AS last_active FROM event_log WHERE merchant_id = $1', [
        merchantId,
      ]),
    ])

    const lastActiveRaw = lastActiveRows[0].last_active
    const lastActiveAt = lastActiveRaw != null ? new Date(lastActiveRaw).toISOString() : null

    res.status(200).json({
      loginsThisWeek: loginRows[0].count,
      bookingsThisWeek: bookingsRows[0].count,
      bookingsEditedThisWeek: editedRows[0].count,
      bookingsViewedThisWeek: viewedRows[0].count,
      changeNotesLoggedThisWeek: changeRows[0].count,
      whatsappMessagesSentThisWeek: whatsappRows[0].count,
      daysActiveThisWeek: daysActiveRows[0].count,
      lastActiveAt,
      weekLabel,
      weekOffset,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/admin', requireAdminKey, async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 200))
    const offset = (page - 1) * limit

    // Cross-merchant admin feed (needs a session AND the admin key). Optional ?merchant_id= narrows it to one merchant.
    let merchantFilter = null
    if (req.query.merchant_id !== undefined) {
      merchantFilter = parseId(req.query.merchant_id)
      if (merchantFilter === null) {
        return res.status(400).json({ error: 'merchant_id must be a positive whole number.' })
      }
    }
    const filterSql = merchantFilter === null ? '' : 'WHERE merchant_id = $1'
    const filterParams = merchantFilter === null ? [] : [merchantFilter]

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*) AS count FROM event_log ${filterSql}`,
      filterParams,
    )
    const total = Number(totalRows[0].count)

    const { rows } = await pool.query(
      `SELECT id, merchant_id, event_type, metadata, created_at FROM event_log ${filterSql}
       ORDER BY created_at DESC LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
      [...filterParams, limit, offset],
    )

    res.status(200).json({
      data: rows,
      page,
      limit,
      total,
    })
  } catch (err) {
    next(err)
  }
})

export default router
