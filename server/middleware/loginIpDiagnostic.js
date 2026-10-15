import crypto from 'node:crypto'

// TEMPORARY (BUGS #079): re-measure the proxy hop count in production. Remove this file, its mount in
// routes/auth.js, the env var in .env.example and the SECURITY.md note once trust proxy is corrected.
//
// Only active when LOGIN_IP_DIAG=1. On POST /api/auth/login it logs one line:
//   login_ip_diag xff_entries=<n> ip_hash=<8 hex chars>
// - xff_entries: how many addresses the X-Forwarded-For header holds (BUGS #040 expected 4: client, Vercel,
//   Cloudflare, Render LB; the socket is the fifth hop and is not in the header). trust proxy = 4 only gives the
//   real visitor IP when that count is 4.
// - ip_hash: SHA-256 of req.ip with a random per-boot salt, first 8 hex chars. The same visitor gives the same
//   hash within one server run, so two devices on different networks showing the SAME hash means req.ip is shared.
// The address itself, the header contents and the email are never logged. Logs the request once, before the
// rate limiters, so blocked attempts are measured too.
const salt = crypto.randomBytes(16)

export const loginIpDiagnostic = (req, res, next) => {
  if (process.env.LOGIN_IP_DIAG === '1') {
    const forwarded = req.headers['x-forwarded-for']
    const entries = typeof forwarded === 'string' && forwarded.trim() !== '' ? forwarded.split(',').length : 0
    const hash = crypto.createHmac('sha256', salt).update(String(req.ip)).digest('hex').slice(0, 8)
    console.log(`login_ip_diag xff_entries=${entries} ip_hash=${hash}`)
  }
  next()
}
