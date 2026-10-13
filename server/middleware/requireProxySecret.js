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

// Production only: the Render API accepts requests that came through the Vercel proxy,
// which adds x-proxy-secret. GET /api/health stays open for Render's health check.
// The header value is never logged or echoed.
export const requireProxySecret = (req, res, next) => {
  if (req.method === 'GET' && req.path === '/api/health') {
    return next()
  }
  if (!secretsMatch(req.headers['x-proxy-secret'], process.env.PROXY_SHARED_SECRET)) {
    return res.status(403).json({ error: 'Not found.' })
  }
  next()
}
