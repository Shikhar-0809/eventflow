import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { initDb } from './db/database.js'
import { seed } from './db/seed.js'
import authRouter from './routes/auth.js'
import bookingsRouter from './routes/bookings.js'
import inventoryRouter from './routes/inventory.js'
import analyticsRouter from './routes/analytics.js'
import usageRouter from './routes/usage.js'
import settingsRouter from './routes/settings.js'
import reportsRouter from './routes/reports.js'
import recordsRouter from './routes/records.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requireProxySecret } from './middleware/requireProxySecret.js'

const REQUIRED_ENV = ['JWT_SECRET', 'MERCHANT_PASSWORD_HASH', 'SESSION_COOKIE_NAME']

// Only production sits behind the Vercel proxy, so local dev does not need this.
if (process.env.NODE_ENV === 'production') {
  REQUIRED_ENV.push('PROXY_SHARED_SECRET')
}

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'production') {
  console.log(`JWT_SECRET loaded: ${Boolean(process.env.JWT_SECRET)}`)
}

const app = express()
const PORT = process.env.PORT || 3001

// JSON API only — Express default ETag can respond 304 with an empty body on repeat GETs.
app.set('etag', false)

// Trust exactly 4 proxy hops so req.ip is the real client, not a proxy or a forged header value.
// Measured in production on two networks (BUGS #040). Hop chain, client to Express:
//   client -> Vercel rewrite proxy (AWS) -> Cloudflare -> Render internal LB (10.x) -> local proxy (socket ::1)
// X-Forwarded-For therefore holds client, Vercel, Cloudflare, LB; the socket adds ::1 (5 addresses).
// Express trusts the first 4 from the right, so the 5th (the client) becomes req.ip and anything
// a caller forges sits to its left and is ignored.
// Re-measure this value if hosting changes (new CDN, proxy or platform). Never use `true`:
// it trusts every hop and lets any caller spoof req.ip and evade the rate limiters.
// This must stay above helmet, the rate limiters and all routes.
app.set('trust proxy', 4)

// Production only: reject anything that did not come through the Vercel proxy (BUGS #056).
// Runs before everything else, including helmet, so unproxied callers get nothing but a 403.
if (process.env.NODE_ENV === 'production') {
  app.use(requireProxySecret)
}

// Local Vite (5173) reads this API (3001). Production is same-origin through the Vercel /api proxy, so keep helmet's same-origin default there.
app.use(helmet(
  process.env.NODE_ENV === 'production'
    ? {}
    : { crossOriginResourcePolicy: { policy: 'cross-origin' } },
))

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json())

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/usage', usageRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/records', recordsRouter)

app.use(errorHandler)

;(async () => {
  try {
    await initDb()
    await seed()
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (err) {
    // A failed migration must stop the server rather than run on a half-migrated database.
    // Message only: Postgres error detail can contain row values.
    console.error(`Startup failed: ${err.message}`)
    process.exit(1)
  }
})()
