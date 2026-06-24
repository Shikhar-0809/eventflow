/**
 * Verify BUGS.md #019 fix — discard confirmation on dirty modal/detail nav.
 * Run from repo root: node server/scripts/verify-booking-discard-guard.mjs
 * Requires: playwright (server devDependency), frontend :5173, backend :3001
 */
import { chromium } from 'playwright'
import { armBrowserDialog, openAuthedPlaywrightPage } from './lib/verifyPlaywright.mjs'

const results = []
const pass = (check, detail) => results.push({ check, status: 'PASS', detail })
const fail = (check, detail) => results.push({ check, status: 'FAIL', detail })

async function clickNav(page, label, mobile) {
  if (mobile) {
    await page.locator('header button[aria-label="Open navigation menu"]').click()
  }
  await page.locator(`aside nav button:has-text("${label}")`).click()
}

const browser = await chromium.launch({ headless: true })

try {
  for (const [label, width, mobile] of [
    ['1280', 1280, false],
    ['375', 375, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    let page

    try {
      page = await openAuthedPlaywrightPage(context, { width, height: mobile ? 812 : 900 })

      // (a) empty modal — nav closes silently, no dialog
      await page.locator('button:has-text("New Booking")').click()
      await page.waitForSelector('text=Confirm Booking')
      const emptyNavDialogPromise = armBrowserDialog(page)
      await clickNav(page, 'Analytics', mobile)
      await page.waitForSelector('text=Business Analytics', { timeout: 5000 })
      const emptyNavDialog = await emptyNavDialogPromise
      if (!emptyNavDialog.shown) {
        pass(`${label}: empty modal nav closes silently`, 'no confirm dialog; Analytics rendered')
      } else {
        fail(`${label}: empty modal nav closes silently`, 'unexpected confirm dialog')
      }

      // reopen calendar
      await clickNav(page, 'Calendar', mobile)
      await page.waitForSelector('text=Booking Calendar')

      // (b) dirty modal — dismiss keeps modal + input
      await page.locator('button:has-text("New Booking")').click()
      await page.locator('#client_name').fill('Keep Me Client')
      const keepEditingDialogPromise = armBrowserDialog(page, { accept: false, messageIncludes: 'Discard this booking' })
      await clickNav(page, 'Analytics', mobile)
      await page.waitForTimeout(300)
      const keepEditingDialog = await keepEditingDialogPromise
      const modalStillOpen = (await page.locator('text=Confirm Booking').count()) > 0
      const inputPreserved = (await page.locator('#client_name').inputValue()) === 'Keep Me Client'
      if (keepEditingDialog.shown && keepEditingDialog.ok && modalStillOpen && inputPreserved) {
        pass(`${label}: dirty modal Keep Editing`, 'dialog dismissed; modal and input preserved')
      } else {
        fail(
          `${label}: dirty modal Keep Editing`,
          `dialog=${JSON.stringify(keepEditingDialog)} modalOpen=${modalStillOpen} input=${inputPreserved}`,
        )
      }

      // (c) dirty modal — accept discards and navigates
      const discardDialogPromise = armBrowserDialog(page, { accept: true, messageIncludes: 'Discard this booking' })
      await clickNav(page, 'Analytics', mobile)
      await page.waitForSelector('text=Business Analytics', { timeout: 5000 })
      const discardDialog = await discardDialogPromise
      const modalClosed = (await page.locator('text=Confirm Booking').count()) === 0
      if (discardDialog.shown && discardDialog.ok && modalClosed) {
        pass(`${label}: dirty modal Discard navigates`, 'confirmed; modal closed; Analytics visible')
      } else {
        fail(`${label}: dirty modal Discard navigates`, `dialog=${JSON.stringify(discardDialog)} modalClosed=${modalClosed}`)
      }

      // detail drawer — empty note nav silent
      await clickNav(page, 'Calendar', mobile)
      await page.waitForSelector('text=Booking Calendar')
      await page.waitForSelector('.fc-event', { timeout: 10_000 })
      await page.locator('.fc-event').first().click()
      await page.waitForSelector('text=Booking Details')
      const emptyDetailDialogPromise = armBrowserDialog(page)
      await clickNav(page, 'Analytics', mobile)
      await page.waitForSelector('text=Business Analytics', { timeout: 5000 })
      const emptyDetailDialog = await emptyDetailDialogPromise
      if (!emptyDetailDialog.shown) {
        pass(`${label}: empty detail nav closes silently`, 'no confirm; drawer closed')
      } else {
        fail(`${label}: empty detail nav closes silently`, 'unexpected confirm dialog')
      }

      // detail — dirty note dismiss
      await clickNav(page, 'Calendar', mobile)
      await page.waitForSelector('text=Booking Calendar')
      await page.waitForSelector('.fc-event', { timeout: 10_000 })
      await page.locator('.fc-event').first().click()
      await page.waitForSelector('textarea[placeholder*="Note a change"]')
      await page.locator('textarea[placeholder*="Note a change"]').fill('unsaved note text')
      const keepNoteDialogPromise = armBrowserDialog(page, { accept: false, messageIncludes: 'Discard this change note' })
      await clickNav(page, 'My Activity', mobile)
      await page.waitForTimeout(300)
      const keepNoteDialog = await keepNoteDialogPromise
      const drawerOpen = (await page.locator('text=Booking Details').count()) > 0
      const notePreserved = (await page.locator('textarea[placeholder*="Note a change"]').inputValue()) === 'unsaved note text'
      if (keepNoteDialog.shown && keepNoteDialog.ok && drawerOpen && notePreserved) {
        pass(`${label}: dirty detail Keep Editing`, 'dialog dismissed; drawer and note preserved')
      } else {
        fail(
          `${label}: dirty detail Keep Editing`,
          `dialog=${JSON.stringify(keepNoteDialog)} drawer=${drawerOpen} note=${notePreserved}`,
        )
      }

      // detail — dirty note accept
      const discardNoteDialogPromise = armBrowserDialog(page, { accept: true, messageIncludes: 'Discard this change note' })
      await clickNav(page, 'My Activity', mobile)
      await page.waitForSelector('text=Your Activity', { timeout: 5000 })
      const discardNoteDialog = await discardNoteDialogPromise
      if (discardNoteDialog.shown && discardNoteDialog.ok) {
        pass(`${label}: dirty detail Discard navigates`, 'confirmed; drawer closed; My Activity visible')
      } else {
        fail(`${label}: dirty detail Discard navigates`, JSON.stringify(discardNoteDialog))
      }
    } catch (err) {
      fail(`${label} suite`, err.message)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}

const failed = results.filter((r) => r.status === 'FAIL')
console.log(JSON.stringify({ summary: `${results.length - failed.length}/${results.length} passed`, results }, null, 2))
process.exit(failed.length > 0 ? 1 : 0)
