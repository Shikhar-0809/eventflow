import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireAdminKey } from '../middleware/requireAdminKey.js'
import { validate } from '../middleware/validate.js'

const router = Router()

const clientActionSchema = z.object({
  event_type: z.enum(['whatsapp_confirmation_sent', 'whatsapp_reminder_sent']),
  booking_id: z.number().int().positive(),
})

const pad = (n) => String(n).padStart(2, '0')

const formatDate = (date) => {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  return `${y}-${m}-${d}`
}

const formatDayMonth = (date) =>
  date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** ISO week: Monday 00:00:00 through Sunday end; weekOffset 0 = current week. */
const getWeekWindow = (weekOffset = 0) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayOfWeek = today.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMonday - weekOffset * 7)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)

  return {
    weekStart: `${formatDate(monday)} 00:00:00`,
    weekEndExclusive: `${formatDate(nextMonday)} 00:00:00`,
    weekLabel: `${formatDayMonth(monday)} – ${formatDayMonth(sunday)} ${sunday.getFullYear()}`,
  }
}

router.use(requireAuth)

router.post('/log-client-action', validate(clientActionSchema), async (req, res, next) => {
  try {
    const { event_type, booking_id } = req.body

    const { rows: bookingRows } = await pool.query('SELECT id FROM bookings WHERE id = $1', [booking_id])
    if (!bookingRows[0]) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    await pool.query(
      'INSERT INTO event_log (event_type, metadata) VALUES ($1, $2)',
      [event_type, JSON.stringify({ booking_id })],
    )

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

router.get('/me', async (req, res, next) => {
  try {
    const weekOffset = Math.max(0, Number.parseInt(req.query.weekOffset, 10) || 0)
    const { weekStart, weekEndExclusive, weekLabel } = getWeekWindow(weekOffset)

    const weekScoped = (eventType) => pool.query(
      `SELECT COUNT(*)::int AS count FROM event_log
       WHERE event_type = $1
       AND created_at::timestamptz >= $2::timestamptz
       AND created_at::timestamptz < $3::timestamptz`,
      [eventType, weekStart, weekEndExclusive],
    )

    const [
      { rows: loginRows },
      { rows: createdRows },
      { rows: editedRows },
      { rows: viewedRows },
      { rows: changeRows },
      { rows: whatsappRows },
      { rows: daysActiveRows },
      { rows: lastActiveRows },
    ] = await Promise.all([
      weekScoped('login'),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM bookings
         WHERE created_at::timestamptz >= $1::timestamptz
         AND created_at::timestamptz < $2::timestamptz`,
        [weekStart, weekEndExclusive],
      ),
      weekScoped('booking_edited'),
      weekScoped('booking_viewed'),
      weekScoped('change_logged'),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM event_log
         WHERE event_type IN ('whatsapp_confirmation_sent', 'whatsapp_reminder_sent')
         AND created_at::timestamptz >= $1::timestamptz
         AND created_at::timestamptz < $2::timestamptz`,
        [weekStart, weekEndExclusive],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT (created_at::timestamptz)::date)::int AS count
         FROM event_log
         WHERE created_at::timestamptz >= $1::timestamptz
         AND created_at::timestamptz < $2::timestamptz`,
        [weekStart, weekEndExclusive],
      ),
      pool.query('SELECT MAX(created_at::timestamptz) AS last_active FROM event_log'),
    ])

    const lastActiveRaw = lastActiveRows[0].last_active
    const lastActiveAt = lastActiveRaw != null ? new Date(lastActiveRaw).toISOString() : null

    res.status(200).json({
      loginsThisWeek: loginRows[0].count,
      bookingsCreatedThisWeek: createdRows[0].count,
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

    const { rows: totalRows } = await pool.query('SELECT COUNT(*) AS count FROM event_log')
    const total = Number(totalRows[0].count)

    const { rows } = await pool.query(
      'SELECT id, event_type, metadata, created_at FROM event_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
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
