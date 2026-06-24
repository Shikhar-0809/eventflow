import { readFileSync, unlinkSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const credentialPath = join(root, '.dev-login-credential')
const BASE = 'http://localhost:3001/api'

const cleanup = () => {
  if (existsSync(credentialPath)) unlinkSync(credentialPath)
}

if (!existsSync(credentialPath)) {
  console.error('BLOCKED: missing dev credential file for one-time verify')
  process.exit(2)
}

const password = readFileSync(credentialPath, 'utf8')

const meUnauth = await fetch(`${BASE}/auth/me`)
const health = await fetch(`${BASE}/health`)

const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password }),
})

const loginOk = loginRes.status === 200
const setCookie = loginRes.headers.getSetCookie?.() ?? []
const cookie = setCookie.map((c) => c.split(';')[0]).join('; ')

let meAuthedStatus = 0
if (loginOk && cookie) {
  const meAuthed = await fetch(`${BASE}/auth/me`, {
    headers: { Cookie: cookie },
  })
  meAuthedStatus = meAuthed.status
}

cleanup()

console.log(
  JSON.stringify(
    {
      health: health.status,
      meUnauthenticated: meUnauth.status,
      login: loginRes.status,
      meAuthenticated: meAuthedStatus,
      pass:
        health.status === 200 &&
        meUnauth.status === 401 &&
        loginRes.status === 200 &&
        meAuthedStatus === 200,
    },
    null,
    2,
  ),
)

if (
  health.status !== 200 ||
  meUnauth.status !== 401 ||
  loginRes.status !== 200 ||
  meAuthedStatus !== 200
) {
  process.exit(1)
}
