import { timingSafeEqual } from 'crypto'

const adminKeysMatch = (provided, expected) => {
  if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) {
    return false
  }

  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) {
    return false
  }

  return timingSafeEqual(providedBuf, expectedBuf)
}

export const requireAdminKey = (req, res, next) => {
  if (!adminKeysMatch(req.headers['x-admin-key'], process.env.ADMIN_ACCESS_KEY)) {
    return res.status(401).json({ error: 'Not authorized.' })
  }
  next()
}
