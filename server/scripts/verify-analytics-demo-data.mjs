import db from '../db/database.js'
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
const conflictDate = db
  .prepare(
    `SELECT event_date FROM bookings GROUP BY event_date HAVING COUNT(*) > 1 LIMIT 1`,
  )
  .get()?.event_date

const conflictRes = await fetch(`${VERIFY_API_BASE}/bookings/check-conflict?date=${conflictDate}`, {
  headers: { Cookie: cookie },
})

const conflict = await conflictRes.json()
const juneSeedIds = db
  .prepare(`SELECT id FROM bookings WHERE id <= 10 OR (client_name IN ('Kavita Reddy','Arjun Mehta')) ORDER BY id`)
  .all()

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
      juneSeedRowCount: db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE event_date LIKE '2026-06-%'`).get().n,
      totalBookings: db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,
      dateSpread: db.prepare('SELECT MIN(event_date) AS minDate, MAX(event_date) AS maxDate FROM bookings').get(),
      byMonth: db.prepare(`SELECT strftime('%Y-%m', event_date) AS month, COUNT(*) AS count FROM bookings GROUP BY month ORDER BY month`).all(),
    },
    null,
    2,
  ),
)
