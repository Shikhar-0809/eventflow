/**
 * Login limiter keying (BUGS #079): the per-account limiter is keyed on normalised email + source address, so
 * a source address shared by every visitor (a wrong trust-proxy hop count) cannot let one account's failures lock
 * out the others; a looser per-source backstop still stops spraying many emails; successful logins never count.
 * Talks to the dev API directly and varies X-Forwarded-For to choose the "source" (dev: trust proxy 4, one entry,
 * so req.ip is that value). Counters live in server memory: restart the dev server to reset them.
 *
 * Requires: dev API on :3001. Uses the dev demo merchant's login for the success checks.
 * Run from server/: node scripts/verify-login-limiter-keys.mjs
 */
import { VERIFY_API_BASE } from './lib/verifySession.mjs'
import { resolveVerifyPassword, VERIFY_LOGIN_EMAIL } from './lib/verifyScriptAuth.mjs'

const MESSAGE = 'Too many login attempts. Please try again in 15 minutes.'
const run = String(Date.now() % 100000)
// Fresh source addresses per run so reruns do not collide with each other (counters last 15 minutes).
const source = (n) => `192.0.2.${(Number(run) + n) % 250 + 1}`

const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const login = async (email, password, ip) => {
  const res = await fetch(`${VERIFY_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}
const fails = async (email, ip, count) => {
  const statuses = []
  for (let i = 0; i < count; i++) statuses.push((await login(email, 'definitely-wrong', ip)).status)
  return statuses
}

const emailA = `a${run}@limiter.example.test`
const emailB = `b${run}@limiter.example.test`

// 1. One shared source, different accounts: A's failures lock only A.
{
  const ip = source(1)
  const first = await fails(emailA, ip, 5)
  record('5 failures on account A are all answered 401', first.every((s) => s === 401), first.join(','))
  const sixth = await login(emailA, 'definitely-wrong', ip)
  record('6th failure on A (shared source) is 429 with the limiter message', sixth.status === 429 && sixth.body?.error === MESSAGE, String(sixth.status))
  const other = await login(emailB, 'definitely-wrong', ip)
  record('account B from the same shared source is not limited', other.status === 401, String(other.status))
}

// 2. The email is normalised (case and surrounding spaces) so variants share one bucket.
{
  const ip = source(2)
  const mixed = `Mixed${run}@Limiter.Example.Test`
  const statuses = []
  for (const variant of [mixed, ` ${mixed.toLowerCase()} `, mixed.toUpperCase(), mixed, mixed.toLowerCase()]) {
    statuses.push((await login(variant, 'definitely-wrong', ip)).status)
  }
  const sixth = await login(mixed.toLowerCase(), 'definitely-wrong', ip)
  record('case and space variants of one email share a bucket', statuses.every((s) => s === 401) && sixth.status === 429, `${statuses.join(',')} then ${sixth.status}`)
}

// 3. The same account from a different source is a different bucket (a real visitor behind a correct req.ip).
{
  const other = await login(emailA, 'definitely-wrong', source(3))
  record('the same email from another source has its own bucket', other.status === 401, String(other.status))
}

// 4. Successful logins are never counted (even for the account being attacked).
{
  const ip = source(4)
  const good = resolveVerifyPassword()
  const ok = []
  for (let i = 0; i < 7; i++) ok.push((await login(VERIFY_LOGIN_EMAIL, good, ip)).status)
  record('7 successful logins in a row from one source are never limited', ok.every((s) => s === 200), ok.join(','))
  const bad = await fails(VERIFY_LOGIN_EMAIL, ip, 5)
  const sixth = await login(VERIFY_LOGIN_EMAIL, 'definitely-wrong', ip)
  record('5 failures after the successes still pass, the 6th is 429', bad.every((s) => s === 401) && sixth.status === 429, `${bad.join(',')} then ${sixth.status}`)
}

// 5. Backstop: 50 failures from one source across different emails, then a brand-new email is blocked too.
{
  const ip = source(5)
  const statuses = []
  for (let i = 0; i < 50; i++) statuses.push((await login(`spray${i}-${run}@limiter.example.test`, 'definitely-wrong', ip)).status)
  const next = await login(`spray-new-${run}@limiter.example.test`, 'definitely-wrong', ip)
  record('50 failures across 50 emails from one source are all answered 401', statuses.every((s) => s === 401), `${statuses.filter((s) => s === 401).length}/50`)
  record('the 51st failure from that source (new email) is 429 with the message', next.status === 429 && next.body?.error === MESSAGE, String(next.status))
  const elsewhere = await login(`spray-new-${run}@limiter.example.test`, 'definitely-wrong', source(6))
  record('another source is unaffected by the backstop', elsewhere.status === 401, String(elsewhere.status))
}

// 6. A missing or odd email never crashes the limiter.
{
  const ip = source(7)
  const noEmail = await fetch(`${VERIFY_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ password: 'x' }),
  })
  const objectEmail = await fetch(`${VERIFY_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email: { a: 1 }, password: 'x' }),
  })
  record('missing and non-string emails get a 400, not a 500', noEmail.status === 400 && objectEmail.status === 400, `${noEmail.status},${objectEmail.status}`)
}

const failed = results.filter((r) => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
