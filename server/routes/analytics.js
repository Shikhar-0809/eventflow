import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

const pad = (n) => String(n).padStart(2, '0')

const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`

const monthStart = (year, monthIndex) => `${year}-${pad(monthIndex + 1)}-01`

const nextMonthStart = (year, monthIndex) => {
  if (monthIndex === 11) return `${year + 1}-01-01`
  return `${year}-${pad(monthIndex + 2)}-01`
}

const lastSixMonthKeys = () => {
  const now = new Date()
  const keys = []
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(monthKey(d))
  }
  return keys
}

router.use(requireAuth)

router.get('/summary', async (req, res, next) => {
  try {
    const now = new Date()
    const year = now.getFullYear()
    const monthIndex = now.getMonth()
    const currentStart = monthStart(year, monthIndex)
    const currentEnd = nextMonthStart(year, monthIndex)

    const sixMonthsAgo = new Date(year, monthIndex - 5, 1)
    const sixMonthStart = monthStart(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth())
    const windowEnd = currentEnd

    const { rows: revenueRows } = await pool.query(
      'SELECT COALESCE(SUM(total), 0) AS revenue FROM bookings WHERE event_date >= $1 AND event_date < $2',
      [currentStart, currentEnd],
    )
    const revenueThisMonth = Number(revenueRows[0].revenue)

    const { rows: bookingsRows } = await pool.query(
      'SELECT COUNT(*) AS count FROM bookings WHERE event_date >= $1 AND event_date < $2',
      [currentStart, currentEnd],
    )
    const bookingsThisMonth = Number(bookingsRows[0].count)

    const { rows: peakRows } = await pool.query(
      `SELECT TO_CHAR(event_date::date, 'YYYY-MM') AS month, COUNT(*) AS count
       FROM bookings
       WHERE event_date >= $1 AND event_date < $2
       GROUP BY month
       ORDER BY count DESC, month DESC
       LIMIT 1`,
      [sixMonthStart, windowEnd],
    )
    const peakRow = peakRows[0]

    const { rows: clientRows } = await pool.query(
      'SELECT COUNT(DISTINCT phone) AS total FROM bookings',
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
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const sixMonthStart = monthStart(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth())
    const windowEnd = nextMonthStart(now.getFullYear(), now.getMonth())

    const { rows } = await pool.query(
      `SELECT TO_CHAR(event_date::date, 'YYYY-MM') AS month,
              COUNT(*) AS bookings,
              COALESCE(SUM(total), 0) AS revenue
       FROM bookings
       WHERE event_date >= $1 AND event_date < $2
       GROUP BY month
       ORDER BY month ASC`,
      [sixMonthStart, windowEnd],
    )

    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]))

    const monthly = lastSixMonthKeys().map((month) => ({
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
