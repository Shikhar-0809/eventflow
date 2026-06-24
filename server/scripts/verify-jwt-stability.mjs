/**
 * Verify JWT sessions survive consecutive server restarts when only server/.env supplies secrets.
 * Usage: node scripts/verify-jwt-stability.mjs <cookie-value>
 * Cookie should be a session JWT created before the first restart (e.g. from POST /api/auth/login).
 */
import 'dotenv/config'

const BASE = 'http://localhost:3001'
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'eventflow_session'
const token = process.argv[2]

if (!token) {
  console.error('Usage: node scripts/verify-jwt-stability.mjs <session-jwt>')
  process.exit(1)
}

const res = await fetch(`${BASE}/api/auth/me`, {
  headers: { Cookie: `${COOKIE_NAME}=${token}` },
})

const body = await res.json().catch(() => ({}))
console.log(JSON.stringify({ status: res.status, body }))
