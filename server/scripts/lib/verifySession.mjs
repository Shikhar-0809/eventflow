import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), '..')
export const VERIFY_SESSION_CACHE_PATH = join(scriptsDir, '.verify-session-cache.json')

export const VERIFY_API_BASE = process.env.VERIFY_API_URL || 'http://localhost:3001/api'
export const VERIFY_FRONTEND_URL = process.env.VERIFY_FRONTEND_URL || 'http://localhost:5173'
export const VERIFY_TEST_PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'agrHXfapYOyJ-oP3'

const parseSetCookieHeader = (raw, frontendUrl) => {
  const [pair, ...attrs] = raw.split(';')
  const eq = pair.indexOf('=')
  const name = pair.slice(0, eq)
  const value = pair.slice(eq + 1)
  const cookie = { name, value, url: frontendUrl }
  for (const attr of attrs) {
    const trimmed = attr.trim()
    const lower = trimmed.toLowerCase()
    if (lower === 'httponly') cookie.httpOnly = true
    else if (lower === 'secure') cookie.secure = true
    else if (lower.startsWith('samesite=')) {
      const sameSite = trimmed.split('=')[1]?.toLowerCase()
      cookie.sameSite = sameSite === 'strict' ? 'Strict' : 'Lax'
    }
  }
  return cookie
}

const readCache = () => {
  if (!existsSync(VERIFY_SESSION_CACHE_PATH)) return null
  try {
    return JSON.parse(readFileSync(VERIFY_SESSION_CACHE_PATH, 'utf8'))
  } catch {
    return null
  }
}

const writeCache = (session) => {
  writeFileSync(VERIFY_SESSION_CACHE_PATH, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
}

export const invalidateVerifySessionCache = () => {
  if (existsSync(VERIFY_SESSION_CACHE_PATH)) unlinkSync(VERIFY_SESSION_CACHE_PATH)
}

const sessionIsValid = async (cookieHeader) => {
  if (!cookieHeader) return false
  try {
    const res = await fetch(`${VERIFY_API_BASE}/auth/me`, {
      headers: { Cookie: cookieHeader },
    })
    return res.status === 200
  } catch {
    return false
  }
}

const loginFresh = async () => {
  const loginRes = await fetch(`${VERIFY_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: VERIFY_TEST_PASSWORD }),
  })
  if (loginRes.status !== 200) {
    throw new Error(`Verify login failed: ${loginRes.status} ${await loginRes.text()}`)
  }

  const setCookie = loginRes.headers.getSetCookie?.() ?? []
  const cookieHeader = setCookie.map((raw) => raw.split(';')[0]).join('; ')
  const playwrightCookies = setCookie.map((raw) =>
    parseSetCookieHeader(raw, VERIFY_FRONTEND_URL),
  )

  const session = {
    cookieHeader,
    playwrightCookies,
    cachedAt: new Date().toISOString(),
  }
  writeCache(session)
  return session
}

/** One POST /auth/login per dev session (re-validated via /auth/me before reuse). */
export const getVerifySession = async ({ forceFresh = false } = {}) => {
  if (!forceFresh) {
    const cached = readCache()
    if (cached && (await sessionIsValid(cached.cookieHeader))) {
      return cached
    }
  }
  return loginFresh()
}

export const getVerifyCookieHeader = async (options) => {
  const session = await getVerifySession(options)
  return session.cookieHeader
}

export const applyVerifySessionToContext = async (context) => {
  const session = await getVerifySession()
  if (session.playwrightCookies.length) {
    await context.addCookies(session.playwrightCookies)
  }
  return session
}
