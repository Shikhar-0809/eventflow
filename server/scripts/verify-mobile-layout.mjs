/**
 * 375px layout check of the main screens (calendar, booking form create + edit, booking detail, inventory, analytics,
 * My Activity, Profile, login, sign-up) after the shell change `md:ml-60`. For each screen it takes a screenshot and
 * checks: no page-level sideways scroll, the scrolling content area does not overflow sideways, and every visible
 * element sits inside the viewport unless it lives inside its own horizontal scroller. Dev database only; seeds one
 * fictional merchant (@mobile.example.test) and removes it. Needs the dev API on :3001 (EMAIL_DEV_LOG=true).
 * Run from server/: node scripts/verify-mobile-layout.mjs --confirm-host=<dev db host>
 * Screenshots: SCREENSHOT_DIR, default <tmp>/eventflow-mobile-shots.
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
import { startProdLikeProxy } from './lib/prodLikeProxy.mjs'
import { freshPassword } from './lib/testPassword.mjs'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production.')
  process.exit(1)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SUFFIX = '@mobile.example.test'
const EMAIL = `mobile-${String(Date.now()).slice(-6)}${SUFFIX}`
const PASSWORD = freshPassword()
const SHOTS = process.env.SCREENSHOT_DIR || path.join(tmpdir(), 'eventflow-mobile-shots')
const W = 375

const results = []
const ok = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail && !pass ? ` - ${detail}` : ''}`)
}

// Offenders: visible elements poking out of the viewport that are not inside a horizontal scroller, and fixed
// panels wider than the viewport. The closed mobile drawer (translated off-canvas) is ignored.
const measure = (page) =>
  page.evaluate((width) => {
    const scrollers = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true
      }
      return false
    }
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('aside')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (r.right > width + 1 || r.left < -1) {
        if (!scrollers(el)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} [${Math.round(r.left)}..${Math.round(r.right)}]`)
      }
    }
    const main = document.querySelector('main')
    return {
      docOverflow: document.documentElement.scrollWidth > width,
      mainOverflow: main ? main.scrollWidth > main.clientWidth + 1 : false,
      offenders: out.slice(0, 6),
    }
  }, W)

const check = async (page, name) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, `375-${name}.png`) })
  const m = await measure(page)
  ok(`375px ${name}: no sideways overflow`, !m.docOverflow && !m.mainOverflow && m.offenders.length === 0, JSON.stringify(m))
}

const cleanup = async () => {
  const { rows } = await pool.query('SELECT id FROM merchants WHERE email LIKE $1', [`%${SUFFIX}`])
  const ids = rows.map((r) => r.id)
  if (ids.length > 0) {
    const { rows: tables } = await pool.query("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'merchant_id'")
    for (const { table_name: table } of tables) await pool.query(`DELETE FROM "${table}" WHERE merchant_id = ANY($1)`, [ids])
    await pool.query('DELETE FROM merchants WHERE id = ANY($1)', [ids])
  }
}

const distDir = mkdtempSync(path.join(tmpdir(), 'eventflow-mobile-'))
let proxy
let browser
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
  const url = `http://localhost:${proxy.port}/`

  const hash = await bcrypt.hash(PASSWORD, 4)
  const { rows } = await pool.query('INSERT INTO merchants (business_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', ['Mobile Check Tents', EMAIL, hash])
  const id = rows[0].id
  const today = new Date().toISOString().slice(0, 10)
  await pool.query(
    `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, venue, status, advance, total)
     VALUES ($1, 'Sample Client', '9876500001', 'wedding', $2, 120, 'Sample Lawn', 'confirmed', 2000, 10000),
            ($1, 'Another Client', '9876500002', 'birthday', '2099-02-20', 40, 'Sample Hall', 'pending', 0, 5000)`,
    [id, today],
  )
  await pool.query("INSERT INTO inventory_items (merchant_id, name, total_quantity, unit_price) VALUES ($1, 'Chairs', 100, 5), ($1, 'Tables', 20, 50)", [id])

  const context = await browser.newContext({ viewport: { width: W, height: 800 }, extraHTTPHeaders: { 'x-test-ip': `203.0.113.${Number(String(Date.now()).slice(-2)) + 100}` } })
  const page = await context.newPage()
  const shell = async () => {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector('aside h1')
  }
  const goto = async (label) => {
    await page.click('button[aria-label="Open navigation menu"]')
    await page.click(`aside button:has-text("${label}")`)
  }

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('#email')
  await check(page, 'login')
  await page.click('text=Sign up')
  await page.waitForSelector('#otp-email')
  await check(page, 'signup')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForSelector('aside h1')

  await page.waitForSelector('.fc')
  await check(page, 'calendar')

  await page.click('button:has-text("New Booking")')
  await page.waitForSelector('[role=dialog], form')
  await check(page, 'booking-create')

  await shell()
  await goto('Pending Balances')
  await page.click('button:has-text("View Booking")')
  await page.waitForSelector('[role=dialog]:has-text("Booking Details")')
  await check(page, 'booking-detail')
  await page.click('button[aria-label="Edit"]')
  await page.waitForTimeout(800)
  await check(page, 'booking-edit')

  await shell()
  await goto('Inventory')
  await page.waitForSelector('text=Chairs')
  await check(page, 'inventory')
  await goto('Analytics')
  await page.waitForTimeout(1500)
  await check(page, 'analytics')
  await goto('My Activity')
  await page.waitForTimeout(1000)
  await check(page, 'my-activity')
  await goto('Profile')
  await page.waitForSelector('[data-section="danger"]')
  await check(page, 'profile')
} catch (err) {
  console.log('ERROR', err.message.split('\n')[0], (err.stack.match(/verify-mobile-layout\.mjs:\d+/) || [])[0] ?? '')
  results.push(false)
} finally {
  await browser?.close()
  await proxy?.close()
  rmSync(distDir, { recursive: true, force: true })
  await cleanup()
  await pool.end()
}

console.log(`Screenshots: ${SHOTS}`)
const failed = results.filter((r) => !r)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
