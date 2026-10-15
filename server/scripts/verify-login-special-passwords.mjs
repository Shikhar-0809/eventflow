/**
 * Production login incident check (BUGS #077): passwords with special characters must reach the server unchanged.
 * Builds the real client bundle with VITE_API_URL=/api (the production shape), serves it behind a local proxy that
 * mimics vercel.json, creates throwaway merchants on the DEV database, and logs in through the real login form in
 * Chromium. For each password the proxy compares the request body's password with the expected string and prints
 * only match/length, never the value. The throwaway merchants are deleted at the end.
 *
 * Requires: dev API on :3001 (npm run dev), playwright (root devDependency).
 * Run from server/: node scripts/verify-login-special-passwords.mjs --confirm-host=<dev db host>
 */
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { pool } from '../db/database.js'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'
import { deleteOtpsFor, plantSignupOtp } from './lib/devOtp.mjs'
import { startProdLikeProxy } from './lib/prodLikeProxy.mjs'

assertConfirmedDatabaseHost()

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const API = process.env.VERIFY_API_URL || 'http://localhost:3001/api'
const EMAIL_SUFFIX = '@pwcheck.example.test'

// Spaces at both ends matter: passwords are never trimmed.
const PASSWORDS = [
  { label: 'double quote', value: 'Test"Pass1xy' },
  { label: 'backslash', value: 'Te\\st$1abcd' },
  { label: 'double backslash and escape lookalikes', value: 'a\\\\b\\n\\u0041\\"9' },
  { label: 'single quote and backtick', value: "it's`quoted`9" },
  { label: 'angle brackets and ampersand', value: '<b>&amp;x</b>9' },
  { label: 'dollar and percent', value: '$1$2%s%d${x}9' },
  { label: 'inner spaces', value: 'two words  here9' },
  { label: 'leading and trailing spaces', value: '  padded pass9  ' },
  { label: 'every special character', value: "a\"\\'$`<>& b9" },
  { label: 'non-ASCII', value: 'pässwörd₹९9' },
]

const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const cleanup = async () => {
  await deleteOtpsFor(pool, EMAIL_SUFFIX)
  const { rows } = await pool.query('SELECT id FROM merchants WHERE email LIKE $1', [`%${EMAIL_SUFFIX}`])
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return 0
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'merchant_id' ORDER BY table_name`,
  )
  for (const { table_name: table } of tables) {
    await pool.query(`DELETE FROM "${table}" WHERE merchant_id = ANY($1)`, [ids])
  }
  await pool.query('DELETE FROM merchants WHERE id = ANY($1)', [ids])
  return ids.length
}

const sentPasswordOf = (sent) => {
  try {
    return JSON.parse(sent.bodyText).password
  } catch {
    return null
  }
}

const distDir = mkdtempSync(path.join(tmpdir(), 'eventflow-prod-dist-'))
let proxy
let browser

try {
  await cleanup() // leftovers from an interrupted run

  // The production build: same-origin /api, exactly as Vercel is configured.
  const build = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', distDir, '--emptyOutDir'],
    { cwd: path.join(repoRoot, 'client'), env: { ...process.env, VITE_API_URL: '/api' }, encoding: 'utf8' },
  )
  if (build.status !== 0) throw new Error(`client build failed: ${build.stderr || build.stdout}`)
  record('production build (VITE_API_URL=/api)', true)

  const loginBodies = []
  proxy = await startProdLikeProxy(distDir, {
    onApiRequest: ({ method, path: p, bodyText, status }) => {
      if (method === 'POST' && p === '/api/auth/login') loginBodies.push({ bodyText, status })
    },
  })
  browser = await chromium.launch({ headless: true })

  for (const [index, { label, value }] of PASSWORDS.entries()) {
    const email = `pw${index}${EMAIL_SUFFIX}`
    // The real sign-up flow: a code planted in the dev
    // database stands in for the inbox (send-otp is skipped so no real email goes out), then the real verify-otp,
    // then signup with the verification token.
    const post = (route, body) =>
      fetch(`${API}/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const code = await plantSignupOtp(pool, email)
    const verify = await post('signup/verify-otp', { email, code })
    const { verificationToken } = verify.ok ? await verify.json() : {}
    const signup = verificationToken
      ? await post('signup', { verificationToken, business_name: `PW Check ${index}`, password: value })
      : verify
    if (signup.status !== 201 && signup.status !== 200) {
      record(`${label}: test merchant created`, false, `signup status ${signup.status} (verify-otp ${verify.status})`)
      continue
    }

    // Each login gets its own x-forwarded-for, so the 5-per-15-minutes login limiter is not in play.
    const context = await browser.newContext({ extraHTTPHeaders: { 'x-test-ip': `198.51.100.${index + 1}` } })
    const page = await context.newPage()
    loginBodies.length = 0
    try {
      await page.goto(`http://localhost:${proxy.port}/`, { waitUntil: 'networkidle' })
      await page.fill('#email', email)
      // Every third password is typed key by key (real keydown/input events) instead of set in one go.
      if (index % 3 === 0) await page.locator('#password').pressSequentially(value)
      else await page.fill('#password', value)
      // Every other password goes through the show/hide toggle first.
      if (index % 2 === 1) await page.click('button[aria-label="Show password"]')
      await page.click('button[type=submit]')
      await page.waitForSelector(`text=PW Check ${index}`, { timeout: 15_000 })

      const sent = loginBodies.at(-1)
      const sentPassword = sent ? sentPasswordOf(sent) : null
      const identical = sentPassword === value
      record(
        `${label}: login succeeds`,
        sent?.status === 200 && identical,
        `status=${sent?.status} sentMatchesTyped=${identical} sentLength=${sentPassword?.length} expectedLength=${value.length}`,
      )
    } catch (err) {
      const sent = loginBodies.at(-1)
      const sentPassword = sent ? sentPasswordOf(sent) : null
      record(
        `${label}: login succeeds`,
        false,
        `${err.message.split('\n')[0]} status=${sent?.status} sentMatchesTyped=${sentPassword === value} sentLength=${sentPassword?.length} expectedLength=${value.length}`,
      )
    } finally {
      await context.close()
    }
  }
} finally {
  await browser?.close()
  await proxy?.close()
  rmSync(distDir, { recursive: true, force: true })
  const removed = await cleanup()
  console.log(`Cleaned up ${removed} test merchant(s).`)
  await pool.end()
}

const failed = results.filter((r) => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
