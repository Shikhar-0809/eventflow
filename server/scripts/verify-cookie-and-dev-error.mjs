const BASE = 'http://localhost:3001'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
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
