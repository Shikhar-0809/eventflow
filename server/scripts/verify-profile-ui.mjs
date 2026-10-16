/**
 * Merchant Profile screen, end to end in Chromium (Playwright), at 1280px and 375px.
 * Builds the real client bundle (VITE_API_URL=/api), serves it behind the local prod-like proxy and drives the real UI
 * against the DEV API. Seeds fictional merchants (@profui.example.test) and plants the emailed codes in the DEV database
 * (scripts/lib/devOtp.mjs), so no inbox is needed. Everything it creates is deleted at the end. Refuses to run against
 * production (NODE_ENV, database host).
 *
 * Requires: dev API on :3001 started with EMAIL_DEV_LOG=true (so no real email goes out) and the same OTP_HMAC_SECRET as
 * this script (both load the same environment), plus playwright.
 * Run from server/: node scripts/verify-profile-ui.mjs --confirm-host=<dev db host>
 * Screenshots (375px, every section and modal) go to SCREENSHOT_DIR, default <tmp>/eventflow-profile-ui-shots.
 */
import './lib/guardFirst.mjs'
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { chromium } from 'playwright'
import { pool } from '../db/database.js'
import { plantOtp } from './lib/devOtp.mjs'
import { startProdLikeProxy } from './lib/prodLikeProxy.mjs'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production.')
  process.exit(1)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const SUFFIX = '@profui.example.test'
const RUN = String(Date.now()).slice(-6)
const emailFor = (tag) => `${tag}-${RUN}${SUFFIX}`
const SHOTS = process.env.SCREENSHOT_DIR || path.join(tmpdir(), 'eventflow-profile-ui-shots')
const PASSWORD_0 = 'Start-Pass-1234'
const PASSWORD_1 = 'Changed-Pass-5678'
const PASSWORD_2 = 'Forgot-Pass-9012'
const GENERIC_SENT = 'If that address can receive mail, a code is on its way to'

// Same rule as client/src/utils/maskEmail.js.
const mask = (email) => {
  const at = email.lastIndexOf('@')
  const local = email.slice(0, at)
  return `${local.length <= 4 ? `${local[0]}****` : `${local.slice(0, 2)}****${local.slice(-2)}`}${email.slice(at)}`
}

const results = []
const ok = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail && !pass ? ` - ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---- seeding ----
const seedMerchant = async ({ tag, name, bookings = true }) => {
  const email = emailFor(tag)
  const hash = await bcrypt.hash(PASSWORD_0, 4)
  const { rows } = await pool.query('INSERT INTO merchants (business_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [name, email, hash])
  const id = rows[0].id
  if (bookings) {
    const add = (phone, date, status, advance, total) =>
      pool.query(
        `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, status, advance, total)
         VALUES ($1, 'Sample Client', $2, 'wedding', $3, 80, $4, $5, $6)`,
        [id, phone, date, status, advance, total],
      )
    await add('9876500001', '2099-01-15', 'confirmed', 2000, 10000)
    await add('9876500001', '2099-02-20', 'pending', 0, 0)
    await add('9876500002', '2020-03-10', 'completed', 5000, 5000)
    await pool.query("INSERT INTO inventory_items (merchant_id, name, total_quantity) VALUES ($1, 'Chairs', 100), ($1, 'Tables', 20)", [id])
  }
  return { id, email, name }
}

const cleanup = async () => {
  const { rows } = await pool.query('SELECT id FROM merchants WHERE email LIKE $1', [`%-${RUN}${SUFFIX}`])
  const ids = rows.map((r) => r.id)
  if (ids.length > 0) {
    const { rows: tables } = await pool.query("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'merchant_id'")
    for (const { table_name: table } of tables) await pool.query(`DELETE FROM "${table}" WHERE merchant_id = ANY($1)`, [ids])
    await pool.query('DELETE FROM merchants WHERE id = ANY($1)', [ids])
  }
  await pool.query('DELETE FROM email_otps WHERE email LIKE $1', [`%-${RUN}${SUFFIX}`])
}

// ---- browser helpers ----
let browser
let url
let ipCounter = 0
const newContext = async (width = 1280, height = 900) => {
  ipCounter += 1
  const context = await browser.newContext({ viewport: { width, height }, extraHTTPHeaders: { 'x-test-ip': `203.0.113.${(Number(RUN.slice(-2)) + ipCounter * 7) % 250 + 1}` } })
  // window.open (the WhatsApp buttons) is recorded instead of opening a tab.
  await context.addInitScript(() => {
    window.__opened = []
    window.open = (target) => {
      window.__opened.push(String(target))
      return null
    }
  })
  return [context, await context.newPage()]
}

const login = async (page, email, password) => {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForSelector('aside h1')
}
const openProfile = async (page) => {
  // Below the md breakpoint the sidebar is a drawer behind the hamburger button.
  if (page.viewportSize().width < 768) await page.click('button[aria-label="Open navigation menu"]')
  await page.click('aside button:has-text("Profile")')
  await page.waitForSelector('main h1:has-text("Profile")')
  await page.waitForSelector('[data-section="danger"]')
}
const bodyText = (page) => page.evaluate(() => document.body.innerText)
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const sidebarName = (page) => page.locator('aside h1').innerText()
const typeCode = async (page, code) => {
  await page.locator('input[aria-label="Digit 1 of 6"]').focus()
  await page.keyboard.type(code)
}
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    ok(`${name}: ran to completion`, false, err.message.split('\n')[0])
  }
}

const distDir = mkdtempSync(path.join(tmpdir(), 'eventflow-profile-ui-'))
let proxy
try {
  await cleanup()
  mkdirSync(SHOTS, { recursive: true })
  const build = spawnSync(process.execPath, [path.join(repoRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', distDir, '--emptyOutDir'], {
    cwd: path.join(repoRoot, 'client'),
    env: { ...process.env, VITE_API_URL: '/api' },
    encoding: 'utf8',
  })
  if (build.status !== 0) throw new Error(`client build failed: ${build.stderr || build.stdout}`)
  proxy = await startProdLikeProxy(distDir)
  browser = await chromium.launch({ headless: true })
  url = `http://localhost:${proxy.port}/`

  // ---------------------------------------------------------------------------------------------------------------
  // Layout pass: every section and modal at 375px and 1280px (no sideways scroll), screenshots at 375px.
  await section('layout', async () => {
    const S = await seedMerchant({ tag: 'shots', name: 'Layout Check Tents' })
    await pool.query("INSERT INTO sign_in_log (merchant_id, device_label, created_at) VALUES ($1, 'Safari on iPhone', NOW() - INTERVAL '2 days'), ($1, 'Firefox on Windows', NOW() - INTERVAL '9 days')", [S.id])
    for (const width of [375, 1280]) {
      const [context, page] = await newContext(width, width === 375 ? 1700 : 900)
      await login(page, S.email, PASSWORD_0)
      await openProfile(page)
      ok(`${width}px: profile page has no horizontal scroll`, await noOverflow(page))
      await page.waitForSelector('[data-testid="sign-in-list"]')
      for (const id of ['account', 'business', 'summary', 'security', 'danger']) {
        const card = page.locator(`[data-section="${id}"]`)
        const box = await card.boundingBox()
        ok(`${width}px: ${id} card fits the viewport`, Boolean(box) && box.x >= 0 && box.x + box.width <= width + 0.5, JSON.stringify(box))
        if (width === 375) await card.screenshot({ path: path.join(SHOTS, `375-${id}.png`) })
      }
      if (width === 375) {
        await page.click('button:has-text("Edit")')
        await page.locator('[data-section="business"]').screenshot({ path: path.join(SHOTS, '375-business-editing.png') })
        await page.click('button:has-text("Cancel")')
      }

      // Modals
      await page.click('button:has-text("Change email")')
      await page.waitForSelector('#new-email')
      ok(`${width}px: change-email modal step 1 fits`, await noOverflow(page) && (await page.locator('[role=dialog]').boundingBox()).width <= width)
      if (width === 375) await page.screenshot({ path: path.join(SHOTS, '375-modal-change-email-1.png') })
      await page.fill('#new-email', emailFor('layout-new'))
      await page.fill('#change-email-password', PASSWORD_0)
      await page.click('button[type=submit]:has-text("Send code")')
      await page.waitForSelector(`text=${GENERIC_SENT}`)
      ok(`${width}px: change-email modal step 2 fits`, await noOverflow(page))
      if (width === 375) await page.screenshot({ path: path.join(SHOTS, '375-modal-change-email-2.png') })
      await page.click('button[aria-label="Close dialog"]')

      await page.click('button:has-text("Delete account")')
      await page.waitForSelector('#delete-password')
      ok(`${width}px: delete modal fits`, await noOverflow(page) && (await page.locator('[role=dialog]').boundingBox()).width <= width)
      if (width === 375) await page.screenshot({ path: path.join(SHOTS, '375-modal-delete.png') })
      await page.click('button[aria-label="Close dialog"]')

      await page.locator('[data-section="security"] button:has-text("Log out other devices")').click()
      await page.waitForSelector('[role=dialog]:has-text("Log out other devices?")')
      ok(`${width}px: confirm dialog fits`, await noOverflow(page))
      if (width === 375) await page.screenshot({ path: path.join(SHOTS, '375-confirm-logout-others.png') })
      await page.click('[role=dialog] button:has-text("Cancel")')

      await page.locator('[data-section="security"] button:has-text("Forgot your current password?")').click()
      await page.waitForSelector("text=We'll send a code to")
      ok(`${width}px: forgot-from-profile (send step) fits`, await noOverflow(page))
      if (width === 375) await page.locator('[data-section="security"]').screenshot({ path: path.join(SHOTS, '375-security-forgot-send.png') })
      await context.close()
    }
  })

  // ---------------------------------------------------------------------------------------------------------------
  const M = await seedMerchant({ tag: 'main', name: 'Profile UI Tents' })
  const T = await seedMerchant({ tag: 'taken', name: 'Taken Address Tents', bookings: false })
  const [c1, p1] = await newContext(1280)
  const patchBusinessCalls = []
  p1.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().endsWith('/api/profile/business')) patchBusinessCalls.push(req.postData())
  })

  await section('profile loads', async () => {
    await login(p1, M.email, PASSWORD_0)
    await openProfile(p1)
    ok('tab title is "Profile — <business>"', (await p1.title()) === 'Profile — Profile UI Tents', await p1.title())
    const account = p1.locator('[data-section="account"]')
    ok('Account shows the masked email', (await account.innerText()).includes(mask(M.email)))
    ok('Account shows "Never changed" for a password never changed', (await account.innerText()).includes('Never changed'))
    ok('Account shows a Member since date', /Member since\s*\n?\s*\d{1,2} \w+ \d{4}/.test((await account.innerText()).replace(/\n+/g, '\n')))
    const stat = async (key) => (await p1.locator(`[data-stat="${key}"] p`).first().innerText()).trim()
    ok('summary tiles show the right counts (3 bookings, 2 upcoming, 2 inventory items, 2 clients)',
      [await stat('bookings'), await stat('upcoming'), await stat('inventory_items'), await stat('clients')].join(',') === '3,2,2,2',
      [await stat('bookings'), await stat('upcoming'), await stat('inventory_items'), await stat('clients')].join(','))
    ok('the full email appears nowhere on the page', !(await bodyText(p1)).includes(M.email))
    ok('active nav item is Profile', (await p1.locator('aside button:has-text("Profile")').getAttribute('class')).includes('bg-teal-600'))
    ok('Profile sits above Log Out in the sidebar', await p1.evaluate(() => {
      const buttons = [...document.querySelectorAll('aside button')]
      const profile = buttons.findIndex((b) => b.textContent.trim() === 'Profile')
      const logout = buttons.findIndex((b) => b.textContent.trim() === 'Log Out')
      return profile > -1 && logout === profile + 1
    }))
  })

  await section('business details', async () => {
    await p1.click('[data-section="business"] button:has-text("Edit")')
    await p1.fill('#profile-business-name', 'Renamed Profile Tents')
    const preview = () => p1.locator('[data-testid="signoff-preview"]').innerText()
    ok('sign-off preview updates live while typing', (await preview()).endsWith('Thank you! - Renamed Profile Tents'), await preview())
    ok('the Sidebar keeps the saved name until Save', (await sidebarName(p1)) === 'Profile UI Tents')
    await p1.fill('#profile-whatsapp', '12345')
    await p1.locator('#profile-whatsapp').blur()
    await p1.waitForSelector('text=Enter a valid 10-digit Indian mobile number')
    ok('an invalid WhatsApp number shows an inline error', true)
    await p1.click('button[type=submit]:has-text("Save")')
    await sleep(600)
    const { rows: unsaved } = await pool.query('SELECT business_name, whatsapp_phone FROM merchants WHERE id = $1', [M.id])
    ok('an invalid number is not saved (no request sent, database unchanged)', patchBusinessCalls.length === 0 && unsaved[0].business_name === 'Profile UI Tents' && unsaved[0].whatsapp_phone === null, JSON.stringify(unsaved[0]))
    await p1.fill('#profile-business-name', 'x')
    await p1.locator('#profile-business-name').blur()
    ok('a too-short business name shows an inline error', (await p1.locator('text=Business name is too short').count()) > 0)
    await p1.fill('#profile-business-name', 'Renamed Profile Tents')
    await p1.fill('#profile-whatsapp', '9876543210')
    await p1.click('button[type=submit]:has-text("Save")')
    await p1.waitForSelector('[role=status]:has-text("Business details saved.")')
    ok('saving updates the Sidebar name', (await sidebarName(p1)) === 'Renamed Profile Tents', await sidebarName(p1))
    ok('saving updates the tab title', (await p1.title()) === 'Profile — Renamed Profile Tents', await p1.title())
    ok('the sign-off preview shows the saved name', (await preview()).endsWith('Thank you! - Renamed Profile Tents'))
    const { rows: saved } = await pool.query('SELECT business_name, whatsapp_phone FROM merchants WHERE id = $1', [M.id])
    ok('name and number are saved in the database', saved[0].business_name === 'Renamed Profile Tents' && saved[0].whatsapp_phone === '9876543210')
    // An empty number saves as null.
    await p1.click('[data-section="business"] button:has-text("Edit")')
    ok('editing starts from the saved number', (await p1.inputValue('#profile-whatsapp')) === '9876543210')
    await p1.fill('#profile-whatsapp', '')
    await p1.click('button[type=submit]:has-text("Save")')
    await p1.waitForSelector('[data-section="business"] >> text=Not set')
    const { rows: cleared } = await pool.query('SELECT whatsapp_phone FROM merchants WHERE id = $1', [M.id])
    ok('an empty WhatsApp number saves as null', cleared[0].whatsapp_phone === null)
    await p1.click('[data-section="business"] button:has-text("Edit")')
    await p1.fill('#profile-business-name', 'Changed Then Cancelled')
    await p1.click('[data-section="business"] button:has-text("Cancel")')
    ok('Cancel drops the edit', (await p1.locator('[data-section="business"]').innerText()).includes('Renamed Profile Tents') && (await sidebarName(p1)) === 'Renamed Profile Tents')
  })

  await section('send to my whatsapp', async () => {
    const openBooking = async () => {
      await p1.click('aside button:has-text("Pending Balances")')
      await p1.click('button:has-text("View Booking")')
      await p1.waitForSelector('button:has-text("Send to My WhatsApp")')
    }
    await openBooking()
    const selfButton = p1.locator('button:has-text("Send to My WhatsApp")')
    ok('with no number, "Send to My WhatsApp" is disabled', await selfButton.isDisabled())
    ok('with no number, the hint is shown', await p1.locator('text=Add your WhatsApp number in Profile').isVisible())
    await p1.click('text=Add your WhatsApp number in Profile')
    await p1.waitForSelector('main h1:has-text("Profile")')
    ok('the hint opens the Profile screen', (await p1.locator('[role=dialog]:has-text("Booking Details")').count()) === 0)
    await p1.click('[data-section="business"] button:has-text("Edit")')
    await p1.fill('#profile-whatsapp', '9876543210')
    await p1.click('button[type=submit]:has-text("Save")')
    await p1.waitForSelector('[data-section="business"] >> text=9876543210')
    await openBooking()
    ok('with a number saved, the button is enabled and the hint is gone',
      !(await selfButton.isDisabled()) && (await p1.locator('text=Add your WhatsApp number in Profile').count()) === 0)
    await selfButton.click()
    const opened = await p1.evaluate(() => window.__opened)
    ok('the message goes to the merchant\'s own saved number', opened.length === 1 && opened[0].startsWith('https://wa.me/919876543210?text='), opened.join(','))
    await p1.click('button[aria-label="Close"]')
    await openProfile(p1)
  })

  await section('change password', async () => {
    const [c2, p2] = await newContext(1280)
    await login(p2, M.email, PASSWORD_0)
    const security = p1.locator('[data-section="security"]')
    const submitChange = () => security.locator('button[type=submit]:has-text("Change password")').click()
    const confirm = () => p1.locator('[role=dialog]:has-text("Change your password?") button:has-text("Change password")').click()

    await p1.fill('#current_password', 'definitely-wrong-1')
    await p1.fill('#password', PASSWORD_1)
    await p1.fill('#confirm_password', PASSWORD_1)
    await submitChange()
    await p1.waitForSelector('[role=dialog]:has-text("Change your password?")')
    ok('a confirm step appears before the password is changed', true)
    await confirm()
    await p1.waitForSelector('[data-section="security"] [role=alert]:has-text("Incorrect password.")')
    ok('a wrong current password shows "Incorrect password."', true)
    ok('a wrong current password does not sign this tab out', (await p1.locator('main h1:has-text("Profile")').count()) === 1)

    await p1.fill('#current_password', PASSWORD_0)
    await submitChange()
    await confirm()
    await p1.waitForSelector(`[role=status]:has-text("Password changed. You've been signed out on other devices.")`)
    ok('success message: "Password changed. You\'ve been signed out on other devices."', true)
    ok('inputs are cleared after success', (await p1.inputValue('#current_password')) === '' && (await p1.inputValue('#password')) === '' && (await p1.inputValue('#confirm_password')) === '')
    ok('this tab stays signed in (Profile still showing)', (await p1.locator('main h1:has-text("Profile")').count()) === 1)
    await p1.reload({ waitUntil: 'networkidle' })
    await p1.waitForSelector('aside h1')
    ok('this tab is still signed in after a reload (cookie was re-issued)', (await p1.locator('aside h1').count()) === 1)
    await openProfile(p1)
    ok('"Password last changed" now reads "just now"', (await p1.locator('[data-section="account"]').innerText()).includes('just now'))
    await p2.reload({ waitUntil: 'networkidle' })
    ok('a second browser is bounced to login after the change', (await p2.locator('#email').count()) === 1 && (await p2.locator('aside').count()) === 0)
    await c2.close()
  })

  await section('forgot from profile', async () => {
    const security = p1.locator('[data-section="security"]')
    await security.locator('button:has-text("Forgot your current password?")').click()
    ok('the send step names the masked address and has no email field',
      (await security.innerText()).includes(`We'll send a code to ${mask(M.email)}`) && (await security.locator('input[type=email]').count()) === 0)
    await security.locator('button:has-text("Send code")').click()
    await p1.waitForSelector(`text=Code sent to ${mask(M.email)}`)
    ok('after sending: "Code sent to <masked>"', true)
    ok('the code step has the spam hint and a resend countdown', (await security.locator('text=Check your spam folder').count()) === 1 && /Resend code in \d:\d\d/.test(await security.locator('button:has-text("Resend code")').innerText()))
    ok('the full email is not on the page', !(await bodyText(p1)).includes(M.email))
    const CODE = '246810'
    await plantOtp(pool, { email: M.email, purpose: 'reset_password', code: CODE, merchantId: M.id })

    // A second send inside the cooldown shows the server's own sentence.
    await security.locator('button:has-text("Back to change password")').click()
    await security.locator('button:has-text("Forgot your current password?")').click()
    await security.locator('button:has-text("Send code")').click()
    await p1.waitForSelector('[data-section="security"] [role=alert]:has-text("Please wait before requesting another code.")')
    ok('a 429 shows the server\'s message as-is', true)

    // Get back to the code step without sending: the first send (above) already has a live code.
    await pool.query("UPDATE email_otps SET last_sent_at = NOW() - INTERVAL '2 minutes' WHERE email = $1 AND purpose = 'reset_password' AND consumed_at IS NULL", [M.email])
    await security.locator('button:has-text("Send code")').click()
    await p1.waitForSelector('text=Code sent to')
    await plantOtp(pool, { email: M.email, purpose: 'reset_password', code: CODE, merchantId: M.id })

    // A wrong code (valid password) goes back to the code step with the server's sentence.
    await typeCode(p1, '000000')
    await p1.waitForSelector('#password')
    await p1.fill('#password', PASSWORD_2)
    await p1.fill('#confirm_password', PASSWORD_2)
    await security.locator('button[type=submit]:has-text("Update password")').click()
    await p1.waitForSelector('[data-section="security"] [role=alert]:has-text("Code is invalid or expired.")')
    ok('a wrong code returns to the code step with the server\'s message', (await p1.locator('input[aria-label="Digit 1 of 6"]').count()) === 1)

    await typeCode(p1, CODE)
    await p1.waitForSelector('#password')
    await p1.fill('#password', PASSWORD_2)
    await p1.fill('#confirm_password', PASSWORD_2)
    await security.locator('button[type=submit]:has-text("Update password")').click()
    await p1.waitForSelector(`[role=status]:has-text("Password changed. You've been signed out on other devices.")`)
    ok('the code flow changes the password and shows the success message', true)
    ok('this tab is still signed in and back on the change-password form', (await p1.locator('#current_password').count()) === 1 && (await p1.locator('main h1:has-text("Profile")').count()) === 1)
    const [c3, p3] = await newContext(1280)
    await p3.goto(url, { waitUntil: 'networkidle' })
    await p3.fill('#email', M.email)
    await p3.fill('#password', PASSWORD_2)
    await p3.click('button[type=submit]')
    await p3.waitForSelector('aside h1')
    ok('the new password works for a fresh login', true)
    await c3.close()
  })

  await section('log out other devices + sign-ins', async () => {
    const [c2, p2] = await newContext(1280)
    await login(p2, M.email, PASSWORD_2)
    await openProfile(p2)
    const security = p1.locator('[data-section="security"]')
    await security.locator('button:has-text("Log out other devices")').click()
    await p1.waitForSelector('[role=dialog]:has-text("Log out other devices?")')
    await p1.locator('[role=dialog] button:has-text("Log out other devices")').click()
    await p1.waitForSelector('[role=status]:has-text("Signed out on your other devices")')
    ok('logout-others shows a success toast', true)
    ok('this tab stays signed in', (await p1.locator('main h1:has-text("Profile")').count()) === 1)
    await p1.reload({ waitUntil: 'networkidle' })
    await p1.waitForSelector('aside h1')
    ok('this tab is still signed in after a reload', true)

    // The other browser did not reload: its next profile action finds the session dead and goes to login.
    await p2.click('[data-section="business"] button:has-text("Edit")')
    await p2.fill('#profile-business-name', 'Should Not Save')
    await p2.click('button[type=submit]:has-text("Save")')
    await p2.waitForSelector('#email')
    ok('a 401 from a profile call (no reload) sends the other browser to login', (await p2.locator('aside').count()) === 0)
    const { rows: still } = await pool.query('SELECT business_name FROM merchants WHERE id = $1', [M.id])
    ok('and nothing was saved by the dead session', still[0].business_name === 'Renamed Profile Tents')
    await c2.close()

    await openProfile(p1)
    await p1.waitForSelector('[data-testid="sign-in-list"] li')
    const items = p1.locator('[data-testid="sign-in-list"] li')
    const count = await items.count()
    ok('recent sign-ins lists the logins (max 10)', count >= 3 && count <= 10, String(count))
    ok('only the newest row is marked "Most recent"', (await p1.locator('text=Most recent').count()) === 1 && (await items.first().innerText()).includes('Most recent'))
    ok('the list never says "This device"', (await p1.locator('[data-testid="sign-in-list"]').innerText()).includes('This device') === false)
    ok('each row has a device label and a relative time', /\w+ on \w+/.test(await items.first().innerText()) && /just now|minute|hour/.test(await items.first().innerText()), await items.first().innerText())
    ok('no IP address anywhere in the sign-in list', !/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(await p1.locator('[data-testid="sign-in-list"]').innerText()))
    await pool.query('DELETE FROM sign_in_log WHERE merchant_id = $1', [M.id])
    await p1.click('aside button:has-text("Calendar")')
    await openProfile(p1)
    await p1.waitForSelector('text=No sign-ins recorded yet.')
    ok('an empty list says "No sign-ins recorded yet."', true)
  })

  let NEW_EMAIL = emailFor('fresh')
  await section('change email', async () => {
    await p1.click('[data-section="account"] button:has-text("Change email")')
    await p1.fill('#new-email', T.email)
    await p1.fill('#change-email-password', 'definitely-wrong-1')
    await p1.click('button[type=submit]:has-text("Send code")')
    await p1.waitForSelector('[role=dialog] [role=alert]:has-text("Incorrect password.")')
    ok('a wrong password stays on step 1 with "Incorrect password."', (await p1.locator('#new-email').count()) === 1)
    await p1.fill('#change-email-password', PASSWORD_2)
    await p1.click('button[type=submit]:has-text("Send code")')
    await p1.waitForSelector(`text=${GENERIC_SENT} ${mask(T.email)}.`)
    ok('a taken address gets the generic message with the masked address', true)
    const dialogText = await p1.locator('[role=dialog]').innerText()
    ok('the message never says the address is taken or in use', !/taken|already|in use|registered|exists/i.test(dialogText), dialogText)
    ok('the full new address is not on the page', !(await bodyText(p1)).includes(T.email))
    await typeCode(p1, '123')
    await p1.click('text=Wrong email? Change it')
    ok('going back keeps the address in the field', (await p1.inputValue('#new-email')) === T.email)
    await p1.fill('#new-email', NEW_EMAIL)
    await p1.click('button[type=submit]:has-text("Send code")')
    await p1.waitForSelector(`text=${GENERIC_SENT} ${mask(NEW_EMAIL)}.`)
    ok('changing the address in step 1 resets step 2 (empty boxes, no stale address)',
      (await p1.locator('input[aria-label="Digit 1 of 6"]').inputValue()) === '' && (await p1.locator('input[aria-label="Digit 3 of 6"]').inputValue()) === '' && !(await bodyText(p1)).includes(mask(T.email)))
    ok('the resend button counts down', /Resend code in \d:\d\d/.test(await p1.locator('[role=dialog] button:has-text("Resend code")').innerText()))
    await sleep(2500) // the server issues the real code after it replies; the planted one must come after it
    await plantOtp(pool, { email: NEW_EMAIL, purpose: 'change_email', code: '135790', merchantId: M.id })
    await typeCode(p1, '999999')
    await p1.waitForSelector('[role=dialog] [role=alert]:has-text("Code is invalid or expired.")')
    ok('a wrong code shows the server\'s message and clears the boxes', (await p1.locator('input[aria-label="Digit 1 of 6"]').inputValue()) === '')
    await typeCode(p1, '135790')
    await p1.waitForSelector(`[role=status]:has-text("Email updated. You've been signed out on other devices.")`)
    ok('success: "Email updated. You\'ve been signed out on other devices."', true)
    ok('the modal closed', (await p1.locator('[role=dialog]').count()) === 0)
    await p1.waitForSelector(`[data-section="account"] >> text=${mask(NEW_EMAIL)}`)
    ok('the profile was refetched: Account shows the new masked address', true)
    const { rows: swapped } = await pool.query('SELECT email FROM merchants WHERE id = $1', [M.id])
    ok('the email is changed in the database', swapped[0].email === NEW_EMAIL)
    ok('the full new address is not on the page', !(await bodyText(p1)).includes(NEW_EMAIL))
    await p1.reload({ waitUntil: 'networkidle' })
    await p1.waitForSelector('aside h1')
    ok('this tab is still signed in after the change', true)
    await openProfile(p1)
  })

  await section('delete account', async () => {
    await p1.click('[data-section="danger"] button:has-text("Delete account")')
    await p1.waitForSelector('#delete-password')
    const modalText = await p1.locator('[role=dialog]').innerText()
    ok('the modal explains what is deleted and that it cannot be undone', /bookings, inventory, expenses and settings/.test(modalText) && /can.t\s+be undone/.test(modalText.replace(/\n/g, ' ')), modalText)
    const deleteButton = p1.locator('[role=dialog] button:has-text("Delete my account")')
    ok('the delete button starts disabled', await deleteButton.isDisabled())
    await p1.fill('#delete-password', PASSWORD_2)
    await p1.fill('#delete-business-name', 'Renamed Profile')
    ok('a partial name keeps it disabled', await deleteButton.isDisabled())
    await p1.fill('#delete-business-name', 'renamed profile tents')
    ok('a wrong-case name keeps it disabled', await deleteButton.isDisabled())
    await p1.fill('#delete-business-name', 'Renamed Profile Tents')
    ok('the exact name enables it', !(await deleteButton.isDisabled()))
    // A wrong password is reported inline and nothing is deleted.
    await p1.fill('#delete-password', 'definitely-wrong-1')
    await deleteButton.click()
    await p1.waitForSelector('[role=dialog] [role=alert]:has-text("Incorrect password.")')
    ok('a wrong password shows an error and deletes nothing', (await pool.query('SELECT 1 FROM merchants WHERE id = $1', [M.id])).rowCount === 1)
    await p1.fill('#delete-password', PASSWORD_2)
    await deleteButton.click()
    await p1.waitForSelector('text=Your account has been deleted.')
    ok('success lands on the login screen with "Your account has been deleted."', (await p1.locator('#email').count()) === 1)
    ok('the merchant row is gone from the database', (await pool.query('SELECT 1 FROM merchants WHERE id = $1', [M.id])).rowCount === 0)
    ok('no merchant data is left in the browser state (sidebar and profile are gone)', (await p1.locator('aside').count()) === 0 && !(await bodyText(p1)).includes('Renamed Profile Tents'))
    await p1.fill('#email', NEW_EMAIL)
    await p1.fill('#password', PASSWORD_2)
    await p1.click('button[type=submit]')
    await p1.waitForSelector('[role=alert], .text-red-700')
    await sleep(500)
    ok('logging back in with the deleted account fails', (await p1.locator('aside').count()) === 0 && (await p1.locator('#email').count()) === 1)
    await p1.reload({ waitUntil: 'networkidle' })
    ok('after a reload the app is still on the login screen', (await p1.locator('#email').count()) === 1)
  })
  await c1.close()

  // 429: after 5 wrong passwords the server's own sentence is shown as-is on /password and /email/send.
  await section('rate limit messages', async () => {
    const L = await seedMerchant({ tag: 'limited', name: 'Limited Tents', bookings: false })
    const [c, p] = await newContext(1280)
    await login(p, L.email, PASSWORD_0)
    await openProfile(p)
    const statuses = await p.evaluate(async () => {
      const out = []
      for (let i = 0; i < 5; i += 1) {
        const res = await fetch('/api/profile/password', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: `wrong-pass-${i}`, new_password: 'Another-Pass-5678' }) })
        out.push(res.status)
      }
      return out
    })
    ok('five wrong passwords were counted (401 each)', statuses.every((s) => s === 401), statuses.join(','))
    const TOO_MANY = 'Too many attempts. Please try again in 15 minutes.'
    await p.fill('#current_password', PASSWORD_0)
    await p.fill('#password', PASSWORD_1)
    await p.fill('#confirm_password', PASSWORD_1)
    await p.locator('[data-section="security"] button[type=submit]:has-text("Change password")').click()
    await p.locator('[role=dialog]:has-text("Change your password?") button:has-text("Change password")').click()
    await p.waitForSelector(`[data-section="security"] [role=alert]:has-text("${TOO_MANY}")`)
    ok('/password: the 429 shows the server message as-is', true)
    ok('/password: a 429 does not sign the tab out', (await p.locator('main h1:has-text("Profile")').count()) === 1)
    await p.click('[data-section="account"] button:has-text("Change email")')
    await p.fill('#new-email', emailFor('limited-new'))
    await p.fill('#change-email-password', PASSWORD_0)
    await p.click('button[type=submit]:has-text("Send code")')
    await p.waitForSelector(`[role=dialog] [role=alert]:has-text("${TOO_MANY}")`)
    ok('/email/send: the 429 shows the server message as-is and stays on step 1', (await p.locator('#new-email').count()) === 1)
    await c.close()
  })

  // The privacy page covers the new data.
  await section('privacy page', async () => {
    const [c, p] = await newContext(1280)
    await p.goto(`${url}privacy`, { waitUntil: 'networkidle' })
    const text = await bodyText(p)
    ok('/privacy mentions recent sign-ins (device label and time, no IP, last 10)', /recent sign-ins/i.test(text) && /no IP/i.test(text) && /10 sign-ins/.test(text))
    ok('/privacy mentions security notice emails', /security-related/.test(text) && /password is\s+changed/.test(text.replace(/\n/g, ' ')))
    ok('/privacy explains immediate, permanent account deletion', /immediate and permanent/.test(text))
    ok('/privacy mentions the stored WhatsApp number', /WhatsApp number/.test(text))
    await c.close()
  })
} catch (err) {
  console.log('ERROR', err.message.split('\n')[0], (err.stack.match(/verify-profile-ui\.mjs:\d+/) || [])[0] ?? '')
  results.push(false)
} finally {
  await browser?.close()
  await proxy?.close()
  rmSync(distDir, { recursive: true, force: true })
  await cleanup()
  await pool.end()
}

console.log(`Screenshots (375px): ${SHOTS}`)
const failed = results.filter((r) => !r)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
