import { Router } from 'express'
import db from '../db/database.js'
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

router.get('/summary', (req, res, next) => {
  try {
    const now = new Date()
    const year = now.getFullYear()
    const monthIndex = now.getMonth()
    const currentStart = monthStart(year, monthIndex)
    const currentEnd = nextMonthStart(year, monthIndex)

    const sixMonthsAgo = new Date(year, monthIndex - 5, 1)
    const sixMonthStart = monthStart(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth())
    const windowEnd = currentEnd

    const revenueThisMonth = db
      .prepare(
        'SELECT COALESCE(SUM(total), 0) AS revenue FROM bookings WHERE event_date >= ? AND event_date < ?',
      )
      .get(currentStart, currentEnd).revenue

    const bookingsThisMonth = db
      .prepare(
        'SELECT COUNT(*) AS count FROM bookings WHERE event_date >= ? AND event_date < ?',
      )
      .get(currentStart, currentEnd).count

    const peakRow = db
      .prepare(
        `SELECT strftime('%Y-%m', event_date) AS month, COUNT(*) AS count
         FROM bookings
         WHERE event_date >= ? AND event_date < ?
         GROUP BY month
         ORDER BY count DESC, month DESC
         LIMIT 1`,
      )
      .get(sixMonthStart, windowEnd)

    const totalClients = db
      .prepare('SELECT COUNT(DISTINCT phone) AS total FROM bookings')
      .get().total

    res.status(200).json({
      revenueThisMonth,
      bookingsThisMonth,
      peakMonth: peakRow
        ? { month: peakRow.month, count: peakRow.count }
        : { month: null, count: 0 },
      totalClients,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/monthly', (req, res, next) => {
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const sixMonthStart = monthStart(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth())
    const windowEnd = nextMonthStart(now.getFullYear(), now.getMonth())

    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', event_date) AS month,
                COUNT(*) AS bookings,
                COALESCE(SUM(total), 0) AS revenue
         FROM bookings
         WHERE event_date >= ? AND event_date < ?
         GROUP BY month
         ORDER BY month ASC`,
      )
      .all(sixMonthStart, windowEnd)

    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]))

    const monthly = lastSixMonthKeys().map((month) => ({
      month,
      bookings: byMonth[month]?.bookings ?? 0,
      revenue: byMonth[month]?.revenue ?? 0,
    }))

    res.status(200).json(monthly)
  } catch (err) {
    next(err)
  }
})

export default router
