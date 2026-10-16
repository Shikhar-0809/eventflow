// Test helper for verify scripts: plants a signup OTP with a KNOWN code straight into the dev database, so a script
// can run the real send -> verify -> signup flow without reading an inbox or the server log.
// It lives in scripts/ and imports refuseProductionDatabase.mjs, so it cannot run against the production database;
// the server itself has no test-only code path. The code is hashed with the server's own hashOtpCode, so the
// script needs OTP_HMAC_SECRET in the environment, like the server.
import './refuseProductionDatabase.mjs'
import { hashOtpCode } from '../../services/otp.js'

if (process.env.NODE_ENV === 'production') {
  throw new Error('devOtp must never run with NODE_ENV=production.')
}

export const plantSignupOtp = async (pool, email, code = '424242') => {
  const hash = hashOtpCode('signup', email, code)
  await pool.query("UPDATE email_otps SET consumed_at = NOW() WHERE email = $1 AND purpose = 'signup' AND consumed_at IS NULL", [email])
  await pool.query(
    `INSERT INTO email_otps (email, purpose, code_hash, expires_at, last_sent_at)
     VALUES ($1, 'signup', $2, NOW() + INTERVAL '10 minutes', NOW())`,
    [email, hash],
  )
  return code
}

// Any purpose: 'signup' | 'reset' | 'reset_password' (profile) | 'change_email' (profile, with the merchant's id).
// A change_email code is stored under the NEW address, like the server does; the server issues its own code after it
// has replied, so a script waits about 2.5 seconds after the send before planting.
export const plantOtp = async (pool, { email, purpose, code = '424242', merchantId = null }) => {
  await pool.query('UPDATE email_otps SET consumed_at = NOW() WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL', [email, purpose])
  await pool.query(
    `INSERT INTO email_otps (email, purpose, merchant_id, code_hash, expires_at, last_sent_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes', NOW())`,
    [email, purpose, merchantId, hashOtpCode(purpose, email, code)],
  )
  return code
}

export const deleteOtpsFor = (pool, emailSuffix) => pool.query('DELETE FROM email_otps WHERE email LIKE $1', [`%${emailSuffix}`])
