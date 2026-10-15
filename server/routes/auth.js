import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/database.js'
import { loginRateLimiter, signupRateLimiter } from '../middleware/rateLimiter.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { trackUsage } from '../middleware/trackUsage.js'
import { validate } from '../middleware/validate.js'
import { loginSchema, signupSchema } from '../schemas/merchant.schema.js'

const BCRYPT_COST = 10

// Compared against when the email is unknown, so a miss takes as long as a wrong password
// and response time does not reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST)

const sessionCookieOptions = (isProd) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
})

const issueSession = (res, merchantId) => {
  const token = jwt.sign({ merchant_id: merchantId }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
  })

  res.cookie(process.env.SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(process.env.NODE_ENV === 'production'),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

const router = Router()

router.post('/signup', signupRateLimiter, validate(signupSchema), async (req, res, next) => {
  try {
    const { business_name, email, password } = req.body

    const { rows: existing } = await pool.query('SELECT 1 FROM merchants WHERE lower(email) = $1', [email])
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

    let merchant
    try {
      const { rows } = await pool.query(
        'INSERT INTO merchants (business_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, business_name',
        [business_name, email, passwordHash],
      )
      merchant = rows[0]
    } catch (err) {
      // Two sign-ups with the same email raced past the check above; the unique index decides.
      if (err.code === '23505') {
        return res.status(409).json({ error: 'An account with this email already exists.' })
      }
      throw err
    }

    issueSession(res, merchant.id)
    res.status(201).json({ authenticated: true, merchant: { business_name: merchant.business_name } })
  } catch (err) {
    next(err)
  }
})

router.post('/login', loginRateLimiter, validate(loginSchema), trackUsage('login'), async (req, res, next) => {
  try {
    const { email, password } = req.body

    const { rows } = await pool.query(
      'SELECT id, business_name, password_hash FROM merchants WHERE lower(email) = $1',
      [email],
    )
    const merchant = rows[0]

    // A merchant row without a password_hash (no credentials set) can never log in.
    const isValid = await bcrypt.compare(password, merchant?.password_hash ?? DUMMY_HASH)

    if (!merchant?.password_hash || !isValid) {
      return res.status(401).json({ error: 'Incorrect email or password.' })
    }

    // requireAuth has not run on this route; trackUsage reads the merchant from here.
    res.locals.merchantId = merchant.id

    issueSession(res, merchant.id)
    res.status(200).json({ authenticated: true, merchant: { business_name: merchant.business_name } })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie(
    process.env.SESSION_COOKIE_NAME,
    sessionCookieOptions(process.env.NODE_ENV === 'production'),
  )
  res.status(200).json({ authenticated: false })
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT business_name FROM merchants WHERE id = $1', [req.merchantId])
    res.status(200).json({ authenticated: true, merchant: { business_name: rows[0]?.business_name ?? null } })
  } catch (err) {
    next(err)
  }
})

export default router
