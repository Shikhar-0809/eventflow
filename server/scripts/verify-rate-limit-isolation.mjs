// Rate-limit isolation through the production-like proxy (BUGS #104): one client exhausting a limit must not block
// another client, login and forgot-password must not share a bucket, and every 429 our limiters send must be JSON
// with a readable `error` (so the client never falls back to the generic "Too many attempts..." text, which is what
// a platform-generated 429 without our JSON body produces).
//
//   npm run verify:ratelimit -- --confirm-host=<dev host>      (from server/)
//
// Dev databases only (refuses the production host outright; needs --confirm-host). It boots its own API server on a
// spare port with EMAIL_DEV_LOG=true (nothing is emailed) and puts scripts/lib/prodLikeProxy.mjs in front of it:
// the proxy turns each request's x-test-ip header into x-forwarded-for, like Vercel does for a real client, so two
// "clients" have two addresses. Only unknown fictional @ratelimit.example.test addresses are used, so no rows are
// written (login and the code routes only read for an unknown email). Counters live in the spawned server's memory
// and die with it. Output: PASS/FAIL per check; never real data.
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'
import { startProdLikeProxy } from './lib/prodLikeProxy.mjs'

assertConfirmedDatabaseHost()

const PORT = Number(process.env.RATELIMIT_PORT) || 3013
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.resolve(serverDir, '../client/dist') // only /api is used; any directory works as the static root

let failures = 0
let passes = 0
const check = (ok, name, detail = '') => {
  if (ok) passes += 1
  else failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  ' + detail : ''}`)
}
const info = (text) => console.log(`INFO  ${text}`)

let child = null
let proxy = null
const run = String(Date.now() % 100000)
// A fresh range of "client" addresses per run (TEST-NET-2, documentation addresses).
const ip = (n) => `198.51.100.${(Number(run) + n * 7) % 250 + 1}`
const email = (tag) => `${tag}-${run}@ratelimit.example.test`

const stopServer = async () => {
  if (child) { child.kill(); child = null }
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 300))
    try { await fetch(`http://127.0.0.1:${PORT}/api/health`) } catch { return true }
  }
  return false
}
const startServer = async () => {
  child = spawn('node', ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', EMAIL_DEV_LOG: 'true' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).status === 200) return true } catch { /* not up yet */ }
  }
  return false
}
process.on('exit', () => { try { child?.kill() } catch { /* already gone */ } })

let base = ''
const post = async (route, clientIp, body) => {
  const res = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-ip': clientIp },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, json, type: res.headers.get('content-type') ?? '' }
}
const login = (clientIp, addr) => post('/api/auth/login', clientIp, { email: addr, password: 'definitely-wrong' })
const forgotSend = (clientIp, addr) => post('/api/auth/forgot/send-otp', clientIp, { email: addr })
const forgotVerify = (clientIp, addr) => post('/api/auth/forgot/verify-otp', clientIp, { email: addr, code: '000000' })
const isOurs429 = (r) => r.status === 429 && r.type.includes('application/json') && typeof r.json?.error === 'string' && r.json.error.length > 0

try {
  check(await startServer(), 'API server boots on its own port')
  proxy = await startProdLikeProxy(distDir, { apiPort: PORT })
  base = `http://127.0.0.1:${proxy.port}`

  console.log('\n-- login: client A exhausts its limit, client B is untouched')
  {
    const A = ip(1)
    const B = ip(2)
    const shared = email('login-shared')
    const first = []
    for (let i = 0; i < 5; i += 1) first.push((await login(A, shared)).status)
    check(first.every((s) => s === 401), '5 wrong logins from A are answered 401', first.join(','))
    const sixth = await login(A, shared)
    check(isOurs429(sixth), 'the 6th from A is a 429 with our JSON message', `${sixth.status} ${sixth.type}`)
    const bSame = await login(B, shared)
    check(bSame.status === 401, 'client B, same email, is not blocked', String(bSame.status))
    const bOther = await login(B, email('login-other'))
    check(bOther.status === 401, 'client B, another email, is not blocked', String(bOther.status))
    const aOther = await login(A, email('login-other-a'))
    check(aOther.status === 401, 'client A, another email, is not blocked by the per-account limiter', String(aOther.status))
  }

  console.log('\n-- forgot-password: its own limiter, separate per client')
  {
    const A = ip(3)
    const B = ip(4)
    const target = email('forgot-shared')
    const sent = []
    for (let i = 0; i < 5; i += 1) sent.push((await forgotSend(A, target)).status)
    check(sent.every((s) => s === 200), '5 code requests from A for one email are answered 200', sent.join(','))
    const sixth = await forgotSend(A, target)
    check(isOurs429(sixth), 'the 6th from A for that email is a 429 with our JSON message', `${sixth.status} ${sixth.type}`)
    const bSame = await forgotSend(B, target)
    check(bSame.status === 200, 'client B, same email, is not blocked', String(bSame.status))
    const aOther = await forgotSend(A, email('forgot-other'))
    check(aOther.status === 200, 'client A can still request a code for a different email', String(aOther.status))
  }

  console.log('\n-- a locked-out login does not lock out recovery')
  {
    const A = ip(5)
    const victim = email('locked-out')
    for (let i = 0; i < 6; i += 1) await login(A, victim)
    const blocked = await login(A, victim)
    check(isOurs429(blocked), 'login for that email from A is blocked (precondition)', String(blocked.status))
    const recover = await forgotSend(A, victim)
    check(recover.status === 200, 'the same client can still start a password reset for it', String(recover.status))
    const verify = await forgotVerify(A, victim)
    check(verify.status === 400, 'and can still submit a code (answered 400 "invalid", not 429)', String(verify.status))
  }

  console.log('\n-- per-source backstops are per client, not global')
  {
    const C = ip(6)
    const D = ip(7)
    // otpSendIpBackstopLimiter: 20 code requests per hour per source, any email.
    const cStatuses = []
    for (let i = 0; i < 20; i += 1) cStatuses.push((await forgotSend(C, email(`spray-${i}`))).status)
    check(cStatuses.every((s) => s === 200), '20 code requests from C (20 different emails) are answered 200', cStatuses.join(','))
    const c21 = await forgotSend(C, email('spray-21'))
    check(isOurs429(c21), 'the 21st from C is a 429 with our JSON message', `${c21.status} ${c21.type}`)
    const d1 = await forgotSend(D, email('spray-d'))
    check(d1.status === 200, 'client D is unaffected by C hitting the per-source backstop', String(d1.status))

    // otpVerifyLimiter: 20 verify attempts per 15 minutes per source.
    const E = ip(8)
    const F = ip(9)
    const eStatuses = []
    for (let i = 0; i < 20; i += 1) eStatuses.push((await forgotVerify(E, email(`verify-${i}`))).status)
    check(eStatuses.every((s) => s === 400), '20 code checks from E are answered 400', eStatuses.join(','))
    const e21 = await forgotVerify(E, email('verify-21'))
    check(isOurs429(e21), 'the 21st from E is a 429 with our JSON message', `${e21.status} ${e21.type}`)
    const f1 = await forgotVerify(F, email('verify-f'))
    check(f1.status === 400, 'client F is unaffected by E hitting the verify limiter', String(f1.status))
  }

  console.log('\n-- what a SHARED source address would do (the failure mode this test guards against)')
  {
    // If req.ip were the same for everyone (a wrong trust-proxy hop count), the per-source limiters above would be
    // global. This simulates it by giving two different "users" the same address.
    const shared = ip(10)
    for (let i = 0; i < 20; i += 1) await forgotSend(shared, email(`user1-${i}`))
    const secondUser = await forgotSend(shared, email('user2'))
    info(`two users behind one address: after 20 code requests by the first, the second gets ${secondUser.status} (429 means the per-source backstop is shared, as designed; it is why req.ip must be the real client address)`)
  }

  check(await stopServer(), 'API server stopped')
} catch (err) {
  failures += 1
  console.log(`ERROR  ${String(err.message).slice(0, 160)}`)
} finally {
  try { await proxy?.close() } catch { /* ignore */ }
  await stopServer()
  console.log(`\n${passes} passed, ${failures} failed`)
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
