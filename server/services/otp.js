import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { pool } from '../db/database.js'

const OTP_TTL_MINUTES = 10
const COOLDOWN_SECONDS = 60
const MAX_ATTEMPTS = 5
const ACTION_TOKEN_TTL = '15m'
const DAILY_CODE_LIMIT = 5

export const OTP_COOLDOWN_SECONDS = COOLDOWN_SECONDS
export const INVALID_CODE_MESSAGE = 'Code is invalid or expired.'

// HMAC with a server-side secret, so a leaked database row cannot be brute-forced offline (a code has only 10^6
// values). Fails closed: there is deliberately no fallback key.
export const hashOtpCode = (purpose, email, code) => {
  const secret = process.env.OTP_HMAC_SECRET
  if (!secret) throw new Error('OTP_HMAC_SECRET is not set.')
  return crypto.createHmac('sha256', secret).update(`${purpose}:${email}:${code}`).digest('hex')
}

export const deleteOldOtps = () => pool.query("DELETE FROM email_otps WHERE created_at < NOW() - INTERVAL '24 hours'")

// Returns the plaintext code ONLY so the caller can pass it to sendEmail. It is never logged or put in a response.
// Throws an error with status 429 and retryAfter (seconds) while a recent code is still within the resend cooldown.
export const issueOtp = async ({ email, purpose, merchantId = null, dailyLimit = DAILY_CODE_LIMIT }) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialises concurrent requests for the same email+purpose so the cooldown cannot be raced.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp:${purpose}:${email}`])

    // Daily cap per email and purpose, whatever the source address. Counts every row created in the last 24 hours
    // (used, voided or expired alike); deleteOldOtps removes only rows older than 24 hours, so this cannot undercount.
    const { rows: daily } = await client.query(
      `SELECT COUNT(*)::int AS sent,
              CEIL(EXTRACT(EPOCH FROM (MIN(created_at) + INTERVAL '24 hours' - NOW())))::int AS retry_after
         FROM email_otps
        WHERE email = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '24 hours'`,
      [email, purpose],
    )
    if (daily[0].sent >= dailyLimit) {
      const err = new Error('Too many codes requested for this email. Please try again tomorrow.')
      err.status = 429
      err.retryAfter = Math.max(1, daily[0].retry_after)
      throw err
    }

    const { rows: recent } = await client.query(
      `SELECT CEIL(EXTRACT(EPOCH FROM (last_sent_at + make_interval(secs => $3) - NOW())))::int AS retry_after
         FROM email_otps
        WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > NOW()
          AND last_sent_at > NOW() - make_interval(secs => $3)
        ORDER BY id DESC LIMIT 1`,
      [email, purpose, COOLDOWN_SECONDS],
    )
    if (recent.length > 0) {
      const err = new Error('Please wait before requesting another code.')
      err.status = 429
      err.retryAfter = Math.max(1, recent[0].retry_after)
      throw err
    }

    await client.query(
      'UPDATE email_otps SET consumed_at = NOW() WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL',
      [email, purpose],
    )

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    await client.query(
      `INSERT INTO email_otps (email, purpose, merchant_id, code_hash, expires_at, last_sent_at)
       VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5), NOW())`,
      [email, purpose, merchantId, hashOtpCode(purpose, email, code), OTP_TTL_MINUTES],
    )

    await client.query('COMMIT')
    deleteOldOtps().catch(() => {})
    return code
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Marks a code used up without verifying it; for when the email could not be sent, so the user is not
// stuck behind a cooldown for a code that never arrived.
export const voidOtp = ({ email, purpose }) =>
  pool.query('UPDATE email_otps SET consumed_at = NOW() WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL', [email, purpose])

// true on a match (the code is consumed); false for wrong, expired, missing, locked or already used: callers
// show one generic message for all of them.
export const verifyOtp = async ({ email, purpose, code, merchantId = null }) => {
  const { rows } = await pool.query(
    `SELECT id, code_hash FROM email_otps
      WHERE email = $1 AND purpose = $2 AND merchant_id IS NOT DISTINCT FROM $3
        AND consumed_at IS NULL AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [email, purpose, merchantId],
  )
  if (rows.length === 0) return false

  // Counts the attempt and enforces the cap in one statement, so parallel guesses cannot exceed it.
  const { rowCount } = await pool.query(
    'UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2',
    [rows[0].id, MAX_ATTEMPTS],
  )
  if (rowCount === 0) return false

  const expected = Buffer.from(rows[0].code_hash, 'hex')
  const actual = Buffer.from(hashOtpCode(purpose, email, code), 'hex')
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false

  // Single use: only one concurrent request can flip consumed_at.
  const { rowCount: consumed } = await pool.query(
    'UPDATE email_otps SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL',
    [rows[0].id],
  )
  return consumed === 1
}

// Short-lived tokens that carry the result of an OTP step to the next request. The audience binds each token
// to one purpose, so a signup token cannot be used as a reset token (or as a session) and vice versa.
export const signActionToken = (payload, purpose) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACTION_TOKEN_TTL,
    audience: `eventflow:${purpose}`,
  })

// Returns the decoded payload, or null when the token is invalid, expired or for another purpose.
export const verifyActionToken = (token, purpose) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: `eventflow:${purpose}`,
    })
  } catch {
    return null
  }
}
