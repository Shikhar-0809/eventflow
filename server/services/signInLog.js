import { pool } from '../db/database.js'
import { deviceLabel } from '../utils/deviceLabel.js'

const KEEP = 10

// Inserts one row (coarse device label only: no IP, no user agent), then trims the merchant to its newest KEEP rows,
// in one transaction. The advisory lock keeps two simultaneous logins from racing the trim.
const writeSignIn = async (merchantId, userAgent) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sign_in_log:${merchantId}`])
    await client.query('INSERT INTO sign_in_log (merchant_id, device_label) VALUES ($1, $2)', [merchantId, deviceLabel(userAgent)])
    await client.query(
      `DELETE FROM sign_in_log
        WHERE merchant_id = $1
          AND id NOT IN (SELECT id FROM sign_in_log WHERE merchant_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2)`,
      [merchantId, KEEP],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Fire-and-forget: returns nothing to await, and a failure can never break the login that called it.
// The failure is logged with the merchant id and the error code only: never the user agent or an email.
export const recordSignIn = (merchantId, userAgent) => {
  writeSignIn(merchantId, userAgent).catch((err) => {
    console.error(`sign-in log failed for merchant ${merchantId}: ${err.code ?? 'error'}`)
  })
}
