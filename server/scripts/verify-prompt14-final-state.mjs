import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'
import { getVerifyCookieHeader, VERIFY_API_BASE } from './lib/verifySession.mjs'

const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0]
const many = async (sql, params = []) => (await pool.query(sql, params)).rows

try {
  const june = await many(
    `SELECT id, client_name, event_date, status FROM bookings
     WHERE event_date >= '2026-06-01' AND event_date < '2026-07-01'
     ORDER BY event_date, id`,
  )

  const distinctJuneDates = Number((await one(
    `SELECT COUNT(DISTINCT event_date) AS n FROM bookings
     WHERE event_date >= '2026-06-01' AND event_date < '2026-07-01'`,
  )).n)

  const conflict = await many(
    `SELECT id, client_name, event_date, status FROM bookings WHERE event_date = (
      SELECT event_date FROM bookings GROUP BY event_date HAVING COUNT(*) > 1 LIMIT 1
    ) ORDER BY id`,
  )

  const eventLogBreakdown = await many(
    'SELECT event_type, COUNT(*) AS count FROM event_log GROUP BY event_type ORDER BY event_type',
  )

  const eventLogTotal = Number((await one('SELECT COUNT(*) AS n FROM event_log')).n)

  const cookie = await getVerifyCookieHeader()
  const usageRes = await fetch(`${VERIFY_API_BASE}/usage/me`, { headers: { Cookie: cookie } })
  const usage = await usageRes.json()
  const summaryRes = await fetch(`${VERIFY_API_BASE}/analytics/summary`, { headers: { Cookie: cookie } })
  const summary = await summaryRes.json()

  const demoSeedEvents = await many(
    `SELECT id, event_type, metadata, created_at FROM event_log
     WHERE metadata LIKE '%"demo_seed":true%' ORDER BY created_at`,
  )

  const totalBookings = Number((await one('SELECT COUNT(*) AS n FROM bookings')).n)
  const verifyDemoClientRemaining = Number((await one(
    "SELECT COUNT(*) AS n FROM bookings WHERE client_name = 'Verify Demo Client'",
  )).n)

  console.log(
    JSON.stringify(
      {
        totalBookings,
        verifyDemoClientRemaining,
        juneDistinctDates: distinctJuneDates,
        juneBookings: june,
        conflictDemoRows: conflict,
        demoSeedEvents,
        eventLogTotal,
        eventLogBreakdown,
        analyticsSummary: { status: summaryRes.status, body: summary },
        usageMe: { status: usageRes.status, body: usage },
      },
      null,
      2,
    ),
  )
  await pool.end()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
