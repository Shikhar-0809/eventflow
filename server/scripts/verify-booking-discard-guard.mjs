/**
 * Verify BUGS #075 — the booking form's discard guard (ConfirmDialog, no native dialogs).
 * Run from repo root: node server/scripts/verify-booking-discard-guard.mjs
 * Requires: playwright (server devDependency), frontend :5173, backend :3001, dev database seeded.
 * Creates a few "ZZZ_TEST" bookings on the seeded demo merchant and deletes them afterwards.
 * Exits 0 only if every check passes.
 */
import { chromium } from 'playwright'
import { VERIFY_API_BASE, getVerifyCookieHeader, openAuthedPlaywrightPage } from './lib/verifyPlaywright.mjs'

const results = []
const record = (check, ok, detail = '') => {
  results.push({ check, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}${detail ? ` — ${detail}` : ''}`)
}

const isoDate = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const createdIds = []
const nativeDialogs = []
let postCount = 0

try {
  const page = await openAuthedPlaywrightPage(context, { width: 1280, height: 900 })
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message())
    await dialog.dismiss()
  })
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/bookings')) postCount += 1
  })
  page.on('response', async (res) => {
    if (res.request().method() === 'POST' && res.url().endsWith('/api/bookings')) {
      try { createdIds.push((await res.json()).id) } catch { /* not JSON */ }
    }
  })

  const discardDialog = page.getByRole('dialog').filter({ hasText: 'Discard changes?' })
  const shortfallDialog = page.getByRole('dialog').filter({ hasText: 'Inventory Shortfall' })
  const noteDialog = page.getByRole('dialog').filter({ hasText: 'Discard change note?' })
  const formHeading = (text) => page.locator(`h1:has-text("${text}")`)
  const submitButton = (label) => page.locator(`button[type="submit"]:has-text("${label}")`).last()
  const formClosed = (text) => formHeading(text).waitFor({ state: 'detached', timeout: 10_000 })
  const closeForm = () => formHeading('New Booking').locator('xpath=..').getByRole('button', { name: 'Close' }).click()
  const noteBox = () => page.locator('textarea[placeholder*="Log a change or note"]')
  const closeDrawer = () => page.locator('div:has(> h2#booking-detail-title) button[aria-label="Close"]').first().click()

  const openNew = async () => {
    await page.locator('button:has-text("New Booking")').first().click()
    await formHeading('New Booking').waitFor()
  }
  const fillForm = async (name, date) => {
    await page.locator('#client_name').fill(name)
    await page.locator('#phone').fill('9876543210')
    await page.locator('#event_type').selectOption('wedding')
    await page.locator('#event_date').fill(date)
    await page.locator('#guest_count').fill('50')
  }
  const openFirstBookingForEdit = async () => {
    await page.locator('.fc-event').first().click()
    await page.locator('#booking-detail-title').waitFor()
    await page.locator('button[aria-label="Edit"]').first().click()
    await formHeading('Edit Booking').waitFor()
  }
  const noDialogsOpen = async () => (await discardDialog.count()) === 0 && (await shortfallDialog.count()) === 0

  // 1. successful create: no prompt of any kind
  await openNew()
  await fillForm('ZZZ_TEST Discard A', isoDate(200))
  await submitButton('Confirm Booking').click()
  await formClosed('New Booking')
  await page.waitForTimeout(400)
  record('create submit saves and closes with no dialog', createdIds.length === 1 && nativeDialogs.length === 0 && (await noDialogsOpen()))

  // 2. inventory shortfall: only the shortfall dialog; confirming saves with no discard prompt
  await page.route('**/api/inventory/check-availability', (route) =>
    route.fulfill({ json: { sufficient: false, availability: [], shortfalls: [{ item_id: 1, name: 'Chairs', requested: 999, available: 1 }] } }))
  await openNew()
  const checked = page.waitForResponse('**/api/inventory/check-availability')
  await fillForm('ZZZ_TEST Discard B', isoDate(201))
  await checked
  await page.waitForTimeout(400)
  await submitButton('Confirm Booking').click()
  await shortfallDialog.waitFor({ timeout: 5000 })
  record('shortfall shows only the shortfall dialog', (await discardDialog.count()) === 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  record('Escape over the shortfall dialog does not open the discard dialog', (await discardDialog.count()) === 0)
  await shortfallDialog.getByRole('button', { name: 'Cancel' }).click()
  await submitButton('Confirm Booking').click()
  await shortfallDialog.waitFor({ timeout: 5000 })
  await shortfallDialog.getByRole('button', { name: 'Confirm' }).click()
  await formClosed('New Booking')
  await page.waitForTimeout(400)
  record('confirming the shortfall saves with no discard prompt', createdIds.length === 2 && nativeDialogs.length === 0 && (await noDialogsOpen()))
  await page.unroute('**/api/inventory/check-availability')

  // 3. dirty close via X and Escape
  for (const how of ['X', 'Escape']) {
    await openNew()
    await page.locator('#client_name').fill('Keep Me')
    if (how === 'X') await closeForm()
    else await page.keyboard.press('Escape')
    await discardDialog.waitFor({ timeout: 3000 })
    record(`${how}: discard ConfirmDialog opens with Keep editing focused`, (await page.evaluate(() => document.activeElement?.textContent)) === 'Keep editing')
    await discardDialog.getByRole('button', { name: 'Keep editing' }).click()
    record(`${how}: Keep editing preserves the typed values`, (await page.locator('#client_name').inputValue()) === 'Keep Me' && (await discardDialog.count()) === 0)
    if (how === 'X') {
      await closeForm()
      await discardDialog.waitFor()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      record('Escape on the discard dialog means Keep editing', (await discardDialog.count()) === 0 && (await formHeading('New Booking').count()) === 1)
      await closeForm()
      await discardDialog.waitFor()
      await page.locator('div.fixed.inset-0.z-\\[80\\] > button[aria-label="Close"]').click({ position: { x: 5, y: 5 } })
      await page.waitForTimeout(200)
      record('backdrop click on the discard dialog means Keep editing', (await discardDialog.count()) === 0 && (await formHeading('New Booking').count()) === 1)
    }
    await page.keyboard.press('Escape')
    await discardDialog.waitFor()
    await discardDialog.getByRole('button', { name: 'Discard' }).click()
    await formClosed('New Booking')
    await openNew()
    record(`${how}: Discard closes, and the next New Booking opens clean in create mode`, (await page.locator('#client_name').inputValue()) === '' && (await formHeading('Edit Booking').count()) === 0)
    await page.keyboard.press('Escape')
    await formClosed('New Booking')
  }

  // 4. untouched form closes immediately
  await openNew()
  await page.keyboard.press('Escape')
  await formClosed('New Booking')
  record('untouched form closes immediately with no dialog', await noDialogsOpen())

  // 5. sidebar navigation with a dirty form (the overlay covers the sidebar, so trigger its click handler directly)
  const analyticsNav = page.locator('aside nav button:has-text("Analytics")')
  await openNew()
  await page.locator('#client_name').fill('Sidebar Dirty')
  await analyticsNav.evaluate((el) => el.click())
  await discardDialog.waitFor({ timeout: 3000 })
  await discardDialog.getByRole('button', { name: 'Keep editing' }).click()
  record('sidebar + dirty form: Keep editing stays on the form', (await page.locator('#client_name').inputValue()) === 'Sidebar Dirty' && (await page.locator('text=Business Analytics').count()) === 0)
  await analyticsNav.evaluate((el) => el.click())
  await discardDialog.waitFor()
  await discardDialog.getByRole('button', { name: 'Discard' }).click()
  await page.waitForSelector('text=Business Analytics', { timeout: 5000 })
  record('sidebar + dirty form: Discard navigates to the clicked view', (await formHeading('New Booking').count()) === 0)
  await page.locator('aside nav button:has-text("Calendar")').click()
  await page.waitForSelector('.fc-event')

  // 6. edit mode: discard leaves no stale state, save shows no prompt
  await openFirstBookingForEdit()
  await page.locator('#venue').fill(`Verify Venue ${Date.now()}`)
  await page.keyboard.press('Escape')
  await discardDialog.waitFor({ timeout: 3000 })
  await discardDialog.getByRole('button', { name: 'Discard' }).click()
  await formClosed('Edit Booking')
  await closeDrawer()
  await openNew()
  record('edit-mode Discard then New Booking opens a clean create form', (await page.locator('#client_name').inputValue()) === '')
  await page.keyboard.press('Escape')
  await formClosed('New Booking')
  await openFirstBookingForEdit()
  await page.locator('#venue').fill(`Verify Venue ${Date.now()}`)
  await submitButton('Save Changes').click()
  await formClosed('Edit Booking')
  await page.waitForTimeout(400)
  record('edit save shows no discard prompt', await noDialogsOpen())
  await closeDrawer()

  // 7. change-note guard
  await page.locator('.fc-event').first().click()
  await noteBox().waitFor()
  await page.waitForTimeout(2000) // the drawer ignores submits until its detail fetch finishes
  await noteBox().fill('unsaved note')
  await closeDrawer()
  await noteDialog.waitFor({ timeout: 3000 })
  await noteDialog.getByRole('button', { name: 'Keep editing' }).click()
  record('dirty change note + X: Keep editing keeps the note', (await noteBox().inputValue()) === 'unsaved note')
  await closeDrawer()
  await noteDialog.waitFor()
  await noteDialog.getByRole('button', { name: 'Discard' }).click()
  await page.waitForTimeout(300)
  record('dirty change note + X: Discard closes the drawer', (await page.locator('#booking-detail-title').count()) === 0)
  await page.locator('.fc-event').first().click()
  await noteBox().waitFor()
  await page.waitForTimeout(2000)
  await noteBox().fill(`ZZZ verify note ${Date.now()}`)
  await page.locator('button:has-text("Log Change")').click()
  await page.waitForTimeout(1200)
  record('saving a change note shows no prompt and clears the box', (await noteBox().inputValue()) === '' && (await noteDialog.count()) === 0)
  await closeDrawer()
  await page.waitForTimeout(300)
  record('closing the drawer after the save shows no prompt', (await noteDialog.count()) === 0)

  // 8. double click creates one booking
  const postsBefore = postCount
  await openNew()
  await fillForm('ZZZ_TEST Discard C', isoDate(202))
  await page.waitForTimeout(500)
  await submitButton('Confirm Booking').dblclick()
  await formClosed('New Booking')
  await page.waitForTimeout(400)
  record('double-clicking Confirm Booking sends exactly one POST', postCount - postsBefore === 1, `posts=${postCount - postsBefore}`)

  record('no native confirm/alert dialog fired during the whole run', nativeDialogs.length === 0, JSON.stringify(nativeDialogs))
} catch (err) {
  record('script ran to completion', false, err.message)
} finally {
  try {
    const cookie = await getVerifyCookieHeader()
    for (const id of createdIds) {
      await fetch(`${VERIFY_API_BASE}/bookings/${id}`, { method: 'DELETE', headers: { Cookie: cookie } })
    }
    console.log(`cleanup: deleted ${createdIds.length} test booking(s)`)
  } catch (err) {
    console.log(`cleanup failed (delete ZZZ_TEST bookings by hand): ${err.message}`)
  }
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
