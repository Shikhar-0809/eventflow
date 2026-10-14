import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'
import { getVerifyCookieHeader, VERIFY_API_BASE } from './lib/verifySession.mjs'

const cookie = await getVerifyCookieHeader()

const summaryRes = await fetch(`${VERIFY_API_BASE}/analytics/summary`, {
  headers: { Cookie: cookie },
})
const monthlyRes = await fetch(`${VERIFY_API_BASE}/analytics/monthly`, {
  headers: { Cookie: cookie },
})

const summary = await summaryRes.json()
const monthly = await monthlyRes.json()

const monthsWithBookings = monthly.filter((row) => row.bookings > 0)
const conflictDate = (await pool.query(
  'SELECT event_date FROM bookings GROUP BY event_date HAVING COUNT(*) > 1 LIMIT 1',
)).rows[0]?.event_date

const conflictRes = await fetch(`${VERIFY_API_BASE}/bookings/check-conflict?date=${conflictDate}`, {
  headers: { Cookie: cookie },
})

const conflict = await conflictRes.json()
const juneSeedIds = (await pool.query(
  `SELECT id FROM bookings WHERE id <= 10 OR (client_name IN ('Kavita Reddy','Arjun Mehta')) ORDER BY id`,
)).rows

const juneSeedRowCount = Number((await pool.query(
  `SELECT COUNT(*) AS n FROM bookings WHERE event_date LIKE '2026-06-%'`,
)).rows[0].n)
const totalBookings = Number((await pool.query('SELECT COUNT(*) AS n FROM bookings')).rows[0].n)
const dateSpread = (await pool.query(
  'SELECT MIN(event_date) AS "minDate", MAX(event_date) AS "maxDate" FROM bookings',
)).rows[0]
const byMonth = (await pool.query(
  `SELECT to_char(event_date::date, 'YYYY-MM') AS month, COUNT(*) AS count
   FROM bookings GROUP BY 1 ORDER BY 1`,
)).rows

console.log(
  JSON.stringify(
    {
      summaryStatus: summaryRes.status,
      summary,
      monthlyStatus: monthlyRes.status,
      monthly,
      monthsWithBookings: monthsWithBookings.length,
      chartReady: monthsWithBookings.length >= 2,
      conflictDate,
      conflictCheck: conflict,
      juneSeedRowCount,
      totalBookings,
      dateSpread,
      byMonth,
    },
    null,
    2,
  ),
)
await pool.end()
