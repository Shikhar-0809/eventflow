import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { loginRateLimiter } from '../middleware/rateLimiter.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { trackUsage } from '../middleware/trackUsage.js'

const sessionCookieOptions = (isProd) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
})

// Until real accounts exist (Firebase login, next prompt), the single env-password login is merchant 1.
const LEGACY_LOGIN_MERCHANT_ID = 1

const router = Router()

router.post('/login', loginRateLimiter, trackUsage('login'), async (req, res, next) => {
  try {
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' })
    }

    const isValid = await bcrypt.compare(password, process.env.MERCHANT_PASSWORD_HASH)

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password.' })
    }

    const token = jwt.sign({ merchant_id: LEGACY_LOGIN_MERCHANT_ID }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '7d',
    })

    // requireAuth has not run on this route; trackUsage reads the merchant from here.
    res.locals.merchantId = LEGACY_LOGIN_MERCHANT_ID

    const isProd = process.env.NODE_ENV === 'production'

    res.cookie(process.env.SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions(isProd),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.status(200).json({ authenticated: true })
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

router.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ authenticated: true })
})

export default router
