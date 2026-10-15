import { DEMO_MERCHANTS, DEMO_PASSWORD } from '../../db/seedMerchants.js'

export const VERIFY_API_BASE = process.env.VERIFY_API_URL || 'http://127.0.0.1:3001/api'

// Verify scripts log in as the first seeded demo merchant (db/seedMerchants.js) unless told otherwise.
export const VERIFY_LOGIN_EMAIL = process.env.VERIFY_LOGIN_EMAIL || DEMO_MERCHANTS[0].email

export const resolveVerifyPassword = () => {
  const flagIndex = process.argv.indexOf('--password')
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1]
  }
  return process.env.VERIFY_TEST_PASSWORD || DEMO_PASSWORD
}

export const loginVerifySession = async (password = resolveVerifyPassword()) => {
  const res = await fetch(`${VERIFY_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: VERIFY_LOGIN_EMAIL, password }),
  })
  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`)
  }
  const cookieHeader = (res.headers.getSetCookie?.() ?? [])
    .map((raw) => raw.split(';')[0])
    .join('; ')
  return { cookieHeader, password }
}

export const authFetch = (cookieHeader, path, options = {}) =>
  fetch(`${VERIFY_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(options.headers || {}),
    },
  })

export const readJson = async (res) => {
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}
