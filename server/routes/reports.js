import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

router.use(requireAuth)

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 366

const validateDateRange = (from, to) => {
  if (!from || !to) {
    return 'from and to dates are required.'
  }
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return 'Dates must be in YYYY-MM-DD format.'
  }
  if (from > to) {
    return 'Start date must be before end date.'
  }

  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Dates must be in YYYY-MM-DD format.'
  }

  const inclusiveDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1
  if (inclusiveDays > MAX_RANGE_DAYS) {
    return 'Date range cannot exceed 366 days.'
  }

  return null
}

router.get('/range', async (req, res, next) => {
  try {
    const { from, to } = req.query
    const validationError = validateDateRange(from, to)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    const { rows: bookingRows } = await pool.query(
      `SELECT id, client_name, phone, event_type, event_type_custom, event_date, venue,
              guest_count, status, advance, total
       FROM bookings
       WHERE event_date >= $1 AND event_date <= $2
       ORDER BY event_date ASC`,
      [from, to],
    )

    const bookingIds = bookingRows.map((row) => Number(row.id))
    let expenseRows = []

    if (bookingIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, booking_id, label, amount
         FROM booking_expenses
         WHERE booking_id = ANY($1::int[])
         ORDER BY id ASC`,
        [bookingIds],
      )
      expenseRows = rows
    }

    const expensesByBooking = new Map()
    for (const row of expenseRows) {
      const bookingId = Number(row.booking_id)
      const list = expensesByBooking.get(bookingId) ?? []
      list.push({
        id: Number(row.id),
        label: row.label ?? '',
        amount: Number(row.amount ?? 0),
      })
      expensesByBooking.set(bookingId, list)
    }

    const bookings = bookingRows.map((row) => {
      const total = Number(row.total ?? 0)
      const advance = Number(row.advance ?? 0)
      const expenses = expensesByBooking.get(Number(row.id)) ?? []
      const total_expenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)

      return {
        id: Number(row.id),
        client_name: row.client_name,
        phone: row.phone,
        event_type: row.event_type,
        event_type_custom: row.event_type_custom ?? null,
        event_date: row.event_date,
        venue: row.venue ?? null,
        guest_count: Number(row.guest_count ?? 0),
        status: row.status,
        advance,
        total,
        pending_balance: total - advance,
        expenses,
        total_expenses,
        profit: total - total_expenses,
      }
    })

    const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled')
    const totalRevenue = activeBookings.reduce((sum, booking) => sum + booking.total, 0)
    const totalAdvanceCollected = activeBookings.reduce((sum, booking) => sum + booking.advance, 0)
    const totalExpenses = activeBookings.reduce((sum, booking) => sum + booking.total_expenses, 0)

    res.status(200).json({
      from,
      to,
      generatedAt: new Date().toISOString(),
      summary: {
        totalBookings: activeBookings.length,
        totalRevenue,
        totalAdvanceCollected,
        totalPendingBalance: totalRevenue - totalAdvanceCollected,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
      },
      bookings,
    })
  } catch (err) {
    next(err)
  }
})

export default router
