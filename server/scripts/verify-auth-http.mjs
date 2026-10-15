// RUN THIS LAST. It deliberately exhausts the login rate limiter, so every login-dependent script that runs after
// it against the same server session fails with 429. Run it on its own fresh server, after all the others.
// The password comes from server/.dev-login-credential (or --password), never from this file.
import { resolveVerifyPassword } from './lib/verifyScriptAuth.mjs'

const BASE = 'http://localhost:3001'
const COOKIE_NAME = 'eventflow_session'
const PASSWORD = resolveVerifyPassword()

const results = []

const record = (id, name, passed, detail = '') => {
  results.push({ id, name, passed, detail })
  const status = passed ? 'PASS' : 'FAIL'
  console.log(`[${status}] ${id}. ${name}${detail ? ` — ${detail}` : ''}`)
}

const request = async (method, path, { body, cookie, headers = {} } = {}) => {
  const opts = {
    method,
    headers: { ...headers },
  }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  if (cookie) {
    opts.headers.Cookie = `${COOKIE_NAME}=${cookie}`
  }

  const res = await fetch(`${BASE}${path}`, opts)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { _raw: text }
  }

  const setCookie = res.headers.getSetCookie?.() ?? []
  return { status: res.status, json, text, setCookie, headers: res.headers }
}

const run = async () => {
  // 1. Correct login
  const loginOk = await request('POST', '/api/auth/login', { body: { password: PASSWORD } })
  const hasSetCookie = loginOk.setCookie.some((c) => c.startsWith(`${COOKIE_NAME}=`))
  const sessionToken = loginOk.setCookie
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.split(';')[0]
    ?.split('=')[1]

  record(
    1,
    'POST /api/auth/login correct password → 200 + Set-Cookie',
    loginOk.status === 200
      && loginOk.json?.authenticated === true
      && hasSetCookie,
    `status=${loginOk.status}, setCookie=${hasSetCookie}, body=${JSON.stringify(loginOk.json)}`,
  )

  // 2. Wrong password
  const loginBad = await request('POST', '/api/auth/login', { body: { password: 'wrong' } })
  record(
    2,
    'POST /api/auth/login wrong password → 401 exact message',
    loginBad.status === 401 && loginBad.json?.error === 'Incorrect password.',
    `status=${loginBad.status}, body=${JSON.stringify(loginBad.json)}`,
  )

  // 3. GET /me no cookie
  const meNoCookie = await request('GET', '/api/auth/me')
  record(
    3,
    'GET /api/auth/me no cookie → 401 exact message',
    meNoCookie.status === 401 && meNoCookie.json?.error === 'You must be logged in to do that.',
    `status=${meNoCookie.status}, body=${JSON.stringify(meNoCookie.json)}`,
  )

  // 4. GET /me valid session
  const meOk = await request('GET', '/api/auth/me', { cookie: sessionToken })
  record(
    4,
    'GET /api/auth/me valid cookie → 200',
    meOk.status === 200 && meOk.json?.authenticated === true,
    `status=${meOk.status}, body=${JSON.stringify(meOk.json)}`,
  )

  // 5. GET /me garbage cookie
  const meGarbage = await request('GET', '/api/auth/me', { cookie: 'not.a.valid.jwt.token' })
  record(
    5,
    'GET /api/auth/me garbage cookie → 401 expired message',
    meGarbage.status === 401 && meGarbage.json?.error === 'Your session has expired. Please log in again.',
    `status=${meGarbage.status}, body=${JSON.stringify(meGarbage.json)}`,
  )

  // 10. Rate limiter — 4 more wrong attempts (already did 1 wrong in step 2) = 5 total, then 6th should 429
  for (let i = 0; i < 4; i++) {
    await request('POST', '/api/auth/login', { body: { password: 'wrong' } })
  }
  const rateLimited = await request('POST', '/api/auth/login', { body: { password: 'wrong' } })
  record(
    10,
    'loginRateLimiter 6th failed attempt → 429 exact message',
    rateLimited.status === 429
      && rateLimited.json?.error === 'Too many login attempts. Please try again in 15 minutes.',
    `status=${rateLimited.status}, body=${JSON.stringify(rateLimited.json)}`,
  )

  console.log('\n--- Summary ---')
  const failed = results.filter((r) => !r.passed)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f.id).join(', '))
    process.exit(1)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
