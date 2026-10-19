// Dev databases only (BUGS #103): --confirm-host=<dev db host> is required and the production host is refused.
import './lib/guardFirst.mjs'
import './lib/refuseProductionDatabase.mjs'
import { resolveVerifyPassword, VERIFY_LOGIN_EMAIL } from './lib/verifyScriptAuth.mjs'
const BASE = 'http://localhost:3001'
const PASSWORD = resolveVerifyPassword()

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: VERIFY_LOGIN_EMAIL, password: PASSWORD }),
})

const cookies = login.headers.getSetCookie()
console.log('Status:', login.status)
console.log('Cookie present:', cookies.length > 0)
for (const c of cookies) {
  const lower = c.toLowerCase()
  const cookieName = c.split('=')[0]?.trim()
  console.log('Cookie name:', cookieName)
  console.log('httpOnly:', lower.includes('httponly'))
  console.log('sameSite:', /samesite=(\w+)/i.exec(c)?.[1])
  console.log('secure:', lower.includes('secure'))
}

const badJson = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{bad json',
})
console.log('Dev malformed JSON:', badJson.status, await badJson.json())
