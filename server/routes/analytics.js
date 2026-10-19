import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { ACTIVE_BOOKING_SQL } from '../services/bookingStatus.js'
import { lastMonths, merchantNow, monthRange } from '../services/merchantTime.js'

const router = Router()

// "This month" and the six-month window are the merchant's (Asia/Kolkata) calendar months, from services/merchantTime.js
// (BUGS #100), passed to SQL as parameters; event_date is a calendar date (text), so these are plain date strings.

router.use(requireAuth)

router.get('/summary', async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const now = merchantNow()
    const { start: currentStart, end: currentEnd } = monthRange(now)
    const { start: sixMonthStart, end: windowEnd } = lastMonths(now, 6)

    const { rows: revenueRows } = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS revenue FROM bookings
       WHERE merchant_id = $1 AND event_date >= $2 AND event_date < $3 AND ${ACTIVE_BOOKING_SQL}`,
      [merchantId, currentStart, currentEnd],
    )
    const revenueThisMonth = Number(revenueRows[0].revenue)

    const { rows: bookingsRows } = await pool.query(
      `SELECT COUNT(*) AS count FROM bookings
       WHERE merchant_id = $1 AND event_date >= $2 AND event_date < $3 AND ${ACTIVE_BOOKING_SQL}`,
      [merchantId, currentStart, currentEnd],
    )
    const bookingsThisMonth = Number(bookingsRows[0].count)

    const { rows: peakRows } = await pool.query(
      `SELECT TO_CHAR(event_date::date, 'YYYY-MM') AS month, COUNT(*) AS count
       FROM bookings
       WHERE merchant_id = $1 AND event_date >= $2 AND event_date < $3 AND ${ACTIVE_BOOKING_SQL}
       GROUP BY month
       ORDER BY count DESC, month DESC
       LIMIT 1`,
      [merchantId, sixMonthStart, windowEnd],
    )
    const peakRow = peakRows[0]

    const { rows: clientRows } = await pool.query(
      `SELECT COUNT(DISTINCT phone) AS total FROM bookings WHERE merchant_id = $1 AND ${ACTIVE_BOOKING_SQL}`,
      [merchantId],
    )
    const totalClients = Number(clientRows[0].total)

    res.status(200).json({
      revenueThisMonth,
      bookingsThisMonth,
      peakMonth: peakRow
        ? { month: peakRow.month, count: Number(peakRow.count) }
        : { month: null, count: 0 },
      totalClients,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/monthly', async (req, res, next) => {
  try {
    const { keys, start: sixMonthStart, end: windowEnd } = lastMonths(merchantNow(), 6)

    const { rows } = await pool.query(
      `SELECT TO_CHAR(event_date::date, 'YYYY-MM') AS month,
              COUNT(*) AS bookings,
              COALESCE(SUM(total), 0) AS revenue
       FROM bookings
       WHERE merchant_id = $1 AND event_date >= $2 AND event_date < $3 AND ${ACTIVE_BOOKING_SQL}
       GROUP BY month
       ORDER BY month ASC`,
      [req.merchantId, sixMonthStart, windowEnd],
    )

    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]))

    const monthly = keys.map((month) => ({
      month,
      bookings: Number(byMonth[month]?.bookings ?? 0),
      revenue: Number(byMonth[month]?.revenue ?? 0),
    }))

    res.status(200).json(monthly)
  } catch (err) {
    next(err)
  }
})

export default router
