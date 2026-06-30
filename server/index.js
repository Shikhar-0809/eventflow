import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { initDb } from './db/database.js'
import { seed } from './db/seed.js'
import authRouter from './routes/auth.js'
import bookingsRouter from './routes/bookings.js'
import inventoryRouter from './routes/inventory.js'
import analyticsRouter from './routes/analytics.js'
import usageRouter from './routes/usage.js'
import { errorHandler } from './middleware/errorHandler.js'

const REQUIRED_ENV = ['JWT_SECRET', 'MERCHANT_PASSWORD_HASH', 'SESSION_COOKIE_NAME']

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

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/debug-hash', (req, res) => {
  const hash = process.env.MERCHANT_PASSWORD_HASH
  res.json({
    hashLength: hash ? hash.length : null,
    hashStart: hash ? hash.slice(0, 7) : null,
    hashEnd: hash ? hash.slice(-4) : null,
  })
})

app.use('/api/auth', authRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/usage', usageRouter)

app.use(errorHandler)

;(async () => {
  await initDb()
  await seed()
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
})()
