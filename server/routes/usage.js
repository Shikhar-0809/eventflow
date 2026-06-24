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

const monthStart = (year, monthIndex) => `${year}-${pad(monthIndex + 1)}-01`

const nextMonthStart = (year, monthIndex) => {
  if (monthIndex === 11) return `${year + 1}-01-01`
  return `${year}-${pad(monthIndex + 2)}-01`
}

const weekStartSql = () => {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  const y = start.getFullYear()
  const m = pad(start.getMonth() + 1)
  const d = pad(start.getDate())
  return `${y}-${m}-${d} 00:00:00`
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
    const now = new Date()
    const year = now.getFullYear()
    const monthIndex = now.getMonth()
    const currentStart = `${monthStart(year, monthIndex)} 00:00:00`
    const currentEnd = `${nextMonthStart(year, monthIndex)} 00:00:00`
    const weekStart = weekStartSql()

    const { rows: loginRows } = await pool.query(
      "SELECT COUNT(*) AS count FROM event_log WHERE event_type = 'login' AND created_at >= $1",
      [weekStart],
    )
    const loginsThisWeek = Number(loginRows[0].count)

    const { rows: createdRows } = await pool.query(
      "SELECT COUNT(*) AS count FROM event_log WHERE event_type = 'booking_created' AND created_at >= $1 AND created_at < $2",
      [currentStart, currentEnd],
    )
    const bookingsCreatedThisMonth = Number(createdRows[0].count)

    const { rows: whatsappRows } = await pool.query(
      `SELECT COUNT(*) AS count FROM event_log
       WHERE event_type IN ('whatsapp_confirmation_sent', 'whatsapp_reminder_sent')
       AND created_at >= $1 AND created_at < $2`,
      [currentStart, currentEnd],
    )
    const whatsappMessagesSentThisMonth = Number(whatsappRows[0].count)

    const { rows: lastActiveRows } = await pool.query(
      'SELECT MAX(created_at) AS last_active FROM event_log',
    )

    const { rows: firstActivityRows } = await pool.query(
      'SELECT MIN(created_at) AS first_activity FROM event_log',
    )

    res.status(200).json({
      loginsThisWeek,
      bookingsCreatedThisMonth,
      whatsappMessagesSentThisMonth,
      lastActiveAt: lastActiveRows[0].last_active ?? null,
      firstActivityAt: firstActivityRows[0].first_activity ?? null,
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
