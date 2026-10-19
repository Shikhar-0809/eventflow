/**
 * Login 429 message check: the login screen must show the limiter's own message. A 429 with no readable { error }
 * (plain text, HTML, empty; what Render's free tier sends for a hibernated API, BUGS #104) is not a rate limit: the
 * client retries a login once after ~3 s and then says "The server is waking up. Please try again in a minute."
 * (BUGS #078 earlier showed "Too many attempts" for it, which misled people).
 * Uses the real production bundle (VITE_API_URL=/api) behind the vercel.json-style local proxy.
 * Successful logins (BUGS #078): skipSuccessfulRequests means 6+ good logins in a row are never limited, while five
 * failures still block the next attempt. This uses the dev demo merchant's login (the only DB effect is its usage log).
 *
 * Requires: dev API on :3001 (npm run dev), playwright (server devDependency).
 * Run from server/: node scripts/verify-login-rate-limit-message.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startProdLikeProxy } from './lib/prodLikeProxy.mjs'
import { resolveVerifyPassword, VERIFY_LOGIN_EMAIL } from './lib/verifyScriptAuth.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LIMITER_MESSAGE = 'Too many login attempts. Please try again in 15 minutes.'
const WAKING_MESSAGE = 'The server is waking up. Please try again in a minute.'
const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const distDir = mkdtempSync(path.join(tmpdir(), 'eventflow-prod-dist-'))
let proxy
let browser

const shownError = async (page) => (await page.locator('p.text-red-700').allInnerTexts()).join(' | ')

const submitLogin = async (page, password = 'wrongpass1', waitMs = 1200) => {
  await page.fill('#email', 'nobody@pwcheck.example.test')
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForTimeout(waitMs)
}

try {
  const build = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', distDir, '--emptyOutDir'],
    { cwd: path.join(repoRoot, 'client'), env: { ...process.env, VITE_API_URL: '/api' }, encoding: 'utf8' },
  )
  if (build.status !== 0) throw new Error(`client build failed: ${build.stderr || build.stdout}`)

  proxy = await startProdLikeProxy(distDir)
  browser = await chromium.launch({ headless: true })
  const url = `http://localhost:${proxy.port}/`

  // 1. The real limiter: five failures, then the sixth attempt is blocked with its own message.
  {
    // A unique x-forwarded-for per run keeps this bucket separate from any other script's.
    const context = await browser.newContext({ extraHTTPHeaders: { 'x-test-ip': `198.51.100.${100 + (Date.now() % 100)}` } })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle' })
    for (let i = 0; i < 5; i++) await submitLogin(page)
    const before = await shownError(page)
    record('attempts 1-5 show the normal wrong-credentials message', before === 'Incorrect email or password.', before)
    await submitLogin(page)
    const blocked = await shownError(page)
    record('the 6th attempt shows the limiter message', blocked === LIMITER_MESSAGE, blocked)
    await context.close()
  }

  // 1b. Successful logins never count: 7 in a row all pass, then the bucket still allows exactly 5 failures.
  {
    const ip = `198.51.100.${200 + (Date.now() % 50)}`
    const login = (password) =>
      fetch(`http://localhost:${proxy.port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-ip': ip },
        body: JSON.stringify({ email: VERIFY_LOGIN_EMAIL, password }),
      })
    const good = resolveVerifyPassword()
    const statuses = []
    for (let i = 0; i < 7; i++) statuses.push((await login(good)).status)
    record('7 successful logins in a row are never limited', statuses.every((s) => s === 200), statuses.join(','))
    const bad = []
    for (let i = 0; i < 5; i++) bad.push((await login('definitely-wrong')).status)
    record('then 5 failures are all answered 401', bad.every((s) => s === 401), bad.join(','))
    const sixth = await login('definitely-wrong')
    const sixthBody = await sixth.json().catch(() => null)
    record('the 6th failure is blocked with the limiter message', sixth.status === 429 && sixthBody?.error === LIMITER_MESSAGE, String(sixth.status))
  }

  // 2. A 429 with no usable JSON body (as Render or another host sends) is a "waking up" message after one retry;
  //    our own limiter JSON keeps its message and is never retried. `calls` is how often the login request was sent.
  const cases = [
    { label: 'plain-text 429', responses: [{ status: 429, contentType: 'text/plain', body: 'Too Many Requests' }], expected: WAKING_MESSAGE, calls: 2 },
    { label: 'Render hibernation 429 (header + plain text)', responses: [{ status: 429, contentType: 'text/plain', body: 'Too Many Requests', headers: { 'x-render-routing': 'hibernate-rate-limited' } }], expected: WAKING_MESSAGE, calls: 2 },
    { label: 'HTML 429', responses: [{ status: 429, contentType: 'text/html', body: '<html><body>429</body></html>' }], expected: WAKING_MESSAGE, calls: 2 },
    { label: 'empty 429', responses: [{ status: 429, contentType: 'text/plain', body: '' }], expected: WAKING_MESSAGE, calls: 2 },
    { label: 'JSON 429 with a non-string error', responses: [{ status: 429, contentType: 'application/json', body: '{"error":{"x":1}}' }], expected: WAKING_MESSAGE, calls: 2 },
    { label: 'JSON 429 keeps its own message (no retry)', responses: [{ status: 429, contentType: 'application/json', body: '{"error":"Custom limiter text."}' }], expected: 'Custom limiter text.', calls: 1 },
    { label: 'JSON 429 keeps its own message even with another x-render-routing value', responses: [{ status: 429, contentType: 'application/json', body: '{"error":"Custom limiter text."}', headers: { 'x-render-routing': 'no-server' } }], expected: 'Custom limiter text.', calls: 1 },
    { label: 'a 429 that clears on the retry shows the real result', responses: [{ status: 429, contentType: 'text/plain', body: 'Too Many Requests' }, { status: 401, contentType: 'application/json', body: '{"error":"Incorrect email or password."}' }], expected: 'Incorrect email or password.', calls: 2 },
    { label: 'HTML 502 stays generic (no retry)', responses: [{ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' }], expected: GENERIC_MESSAGE, calls: 1 },
  ]
  for (const { label, responses, expected, calls } of cases) {
    const context = await browser.newContext()
    const page = await context.newPage()
    let seen = 0
    await page.route('**/api/auth/login', (route) => {
      const response = responses[Math.min(seen, responses.length - 1)]
      seen += 1
      return route.fulfill(response)
    })
    await page.goto(url, { waitUntil: 'networkidle' })
    await submitLogin(page, 'wrongpass1', calls > 1 ? 5000 : 1200)
    const shown = await shownError(page)
    record(`${label} shows the right message`, shown === expected, shown)
    record(`${label}: login request sent ${calls} time(s)`, seen === calls, String(seen))
    await context.close()
  }
} finally {
  await browser?.close()
  await proxy?.close()
  rmSync(distDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
