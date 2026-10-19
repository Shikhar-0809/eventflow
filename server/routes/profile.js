import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db/database.js'
import {
  otpSendIpBackstopLimiter,
  otpSendLimiters,
  otpVerifyLimiter,
  profileSensitiveLimiter,
} from '../middleware/rateLimiter.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { trackUsage } from '../middleware/trackUsage.js'
import { validate } from '../middleware/validate.js'
import {
  profileBusinessSchema,
  profileDeleteSchema,
  profileEmailSendSchema,
  profileEmailVerifySchema,
  profilePasswordSchema,
  profileResetVerifySchema,
} from '../schemas/merchant.schema.js'
import { changeEmailCodeEmail, resetPasswordCodeEmail, sendEmail, sendSecurityNotice } from '../services/email.js'
import {
  INVALID_CODE_MESSAGE,
  OTP_COOLDOWN_SECONDS,
  issueOtp,
  verifyOtp,
  voidOtp,
} from '../services/otp.js'
import { bumpTokenVersion, clearSession, issueSession } from '../services/session.js'
import { maskEmail } from '../utils/maskEmail.js'
import { todayISO } from '../services/merchantTime.js'

const BCRYPT_COST = 10
const CHANGE_EMAIL_DAILY_LIMIT = 3
const WRONG_PASSWORD = 'Incorrect password.' // nosemgrep: ajinabraham.njsscan.generic.hardcoded_secrets.node_password -- error message text, not a credential
const CHANGE_EMAIL_MESSAGE = 'If that address can receive mail, a code is on its way.'
const EMAIL_UNAVAILABLE = 'That email address cannot be used. Please try another.'

const router = Router()
router.use(requireAuth)

// The email is stored lowercased; lower() also covers a row written before that rule.
const loadAccount = async (merchantId) => {
  const { rows } = await pool.query(
    'SELECT lower(email) AS email, password_hash, business_name FROM merchants WHERE id = $1',
    [merchantId],
  )
  return rows[0] ?? null
}

const passwordMatches = async (account, password) =>
  Boolean(account?.password_hash) && (await bcrypt.compare(password, account.password_hash))

// A notice failing never affects the response, which has already been sent. Merchant id only in the log line.
const sendNoticeLater = (merchantId, email, kind, details) => {
  if (!email) return
  sendSecurityNotice(email, kind, details).catch(() => {
    console.error(`security notice ${kind} failed for merchant ${merchantId}`)
  })
}

// The send step of an OTP flow: the reply is a 429 with the seconds left while a recent code is cooling down.
const sendRetryAfter = (err, res) => {
  if (err.status !== 429 || !err.retryAfter) return false
  res.set('Retry-After', String(err.retryAfter)) // nosemgrep: ajinabraham.njsscan.headers.header_injection.generic_header_injection -- numeric seconds from our own limiter, never user input
  res.status(429).json({ error: err.message, retryAfter: err.retryAfter })
  return true
}

const getProfile = async (merchantId) => {
  // event_date is stored as YYYY-MM-DD text, so "today" is the merchant's calendar date (services/merchantTime.js), compared as text.
  const { rows } = await pool.query(
    `SELECT m.email, m.created_at, m.password_changed_at, m.business_name, m.whatsapp_phone,
            (SELECT COUNT(*)::int FROM bookings b WHERE b.merchant_id = m.id) AS bookings,
            (SELECT COUNT(*)::int FROM bookings b
              WHERE b.merchant_id = m.id AND b.status IN ('confirmed', 'pending')
                AND b.event_date >= $2) AS upcoming,
            (SELECT COUNT(*)::int FROM inventory_items i WHERE i.merchant_id = m.id) AS inventory_items,
            (SELECT COUNT(DISTINCT b.phone)::int FROM bookings b WHERE b.merchant_id = m.id) AS clients
       FROM merchants m
      WHERE m.id = $1`,
    [merchantId, todayISO()],
  )
  const row = rows[0]
  return {
    email_masked: maskEmail(row.email ?? ''),
    member_since: row.created_at,
    password_changed_at: row.password_changed_at,
    business_name: row.business_name,
    whatsapp_phone: row.whatsapp_phone,
    summary: { bookings: row.bookings, upcoming: row.upcoming, inventory_items: row.inventory_items, clients: row.clients },
  }
}

// Sets the new password and ends every other session in one transaction. `expectedHash`, when given, makes the update
// conditional on the password not having changed since it was checked; returns false then (nothing changed).
// On success the response carries this device's fresh cookie and the stored email is returned for the notice.
const applyNewPassword = async (res, merchantId, newPassword, expectedHash = null) => {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE merchants SET password_hash = $1, password_changed_at = NOW()
        WHERE id = $2 AND ($3::text IS NULL OR password_hash = $3)
        RETURNING lower(email) AS email`,
      [passwordHash, merchantId, expectedHash],
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }
    const tokenVersion = await bumpTokenVersion(client, merchantId)
    await client.query('COMMIT')
    // Only now is the change durable; a failure anywhere above never reaches the cookie.
    issueSession(res, merchantId, tokenVersion)
    return { email: rows[0].email }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

router.get('/', async (req, res, next) => {
  try {
    res.status(200).json(await getProfile(req.merchantId))
  } catch (err) {
    next(err)
  }
})

router.patch('/business', validate(profileBusinessSchema), async (req, res, next) => {
  try {
    const { business_name, whatsapp_phone } = req.body
    // A missing whatsapp_phone key keeps the stored value; null (or '') clears it.
    const phoneGiven = whatsapp_phone !== undefined
    await pool.query(
      `UPDATE merchants
          SET business_name = $2,
              whatsapp_phone = CASE WHEN $3::boolean THEN $4 ELSE whatsapp_phone END
        WHERE id = $1`,
      [req.merchantId, business_name, phoneGiven, phoneGiven ? whatsapp_phone : null],
    )
    res.status(200).json(await getProfile(req.merchantId))
  } catch (err) {
    next(err)
  }
})

router.get('/sign-ins', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT device_label, created_at FROM sign_in_log
        WHERE merchant_id = $1 ORDER BY created_at DESC, id DESC LIMIT 10`,
      [req.merchantId],
    )
    res.status(200).json(rows)
  } catch (err) {
    next(err)
  }
})

router.post('/password', profileSensitiveLimiter, validate(profilePasswordSchema), trackUsage('password_changed'), async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body
    const account = await loadAccount(req.merchantId)
    if (!(await passwordMatches(account, current_password))) {
      return res.status(401).json({ error: WRONG_PASSWORD })
    }
    if (new_password === current_password) {
      return res.status(400).json({ error: 'Your new password must be different from your current password.' })
    }

    const result = await applyNewPassword(res, req.merchantId, new_password, account.password_hash)
    if (!result) {
      // The password changed between the check and the update (another request won). Nothing was changed here.
      return res.status(409).json({ error: 'Your password was just changed. Please try again.' })
    }

    res.status(200).json({ changed: true })
    sendNoticeLater(req.merchantId, result.email, 'password_changed')
  } catch (err) {
    next(err)
  }
})

// Codes only ever go to the stored address: the body carries no email.
router.post('/password/reset/send', otpSendIpBackstopLimiter, otpSendLimiters.reset_password, async (req, res, next) => {
  try {
    const account = await loadAccount(req.merchantId)
    if (!account?.email) {
      return res.status(400).json({ error: 'There is no email address on this account.' })
    }

    const code = await issueOtp({ email: account.email, purpose: 'reset_password', merchantId: req.merchantId })
    try {
      await sendEmail({ to: account.email, ...resetPasswordCodeEmail(code) })
    } catch {
      // The code never arrived, so do not make the merchant wait out the cooldown for it.
      await voidOtp({ email: account.email, purpose: 'reset_password' }).catch(() => {})
      console.error(`reset_password OTP email failed for merchant ${req.merchantId}`)
      return res.status(502).json({ error: 'We could not send the email. Please try again.' })
    }

    res.status(200).json({ sent: true, cooldownSeconds: OTP_COOLDOWN_SECONDS, email_masked: maskEmail(account.email) })
  } catch (err) {
    if (sendRetryAfter(err, res)) return
    next(err)
  }
})

router.post(
  '/password/reset/verify',
  otpVerifyLimiter,
  validate(profileResetVerifySchema),
  trackUsage('password_changed'),
  async (req, res, next) => {
    try {
      const { code, new_password } = req.body
      const account = await loadAccount(req.merchantId)
      if (!account?.email) return res.status(400).json({ error: INVALID_CODE_MESSAGE })

      const ok = await verifyOtp({ email: account.email, purpose: 'reset_password', code, merchantId: req.merchantId })
      if (!ok) return res.status(400).json({ error: INVALID_CODE_MESSAGE })

      const result = await applyNewPassword(res, req.merchantId, new_password)
      if (!result) return res.status(400).json({ error: INVALID_CODE_MESSAGE })

      res.status(200).json({ changed: true })
      sendNoticeLater(req.merchantId, result.email, 'password_changed')
    } catch (err) {
      next(err)
    }
  },
)

router.post('/logout-others', trackUsage('sessions_revoked'), async (req, res, next) => {
  try {
    issueSession(res, req.merchantId, await bumpTokenVersion(pool, req.merchantId))
    res.status(200).json({ revoked: true })
  } catch (err) {
    next(err)
  }
})

// Same 200 whether or not the new address is already registered (this deliberately does NOT repeat BUGS #073).
// The only work before the reply is the lookup; issuing and sending happen after it, so timing does not tell either.
router.post(
  '/email/send',
  profileSensitiveLimiter,
  otpSendIpBackstopLimiter,
  otpSendLimiters.change_email,
  validate(profileEmailSendSchema),
  async (req, res, next) => {
    try {
      const { current_password, new_email } = req.body
      const account = await loadAccount(req.merchantId)
      if (!(await passwordMatches(account, current_password))) {
        return res.status(401).json({ error: WRONG_PASSWORD })
      }
      if (new_email === account.email) {
        return res.status(400).json({ error: 'That is already your email address.' })
      }

      const { rows: taken } = await pool.query('SELECT 1 FROM merchants WHERE lower(email) = $1', [new_email])

      res.status(200).json({ sent: true, cooldownSeconds: OTP_COOLDOWN_SECONDS, message: CHANGE_EMAIL_MESSAGE })
      if (taken.length > 0) return

      try {
        // One pending change at a time: an older code for a different address stops working.
        await pool.query(
          `UPDATE email_otps SET consumed_at = NOW()
            WHERE merchant_id = $1 AND purpose = 'change_email' AND consumed_at IS NULL AND email <> $2`,
          [req.merchantId, new_email],
        )
        // The pending address is the OTP row's own email column: stored server-side, never in a client-held token.
        const code = await issueOtp({
          email: new_email,
          purpose: 'change_email',
          merchantId: req.merchantId,
          dailyLimit: CHANGE_EMAIL_DAILY_LIMIT,
        })
        try {
          await sendEmail({ to: new_email, ...changeEmailCodeEmail(code) })
        } catch (err) {
          await voidOtp({ email: new_email, purpose: 'change_email' }).catch(() => {})
          throw err
        }
      } catch (err) {
        // Cooldown and daily cap are silent (the reply was identical by design). Never log the address or the code.
        if (err.status !== 429) console.error(`change_email OTP failed for merchant ${req.merchantId}`)
      }
    } catch (err) {
      next(err)
    }
  },
)

router.post('/email/verify', otpVerifyLimiter, validate(profileEmailVerifySchema), trackUsage('email_changed'), async (req, res, next) => {
  let client
  try {
    const { code } = req.body

    const { rows: pending } = await pool.query(
      `SELECT email FROM email_otps
        WHERE merchant_id = $1 AND purpose = 'change_email' AND consumed_at IS NULL AND expires_at > NOW()
        ORDER BY id DESC LIMIT 1`,
      [req.merchantId],
    )
    if (pending.length === 0) return res.status(400).json({ error: INVALID_CODE_MESSAGE })
    const newEmail = pending[0].email

    if (!(await verifyOtp({ email: newEmail, purpose: 'change_email', code, merchantId: req.merchantId }))) {
      return res.status(400).json({ error: INVALID_CODE_MESSAGE })
    }

    client = await pool.connect()
    await client.query('BEGIN')
    const { rows: old } = await client.query('SELECT lower(email) AS email FROM merchants WHERE id = $1 FOR UPDATE', [req.merchantId])
    try {
      // Uniqueness is re-checked here by the unique index: someone may have registered the address since the code was sent.
      await client.query('UPDATE merchants SET email = $1 WHERE id = $2', [newEmail, req.merchantId])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      if (err.code === '23505') return res.status(409).json({ error: EMAIL_UNAVAILABLE })
      throw err
    }
    const tokenVersion = await bumpTokenVersion(client, req.merchantId)
    await client.query('COMMIT')
    issueSession(res, req.merchantId, tokenVersion)

    res.status(200).json({ email_masked: maskEmail(newEmail) })
    sendNoticeLater(req.merchantId, old[0]?.email, 'email_changed', { newEmail })
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    if (client) client.release()
  }
})

// Every merchant-scoped table, written out by hand in foreign-key-safe order (children before parents).
// When a table with a merchant_id column is added, it MUST be added here (CLAUDE.md; verify-profile-api.mjs fails if not).
// email_otps is keyed on the merchant's email (signup / reset rows have no merchant_id), plus any pending change-email row.
router.delete('/', profileSensitiveLimiter, validate(profileDeleteSchema), async (req, res, next) => {
  let client
  try {
    const { current_password, confirm_business_name } = req.body
    const account = await loadAccount(req.merchantId)
    if (!(await passwordMatches(account, current_password))) {
      return res.status(401).json({ error: WRONG_PASSWORD })
    }
    if (!account.business_name || confirm_business_name !== account.business_name.trim()) {
      return res.status(400).json({ error: 'The business name you typed does not match.' })
    }

    const merchantId = req.merchantId
    const email = account.email

    client = await pool.connect()
    await client.query('BEGIN')
    // Blocks a concurrent insert (a booking created mid-delete) from slipping in after its table was emptied.
    await client.query('SELECT 1 FROM merchants WHERE id = $1 FOR UPDATE', [merchantId])
    await client.query('DELETE FROM booking_inventory WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM booking_expenses WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM change_log WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM bookings WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM inventory_damage_log WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM inventory_items WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM merchant_settings WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM event_log WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM sign_in_log WHERE merchant_id = $1', [merchantId])
    await client.query('DELETE FROM email_otps WHERE lower(email) = $1 OR merchant_id = $2', [email, merchantId])
    const { rowCount } = await client.query('DELETE FROM merchants WHERE id = $1', [merchantId])
    if (rowCount !== 1) throw new Error('Account delete removed an unexpected number of merchants.')
    await client.query('COMMIT')

    clearSession(res)
    res.status(200).json({ deleted: true })
    sendNoticeLater(merchantId, email, 'account_deleted')
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    if (client) client.release()
  }
})

export default router
