const BASE = 'http://localhost:3001'
const PASSWORD = 'testpass123'

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})

const cookies = login.headers.getSetCookie()
console.log('Status:', login.status)
console.log('Set-Cookie:', cookies)
for (const c of cookies) {
  const lower = c.toLowerCase()
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
