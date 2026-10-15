import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/database.js'
import {
  loginIpBackstopLimiter,
  loginRateLimiter,
  otpSendIpBackstopLimiter,
  otpSendLimiters,
  otpVerifyLimiter,
  signupRateLimiter,
} from '../middleware/rateLimiter.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { trackUsage } from '../middleware/trackUsage.js'
import { validate } from '../middleware/validate.js'
import { loginSchema, resetPasswordSchema, sendOtpSchema, signupSchema, verifyOtpSchema } from '../schemas/merchant.schema.js'
import { resetCodeEmail, sendEmail, signupCodeEmail } from '../services/email.js'
import {
  INVALID_CODE_MESSAGE,
  OTP_COOLDOWN_SECONDS,
  issueOtp,
  signActionToken,
  verifyActionToken,
  verifyOtp,
  voidOtp,
} from '../services/otp.js'

const BCRYPT_COST = 10

// Compared against when the email is unknown, so a miss takes as long as a wrong password
// and response time does not reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST)

const SIGNUP_EXISTS = 'An account with this email already exists. Try logging in.'
const FORGOT_MESSAGE = "If an account exists for this email, we've sent a code."
const TOKEN_INVALID = 'Your verification has expired. Please verify your email again.'
const RESET_EXPIRED = 'This reset link has expired. Please request a new code.'

const sessionCookieOptions = (isProd) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
})

const issueSession = (res, merchantId, tokenVersion) => {
  // tv ties the session to merchants.token_version: a password reset bumps it and ends every older session.
  const token = jwt.sign({ merchant_id: merchantId, tv: tokenVersion }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
  })

  res.cookie(process.env.SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(process.env.NODE_ENV === 'production'),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

// A resend that comes too soon is a 429 with the seconds left; anything else goes to the error handler.
const sendRetryAfter = (err, res) => {
  if (err.status !== 429 || !err.retryAfter) return false
  res.set('Retry-After', String(err.retryAfter))
  res.status(429).json({ error: err.message, retryAfter: err.retryAfter })
  return true
}

const sendSignupOtp = async (req, res, next) => {
  try {
    const { email } = req.body

    const { rows } = await pool.query('SELECT 1 FROM merchants WHERE lower(email) = $1', [email])
    if (rows.length > 0) {
      return res.status(409).json({ error: SIGNUP_EXISTS })
    }

    const code = await issueOtp({ email, purpose: 'signup' })
    try {
      await sendEmail({ to: email, ...signupCodeEmail(code) })
    } catch (err) {
      // The code never arrived, so do not make the user wait out the cooldown for it.
      await voidOtp({ email, purpose: 'signup' }).catch(() => {})
      console.error(`signup OTP email failed: ${err.message}`)
      return res.status(502).json({ error: 'We could not send the email. Please try again.' })
    }

    res.status(200).json({ sent: true, cooldownSeconds: OTP_COOLDOWN_SECONDS })
  } catch (err) {
    if (sendRetryAfter(err, res)) return
    next(err)
  }
}

// Same response whether or not the account exists. The lookup is the only work before replying; issuing and
// sending happen after the response (existing accounts only), so response time does not reveal the email.
const sendResetOtp = async (req, res, next) => {
  try {
    const { email } = req.body
    const { rows } = await pool.query('SELECT id FROM merchants WHERE lower(email) = $1', [email])
    const merchant = rows[0]

    res.status(200).json({ sent: true, cooldownSeconds: OTP_COOLDOWN_SECONDS, message: FORGOT_MESSAGE })

    if (!merchant) return
    try {
      const code = await issueOtp({ email, purpose: 'reset' })
      try {
        await sendEmail({ to: email, ...resetCodeEmail(code) })
      } catch (err) {
        await voidOtp({ email, purpose: 'reset' }).catch(() => {})
        throw err
      }
    } catch (err) {
      // A cooldown hit is expected (the response was identical). Anything else is logged with the merchant id
      // only: never the email or the code. Nothing here may reject unhandled, the response is already sent.
      if (err.status !== 429) console.error(`reset OTP failed for merchant ${merchant.id}: ${err.message}`)
    }
  } catch (err) {
    next(err)
  }
}

const router = Router()

const sendChain = (purpose) => [otpSendIpBackstopLimiter, otpSendLimiters[purpose], validate(sendOtpSchema)]

router.post('/signup/send-otp', ...sendChain('signup'), sendSignupOtp)
router.post('/signup/resend-otp', ...sendChain('signup'), sendSignupOtp)

router.post('/signup/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), async (req, res, next) => {
  try {
    const { email, code } = req.body
    if (!(await verifyOtp({ email, purpose: 'signup', code }))) {
      return res.status(400).json({ error: INVALID_CODE_MESSAGE })
    }
    res.status(200).json({ verificationToken: signActionToken({ email }, 'signup') })
  } catch (err) {
    next(err)
  }
})

router.post('/signup', signupRateLimiter, validate(signupSchema), trackUsage('signup_verified'), async (req, res, next) => {
  try {
    const { verificationToken, business_name, password } = req.body

    // The email comes from the verified token, never from the body.
    const verified = verifyActionToken(verificationToken, 'signup')
    if (typeof verified?.email !== 'string' || verified.email === '') {
      return res.status(401).json({ error: TOKEN_INVALID })
    }
    const email = verified.email

    // The email was free when the code was sent; someone may have registered it since.
    const { rows: existing } = await pool.query('SELECT 1 FROM merchants WHERE lower(email) = $1', [email])
    if (existing.length > 0) {
      return res.status(409).json({ error: SIGNUP_EXISTS })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

    let merchant
    try {
      const { rows } = await pool.query(
        'INSERT INTO merchants (business_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, business_name, token_version',
        [business_name, email, passwordHash],
      )
      merchant = rows[0]
    } catch (err) {
      // Two sign-ups with the same email raced past the check above; the unique index decides.
      if (err.code === '23505') {
        return res.status(409).json({ error: SIGNUP_EXISTS })
      }
      throw err
    }

    res.locals.merchantId = merchant.id
    issueSession(res, merchant.id, merchant.token_version)
    res.status(201).json({ authenticated: true, merchant: { business_name: merchant.business_name } })
  } catch (err) {
    next(err)
  }
})

router.post('/forgot/send-otp', ...sendChain('forgot'), sendResetOtp)
router.post('/forgot/resend-otp', ...sendChain('forgot'), sendResetOtp)

router.post('/forgot/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), async (req, res, next) => {
  try {
    const { email, code } = req.body
    if (!(await verifyOtp({ email, purpose: 'reset', code }))) {
      return res.status(400).json({ error: INVALID_CODE_MESSAGE })
    }

    const { rows } = await pool.query('SELECT id, token_version FROM merchants WHERE lower(email) = $1', [email])
    if (rows.length === 0) {
      return res.status(400).json({ error: INVALID_CODE_MESSAGE })
    }
    // tv makes the token single use: the reset bumps token_version, so the same token cannot be replayed.
    res.status(200).json({ resetToken: signActionToken({ merchantId: rows[0].id, tv: rows[0].token_version }, 'reset') })
  } catch (err) {
    next(err)
  }
})

router.post('/forgot/reset', otpVerifyLimiter, validate(resetPasswordSchema), trackUsage('password_reset'), async (req, res, next) => {
  let client
  try {
    const { resetToken, newPassword } = req.body

    const verified = verifyActionToken(resetToken, 'reset')
    if (!Number.isInteger(verified?.merchantId) || !Number.isInteger(verified?.tv)) {
      return res.status(400).json({ error: RESET_EXPIRED })
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)

    client = await pool.connect()
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT token_version FROM merchants WHERE id = $1 FOR UPDATE', [verified.merchantId])
    // Rejects a replayed token and one issued before a reset or a log-out-everywhere.
    if (rows.length === 0 || rows[0].token_version !== verified.tv) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: RESET_EXPIRED })
    }

    await client.query(
      'UPDATE merchants SET password_hash = $1, password_changed_at = NOW(), token_version = token_version + 1 WHERE id = $2',
      [passwordHash, verified.merchantId],
    )
    await client.query('COMMIT')

    // No auto-login: the client sends the merchant to the login screen.
    res.locals.merchantId = verified.merchantId
    res.status(200).json({ reset: true })
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    if (client) client.release()
  }
})

router.post('/login', loginIpBackstopLimiter, loginRateLimiter, validate(loginSchema), trackUsage('login'), async (req, res, next) => {
  try {
    const { email, password } = req.body

    const { rows } = await pool.query(
      'SELECT id, business_name, password_hash, token_version FROM merchants WHERE lower(email) = $1',
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

    issueSession(res, merchant.id, merchant.token_version)
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
