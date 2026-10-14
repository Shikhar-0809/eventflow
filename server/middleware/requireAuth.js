import jwt from 'jsonwebtoken'
import { pool } from '../db/database.js'

const SESSION_EXPIRED = 'Your session has expired. Please log in again.'

// Verifies the session cookie and tells every later handler which merchant is logged in.
// req.merchantId comes ONLY from the signed token. Never read a merchant id from the body, query or params.
export const requireAuth = async (req, res, next) => {
  const token = req.cookies[process.env.SESSION_COOKIE_NAME]

  if (!token) {
    return res.status(401).json({ error: 'You must be logged in to do that.' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(401).json({ error: SESSION_EXPIRED })
  }

  // Tokens issued before merchants existed carry no merchant_id: force a fresh login.
  const merchantId = payload?.merchant_id
  if (!Number.isInteger(merchantId) || merchantId <= 0) {
    return res.status(401).json({ error: SESSION_EXPIRED })
  }

  try {
    const { rows } = await pool.query('SELECT 1 FROM merchants WHERE id = $1', [merchantId])
    if (rows.length === 0) {
      return res.status(401).json({ error: SESSION_EXPIRED })
    }
  } catch (err) {
    return next(err)
  }

  req.merchantId = merchantId
  next()
}
