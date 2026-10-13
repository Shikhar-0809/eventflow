import { timingSafeEqual } from 'crypto'

const secretsMatch = (provided, expected) => {
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

// "report" is the only value that relaxes the lock; unset or anything else enforces (fail closed).
const lockMode = () => (process.env.PROXY_LOCK_MODE === 'report' ? 'report' : 'enforce')

// Production only: the Render API accepts requests that came through the Vercel proxy,
// which adds x-proxy-secret. GET /api/health stays open for Render's health check.
// enforce: a missing or wrong header gets 403.
// report: same check, always continues, and logs one line per request (staged rollout).
// The header value, its length and other headers are never logged or echoed.
export const requireProxySecret = (req, res, next) => {
  if (req.method === 'GET' && req.path === '/api/health') {
    return next()
  }

  const pass = secretsMatch(req.headers['x-proxy-secret'], process.env.PROXY_SHARED_SECRET)

  if (lockMode() === 'report') {
    console.log(`proxy_lock check=${pass ? 'pass' : 'fail'} path=${req.path}`)
    return next()
  }

  if (!pass) {
    return res.status(403).json({ error: 'Not found.' })
  }
  next()
}
