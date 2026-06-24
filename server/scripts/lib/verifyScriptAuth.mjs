import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
export const VERIFY_API_BASE = process.env.VERIFY_API_URL || 'http://127.0.0.1:3001/api'
export const CREDENTIAL_PATH = join(scriptsDir, '..', '..', '.dev-login-credential')

export const resolveVerifyPassword = () => {
  const flagIndex = process.argv.indexOf('--password')
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1]
  }
  if (existsSync(CREDENTIAL_PATH)) {
    return readFileSync(CREDENTIAL_PATH, 'utf8').trim()
  }
  console.error(
    'Missing password. Run server/scripts/set-dev-merchant-hash.mjs or pass --password yourpassword',
  )
  process.exit(1)
}

export const loginVerifySession = async (password = resolveVerifyPassword()) => {
  const res = await fetch(`${VERIFY_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
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
