import db from '../db/database.js'
import { getVerifyCookieHeader, VERIFY_API_BASE } from './lib/verifySession.mjs'

const june = db
  .prepare(
    `SELECT id, client_name, event_date, status FROM bookings
     WHERE event_date >= '2026-06-01' AND event_date < '2026-07-01'
     ORDER BY event_date, id`,
  )
  .all()

const distinctJuneDates = db
  .prepare(
    `SELECT COUNT(DISTINCT event_date) AS n FROM bookings
     WHERE event_date >= '2026-06-01' AND event_date < '2026-07-01'`,
  )
  .get().n

const conflict = db
  .prepare(
    `SELECT id, client_name, event_date, status FROM bookings WHERE event_date = (
      SELECT event_date FROM bookings GROUP BY event_date HAVING COUNT(*) > 1 LIMIT 1
    ) ORDER BY id`,
  )
  .all()

const eventLogBreakdown = db
  .prepare('SELECT event_type, COUNT(*) AS count FROM event_log GROUP BY event_type ORDER BY event_type')
  .all()

const eventLogTotal = db.prepare('SELECT COUNT(*) AS n FROM event_log').get().n

const cookie = await getVerifyCookieHeader()
const usageRes = await fetch(`${VERIFY_API_BASE}/usage/me`, { headers: { Cookie: cookie } })
const usage = await usageRes.json()
const summaryRes = await fetch(`${VERIFY_API_BASE}/analytics/summary`, { headers: { Cookie: cookie } })
const summary = await summaryRes.json()

const demoSeedEvents = db
  .prepare(
    `SELECT id, event_type, metadata, created_at FROM event_log
     WHERE metadata LIKE '%"demo_seed":true%' ORDER BY created_at`,
  )
  .all()

console.log(
  JSON.stringify(
    {
      totalBookings: db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,
      verifyDemoClientRemaining: db
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE client_name = 'Verify Demo Client'")
        .get().n,
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
