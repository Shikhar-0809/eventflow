import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { loginRateLimiter } from '../middleware/rateLimiter.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { trackUsage } from '../middleware/trackUsage.js'

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

    const token = jwt.sign({}, process.env.JWT_SECRET, { expiresIn: '7d' })

    res.cookie(process.env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.status(200).json({ authenticated: true })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie(process.env.SESSION_COOKIE_NAME)
  res.status(200).json({ authenticated: false })
})

router.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ authenticated: true })
})

export default router
