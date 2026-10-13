import 'dotenv/config'
import { pool } from '../db/database.js'

const BASE = 'http://localhost:3001/api'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'
const ADMIN_KEY = process.env.ADMIN_ACCESS_KEY || 'dev-admin-key-local-only'

const pad = (n) => String(n).padStart(2, '0')
const monthStart = (year, monthIndex) => `${year}-${pad(monthIndex + 1)}-01`
const nextMonthStart = (year, monthIndex) => {
  if (monthIndex === 11) return `${year + 1}-01-01`
  return `${year}-${pad(monthIndex + 2)}-01`
}
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
const lastSixMonthKeys = () => {
  const now = new Date()
  const keys = []
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(monthKey(d))
  }
  return keys
}
const weekStartSql = () => {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} 00:00:00`
}

const request = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

const cookieHeader = (setCookie) => setCookie.map((c) => c.split(';')[0]).join('; ')

const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})
const loginJson = await loginRes.json().catch(() => ({}))
if (loginRes.status !== 200) {
  console.error('BLOCKED: login failed', loginRes.status, loginJson)
  process.exit(2)
}
const cookie = cookieHeader(loginRes.headers.getSetCookie?.() ?? [])

const now = new Date()
const year = now.getFullYear()
const monthIndex = now.getMonth()
const currentStart = monthStart(year, monthIndex)
const currentEnd = nextMonthStart(year, monthIndex)
const sixMonthsAgo = new Date(year, monthIndex - 5, 1)
const sixMonthStart = monthStart(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth())
const currentStartDt = `${currentStart} 00:00:00`
const currentEndDt = `${currentEnd} 00:00:00`
const weekStart = weekStartSql()

const dbRevenue = Number((await pool.query(
  'SELECT COALESCE(SUM(total), 0) AS v FROM bookings WHERE event_date >= $1 AND event_date < $2',
  [currentStart, currentEnd],
)).rows[0].v)
const dbBookingsMonth = Number((await pool.query(
  'SELECT COUNT(*) AS v FROM bookings WHERE event_date >= $1 AND event_date < $2',
  [currentStart, currentEnd],
)).rows[0].v)
const dbTotalClients = Number((await pool.query('SELECT COUNT(DISTINCT phone) AS v FROM bookings')).rows[0].v)
const dbPeakRow = (await pool.query(
  `SELECT to_char(event_date::date, 'YYYY-MM') AS month, COUNT(*) AS count
   FROM bookings WHERE event_date >= $1 GROUP BY 1 ORDER BY count DESC, month DESC LIMIT 1`,
  [sixMonthStart],
)).rows[0]
const dbPeak = dbPeakRow ? { month: dbPeakRow.month, count: Number(dbPeakRow.count) } : undefined

const dbLoginsWeek = Number((await pool.query(
  "SELECT COUNT(*) AS v FROM event_log WHERE event_type = 'login' AND created_at >= $1",
  [weekStart],
)).rows[0].v)
const dbBookingsCreatedMonth = Number((await pool.query(
  "SELECT COUNT(*) AS v FROM event_log WHERE event_type = 'booking_created' AND created_at >= $1 AND created_at < $2",
  [currentStartDt, currentEndDt],
)).rows[0].v)
const dbLastActive = (await pool.query('SELECT MAX(created_at) AS v FROM event_log')).rows[0].v

const envExample = await import('fs').then((fs) =>
  fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8'),
)
const envFile = await import('fs').then((fs) =>
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8'),
)
const parseEnv = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i), l.slice(i + 1)]
      }),
  )
const exampleEnv = parseEnv(envExample)
const realEnv = parseEnv(envFile)

const results = {}

// Admin key tests 1-4
results.check1_adminNoKey = await request('/usage/admin', { cookie })
results.check2_adminWrongKey = await request('/usage/admin', {
  cookie,
  headers: { 'x-admin-key': 'wrong-key-value' },
})
results.check3_adminKeyOnly = await request('/usage/admin', {
  headers: { 'x-admin-key': ADMIN_KEY },
})
results.check4_adminBoth = await request('/usage/admin?limit=3', {
  cookie,
  headers: { 'x-admin-key': ADMIN_KEY },
})

// Analytics auth 8
results.check8_analyticsNoAuth = {
  summary: await request('/analytics/summary'),
  monthly: await request('/analytics/monthly'),
}

const summary = await request('/analytics/summary', { cookie })
const monthly = await request('/analytics/monthly', { cookie })
const usageMe = await request('/usage/me', { cookie })
results.check13_usageMeNoAuth = await request('/usage/me')

results.check9_summaryMatch = {
  api: summary.json,
  db: {
    revenueThisMonth: dbRevenue,
    bookingsThisMonth: dbBookingsMonth,
    totalClients: dbTotalClients,
  },
  pass:
    summary.status === 200 &&
    summary.json.revenueThisMonth === dbRevenue &&
    summary.json.bookingsThisMonth === dbBookingsMonth &&
    summary.json.totalClients === dbTotalClients,
}

results.check10_peakMonth = {
  api: summary.json?.peakMonth,
  db: dbPeak ? { month: dbPeak.month, count: dbPeak.count } : { month: null, count: 0 },
  pass:
    summary.json?.peakMonth?.month === (dbPeak?.month ?? null) &&
    summary.json?.peakMonth?.count === (dbPeak?.count ?? 0),
  seedNote:
    'Seed bookings cluster in Jun 2026; 6-month window may only have meaningful counts in one month until Prompt 14 expands span',
}

results.check11_monthlyLength = {
  status: monthly.status,
  length: monthly.json?.length,
  expectedKeys: lastSixMonthKeys(),
  pass: monthly.status === 200 && monthly.json?.length === 6,
  zeroFilled: monthly.json?.filter((m) => m.bookings === 0).length,
}

results.check14_usageMe = {
  api: usageMe.json,
  db: {
    loginsThisWeek: dbLoginsWeek,
    bookingsCreatedThisMonth: dbBookingsCreatedMonth,
    lastActiveAt: dbLastActive,
  },
  pass:
    usageMe.status === 200 &&
    usageMe.json.loginsThisWeek === dbLoginsWeek &&
    usageMe.json.bookingsCreatedThisMonth === dbBookingsCreatedMonth &&
    usageMe.json.lastActiveAt === dbLastActive,
}

results.check7_envPlaceholder = {
  exampleEmpty: !exampleEnv.ADMIN_ACCESS_KEY?.trim(),
  realSet: Boolean(realEnv.ADMIN_ACCESS_KEY?.trim()),
  valuesMatch: exampleEnv.ADMIN_ACCESS_KEY === realEnv.ADMIN_ACCESS_KEY,
}
results.check7_envPlaceholder.pass =
  results.check7_envPlaceholder.exampleEmpty &&
  results.check7_envPlaceholder.realSet &&
  !results.check7_envPlaceholder.valuesMatch

results.check12_queries = {
  analyticsSummary: "pool.query('... WHERE event_date >= $1 AND event_date < $2', [currentStart, currentEnd])",
  analyticsMonthly: "pool.query('... WHERE event_date >= $1', [sixMonthStart])",
  usageMe: 'all date bounds passed as $n parameters',
  usageAdmin: "pool.query('... LIMIT $1 OFFSET $2', [limit, offset])",
}

results.check16_routeMatrix = {
  analytics: [
    'GET /summary — requireAuth (router.use)',
    'GET /monthly — requireAuth (router.use)',
  ],
  usage: [
    'POST /log-client-action — requireAuth + validate',
    'GET /me — requireAuth (router.use)',
    'GET /admin — requireAuth (router.use) + requireAdminKey (route)',
  ],
}

results.check5_middlewareOrder =
  'router.use(requireAuth) at line 35, then router.get(\'/admin\', requireAdminKey, ...) at line 101'

const allPass = [
  results.check1_adminNoKey.status === 401,
  results.check2_adminWrongKey.status === 401,
  results.check3_adminKeyOnly.status === 401,
  results.check4_adminBoth.status === 200 && Array.isArray(results.check4_adminBoth.json?.data),
  results.check8_analyticsNoAuth.summary.status === 401,
  results.check8_analyticsNoAuth.monthly.status === 401,
  results.check9_summaryMatch.pass,
  results.check10_peakMonth.pass,
  results.check11_monthlyLength.pass,
  results.check13_usageMeNoAuth.status === 401,
  results.check14_usageMe.pass,
  results.check7_envPlaceholder.pass,
].every(Boolean)

console.log(JSON.stringify({ allPass, results }, null, 2))
await pool.end()
process.exit(allPass ? 0 : 1)
