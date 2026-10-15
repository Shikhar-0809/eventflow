/**
 * Login 429 message check: the login screen must show the limiter's own message, and any 429 that has no
 * readable { error } (plain text, HTML, empty) must still say "too many attempts", not "Something went wrong".
 * Uses the real production bundle (VITE_API_URL=/api) behind the vercel.json-style local proxy.
 * No database writes: failed logins for an unknown email only fill the in-memory limiter bucket.
 *
 * Requires: dev API on :3001 (npm run dev), playwright (root devDependency).
 * Run from server/: node scripts/verify-login-rate-limit-message.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startProdLikeProxy } from './lib/prodLikeProxy.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LIMITER_MESSAGE = 'Too many login attempts. Please try again in 15 minutes.'
const FALLBACK_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'
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

const submitLogin = async (page, password = 'wrongpass1') => {
  await page.fill('#email', 'nobody@pwcheck.example.test')
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForTimeout(1200)
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

  // 2. A 429 with no usable JSON body (as a proxy or host could send) still reads as "too many attempts".
  const cases = [
    { label: 'plain-text 429', status: 429, contentType: 'text/plain', body: 'Too Many Requests', expected: FALLBACK_MESSAGE },
    { label: 'HTML 429', status: 429, contentType: 'text/html', body: '<html><body>429</body></html>', expected: FALLBACK_MESSAGE },
    { label: 'empty 429', status: 429, contentType: 'text/plain', body: '', expected: FALLBACK_MESSAGE },
    { label: 'JSON 429 with a non-string error', status: 429, contentType: 'application/json', body: '{"error":{"x":1}}', expected: FALLBACK_MESSAGE },
    { label: 'JSON 429 keeps its own message', status: 429, contentType: 'application/json', body: '{"error":"Custom limiter text."}', expected: 'Custom limiter text.' },
    { label: 'HTML 502 stays generic', status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>', expected: GENERIC_MESSAGE },
  ]
  for (const { label, status, contentType, body, expected } of cases) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.route('**/api/auth/login', (route) => route.fulfill({ status, contentType, body }))
    await page.goto(url, { waitUntil: 'networkidle' })
    await submitLogin(page)
    const shown = await shownError(page)
    record(`${label} shows the right message`, shown === expected, shown)
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
