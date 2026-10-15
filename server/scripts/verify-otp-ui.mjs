/**
 * Email OTP screens, end to end in Chromium (sign-up and forgot-password), at 375px and 1280px.
 * Builds the real client bundle (VITE_API_URL=/api), serves it behind the local prod-like proxy, and drives the real
 * UI against the dev API. Codes the inbox would hold are planted in the DEV database (scripts/lib/devOtp.mjs). Also
 * checks the "which account" UX: starting a reset for email A, changing to email B, and finishing the reset must show
 * B (masked) everywhere and prefill the login with B. Throwaway merchants and codes are deleted at the end.
 *
 * Requires: dev API on :3001 started with EMAIL_DEV_LOG=true (so no real email goes out) and the same OTP_HMAC_SECRET
 * as this script (the server and the script load the same environment), plus playwright.
 * Run from server/: node scripts/verify-otp-ui.mjs --confirm-host=<dev db host>
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
import { hashOtpCode } from '../services/otp.js'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'
import { plantSignupOtp } from './lib/devOtp.mjs'
import { startProdLikeProxy } from './lib/prodLikeProxy.mjs'

assertConfirmedDatabaseHost()

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const SUFFIX = '@otpui.example.test'
const EMAIL = `uiflow${SUFFIX}`
const EMAIL_A = `wrongaddress${SUFFIX}`
const EMAIL_B = `second-account${SUFFIX}`
const SPAM_HINT = "Check your spam folder if it doesn't arrive in a minute."

// Same rule as client/src/utils/maskEmail.js.
const mask = (email) => {
  const at = email.lastIndexOf('@')
  const local = email.slice(0, at)
  return `${local.length <= 4 ? `${local[0]}****` : `${local.slice(0, 2)}****${local.slice(-2)}`}${email.slice(at)}`
}

const results = []
const ok = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}`)
}

const plantReset = async (email, code) => {
  await pool.query("UPDATE email_otps SET consumed_at = NOW() WHERE email = $1 AND purpose = 'reset' AND consumed_at IS NULL", [email])
  await pool.query(
    "INSERT INTO email_otps (email, purpose, code_hash, expires_at, last_sent_at) VALUES ($1, 'reset', $2, NOW() + INTERVAL '10 minutes', NOW())",
    [email, hashOtpCode('reset', email, code)],
  )
}

const createMerchant = async (email, name) => {
  const { rows } = await pool.query('INSERT INTO merchants (business_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [name, email, 'x'])
  return rows[0].id
}

const cleanup = async () => {
  const { rows } = await pool.query('SELECT id FROM merchants WHERE email LIKE $1', [`%${SUFFIX}`])
  const ids = rows.map((r) => r.id)
  if (ids.length > 0) {
    const { rows: tables } = await pool.query("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'merchant_id'")
    for (const { table_name: table } of tables) await pool.query(`DELETE FROM "${table}" WHERE merchant_id = ANY($1)`, [ids])
    await pool.query('DELETE FROM merchants WHERE id = ANY($1)', [ids])
  }
  await pool.query('DELETE FROM email_otps WHERE email LIKE $1', [`%${SUFFIX}`])
}

const distDir = mkdtempSync(path.join(tmpdir(), 'eventflow-otp-ui-'))
let proxy
let browser
try {
  await cleanup()
  const build = spawnSync(process.execPath, [path.join(repoRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', distDir, '--emptyOutDir'], {
    cwd: path.join(repoRoot, 'client'),
    env: { ...process.env, VITE_API_URL: '/api' },
    encoding: 'utf8',
  })
  if (build.status !== 0) throw new Error(`client build failed: ${build.stderr || build.stdout}`)
  proxy = await startProdLikeProxy(distDir)
  browser = await chromium.launch({ headless: true })
  const url = `http://localhost:${proxy.port}/`

  // Each context gets its own source address, so the per-source limiters are not what the checks run into.
  const newPage = async (width, ip) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { 'x-test-ip': ip } })
    return [context, await context.newPage()]
  }

  for (const [label, width] of [['375', 375], ['1280', 1280]]) {
    const [context, page] = await newPage(width, `203.0.113.${width % 200}`)
    const noOverflow = async (name) => ok(`${label}px no horizontal scroll: ${name}`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    await page.goto(url, { waitUntil: 'networkidle' })
    await noOverflow('login')

    await page.click('text=Forgot password?')
    ok(`${label}: forgot title`, (await page.title()) === 'Reset password — EventFlow')
    await page.fill('#otp-email', `nobody-${label}${SUFFIX}`)
    await page.click('button[type=submit]')
    await page.waitForSelector("text=If an account exists for this email, we've sent a code.")
    ok(`${label}: forgot shows the generic message`, true)
    ok(`${label}: step 2 says which account (masked)`, await page.locator(`text=Resetting password for ${mask(`nobody-${label}${SUFFIX}`)}`).isVisible())
    ok(`${label}: forgot code step shows the spam-folder hint`, await page.locator(`text=${SPAM_HINT}`).isVisible())
    ok(`${label}: six digit boxes with aria-labels`, (await page.locator('input[aria-label^="Digit"]').count()) === 6 && (await page.locator('input[aria-label="Digit 3 of 6"]').count()) === 1)
    const resend = page.locator('button:has-text("Resend code")')
    ok(`${label}: resend is a disabled countdown`, /Resend code in \d:\d\d/.test(await resend.innerText()) && (await resend.isDisabled()))
    await noOverflow('forgot code step')
    await page.locator('input[aria-label="Digit 1 of 6"]').focus()
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.setData('text', '123456')
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await page.waitForSelector('text=Code is invalid or expired.')
    ok(`${label}: pasting 6 digits fills and submits; a wrong code gives a human error`, true)
    ok(`${label}: boxes cleared after a wrong code`, (await page.locator('input[aria-label="Digit 1 of 6"]').inputValue()) === '')
    await page.keyboard.type('12')
    ok(`${label}: typing auto-advances`, (await page.locator('input[aria-label="Digit 2 of 6"]').inputValue()) === '2' && (await page.locator('input[aria-label="Digit 3 of 6"]').evaluate((n) => n === document.activeElement)))
    await page.keyboard.press('Backspace')
    ok(`${label}: backspace moves back`, await page.locator('input[aria-label="Digit 2 of 6"]').evaluate((n) => n === document.activeElement))
    await context.close()
  }

  // Sign-up, start to finish
  let [c1, p1] = await newPage(1280, '203.0.113.77')
  await p1.goto(url, { waitUntil: 'networkidle' })
  await p1.click('text=Sign up')
  ok('signup title', (await p1.title()) === 'Create account — EventFlow')
  await p1.fill('#otp-email', EMAIL)
  await p1.click('button[type=submit]')
  await p1.waitForSelector(`text=Code sent to ${mask(EMAIL)}`)
  ok('signup step 2 shows the masked email, the spam hint and the change link', (await p1.locator(`text=${SPAM_HINT}`).isVisible()) && (await p1.locator('text=Wrong email? Change it').count()) === 1)
  ok('signup step 2 does not print the full address', (await p1.locator(`text=${EMAIL}`).count()) === 0)
  await p1.click('text=Wrong email? Change it')
  ok('change email returns to step 1 with the email kept', (await p1.inputValue('#otp-email')) === EMAIL)
  await p1.click('button[type=submit]')
  await p1.waitForSelector('text=Please wait before requesting another code.')
  ok('sending inside the cooldown shows a human sentence', true)
  await pool.query("UPDATE email_otps SET last_sent_at = NOW() - INTERVAL '2 minutes' WHERE email = $1", [EMAIL])
  await p1.click('button[type=submit]')
  await p1.waitForSelector('text=Code sent to')
  const code = await plantSignupOtp(pool, EMAIL)
  await p1.locator('input[aria-label="Digit 1 of 6"]').focus()
  await p1.keyboard.type(code)
  await p1.waitForSelector('#business_name')
  ok('signup step 3 reached after the correct code', true)
  ok('step 3 has distinct aria-labels for the two password toggles', (await p1.locator('button[aria-label="Show password"]').count()) === 1 && (await p1.locator('button[aria-label="Show confirm password"]').count()) === 1)
  await p1.fill('#business_name', 'UI Flow Tents')
  await p1.fill('#password', 'firstpass123')
  await p1.fill('#confirm_password', 'different123')
  await p1.click('button[type=submit]')
  ok('a password mismatch shows a human error', (await p1.locator('text=Passwords do not match').count()) > 0)
  await p1.fill('#confirm_password', 'firstpass123')
  await p1.click('button[type=submit]')
  await p1.waitForSelector('text=UI Flow Tents')
  ok('signup creates the account and lands in the app', true)
  ok('no token in localStorage or sessionStorage', await p1.evaluate(() => !JSON.stringify({ ...localStorage, ...sessionStorage }).toLowerCase().includes('token')))

  // A reset on one browser logs out another
  const [c2, p2] = await newPage(1280, '203.0.113.78')
  await p2.goto(url, { waitUntil: 'networkidle' })
  await p2.fill('#email', EMAIL)
  await p2.fill('#password', 'firstpass123')
  await p2.click('button[type=submit]')
  await p2.waitForSelector('text=UI Flow Tents')
  await c1.close()
  ;[c1, p1] = await newPage(1280, '203.0.113.79')
  await p1.goto(url, { waitUntil: 'networkidle' })
  await p1.click('text=Forgot password?')
  await p1.fill('#otp-email', EMAIL)
  await p1.click('button[type=submit]')
  await p1.waitForSelector('text=Code sent to')
  await p1.waitForTimeout(2500) // the server issues the real code after replying; ours must come after it
  await plantReset(EMAIL, '135790')
  await p1.locator('input[aria-label="Digit 1 of 6"]').focus()
  await p1.keyboard.type('135790')
  await p1.waitForSelector('#password')
  ok('step 3 still says which account (masked)', await p1.locator(`text=Resetting password for ${mask(EMAIL)}`).isVisible())
  await p1.fill('#password', 'secondpass456')
  await p1.fill('#confirm_password', 'secondpass456')
  await p1.click('button[type=submit]')
  await p1.waitForSelector(`text=Password updated for ${mask(EMAIL)}. Log in with that email.`)
  ok('reset returns to login with the masked-email banner (no auto-login)', true)
  ok('login email is prefilled after the reset', (await p1.inputValue('#email')) === EMAIL)
  await p2.reload({ waitUntil: 'networkidle' })
  ok('the second browser is logged out after the reset', (await p2.locator('text=Log In').count()) > 0 && (await p2.locator('text=UI Flow Tents').count()) === 0)
  await p1.fill('#password', 'secondpass456')
  await p1.click('button[type=submit]')
  await p1.waitForSelector('text=UI Flow Tents')
  ok('login with the new password works', true)
  await c1.close()
  await c2.close()

  // Start with email A, change to email B, finish: everything must be about B
  await createMerchant(EMAIL_B, 'Second Account Tents')
  const [c3, p3] = await newPage(1280, '203.0.113.80')
  await p3.goto(url, { waitUntil: 'networkidle' })
  await p3.click('text=Forgot password?')
  await p3.fill('#otp-email', EMAIL_A)
  await p3.click('button[type=submit]')
  await p3.waitForSelector(`text=Resetting password for ${mask(EMAIL_A)}`)
  await p3.locator('input[aria-label="Digit 1 of 6"]').focus()
  await p3.keyboard.type('12345') // a half-typed code for A
  await p3.click('text=Wrong email? Change it')
  ok('A to B: back on step 1 with A prefilled', (await p3.inputValue('#otp-email')) === EMAIL_A)
  await p3.fill('#otp-email', EMAIL_B)
  await p3.click('button[type=submit]')
  await p3.waitForSelector(`text=Resetting password for ${mask(EMAIL_B)}`)
  ok('A to B: step 2 names B, not A', (await p3.locator(`text=${mask(EMAIL_A)}`).count()) === 0)
  ok('A to B: the half-typed code did not carry over', (await p3.locator('input[aria-label="Digit 1 of 6"]').inputValue()) === '' && (await p3.locator('input[aria-label="Digit 5 of 6"]').inputValue()) === '')
  await p3.waitForTimeout(2500)
  await plantReset(EMAIL_B, '246810')
  await p3.locator('input[aria-label="Digit 1 of 6"]').focus()
  await p3.keyboard.type('246810')
  await p3.waitForSelector('#password')
  ok('A to B: step 3 names B', await p3.locator(`text=Resetting password for ${mask(EMAIL_B)}`).isVisible())
  await p3.fill('#password', 'brandnewpass789')
  await p3.fill('#confirm_password', 'brandnewpass789')
  await p3.click('button[type=submit]')
  await p3.waitForSelector(`text=Password updated for ${mask(EMAIL_B)}. Log in with that email.`)
  ok('A to B: banner shows B', (await p3.locator(`text=${mask(EMAIL_A)}`).count()) === 0)
  ok('A to B: login is prefilled with B', (await p3.inputValue('#email')) === EMAIL_B)
  await p3.fill('#password', 'brandnewpass789')
  await p3.click('button[type=submit]')
  await p3.waitForSelector('text=Second Account Tents')
  ok('A to B: B can log in with the new password', true)
  const { rows: reset } = await pool.query("SELECT COUNT(*)::int AS c FROM merchants WHERE email = $1 AND token_version = 1", [EMAIL_B])
  ok('A to B: only B was reset (A has no account, B token_version bumped)', reset[0].c === 1)
  await c3.close()
} catch (err) {
  console.log('ERROR', err.message.split('\n')[0], (err.stack.match(/verify-otp-ui\.mjs:\d+/) || [])[0] ?? '')
  results.push(false)
} finally {
  await browser?.close()
  await proxy?.close()
  rmSync(distDir, { recursive: true, force: true })
  await cleanup()
  await pool.end()
}

const failed = results.filter((r) => !r)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
