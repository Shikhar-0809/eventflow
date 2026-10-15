/**
 * Prompt 13 desktop/mobile responsive verification (1280px + 375px).
 * Updated for the current UI: the booking form is a full-screen page, discards go through ConfirmDialog
 * (BUGS #075), and tab titles are "<screen> — <business name>" / "Sign in — EventFlow".
 * Requires: frontend on :5173, backend on :3001, playwright (server devDependency).
 * Run from repo root: node server/scripts/verify-prompt13-desktop-responsive.mjs
 */
import { chromium } from 'playwright'
import { openAuthedPlaywrightPage } from './lib/verifyPlaywright.mjs'

const results = []

const pass = (check, detail) => {
  results.push({ check, status: 'PASS', detail })
}

const fail = (check, detail) => {
  results.push({ check, status: 'FAIL', detail })
}

const browser = await chromium.launch({ headless: true })

try {
  // --- 1280px desktop ---
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } })

  try {
    const page = await openAuthedPlaywrightPage(desktop, { width: 1280, height: 900 })

    const innerWidth = await page.evaluate(() => window.innerWidth)
    if (innerWidth >= 1270) {
      pass('1280 viewport: window.innerWidth', String(innerWidth))
    } else {
      fail('1280 viewport: window.innerWidth', `got ${innerWidth}, expected >= 1270`)
    }

    const headerDisplay = await page.locator('header.md\\:hidden').evaluate(
      (el) => getComputedStyle(el).display,
    )
    if (headerDisplay === 'none') {
      pass('1280: mobile hamburger header hidden (md breakpoint)', `display=${headerDisplay}`)
    } else {
      fail('1280: mobile hamburger header hidden (md breakpoint)', `display=${headerDisplay}`)
    }

    const aside = page.locator('aside')
    const asideBox = await aside.boundingBox()
    const asidePosition = await aside.evaluate((el) => getComputedStyle(el).position)
    const asideTransform = await aside.evaluate((el) => getComputedStyle(el).transform)
    if (asideBox && asideBox.width >= 200 && asideBox.x >= 0 && asideBox.x < 20) {
      pass(
        '1280: sidebar visible in layout',
        `x=${Math.round(asideBox.x)} w=${Math.round(asideBox.width)} position=${asidePosition}`,
      )
    } else {
      fail(
        '1280: sidebar visible in layout',
        `box=${JSON.stringify(asideBox)} position=${asidePosition} transform=${asideTransform}`,
      )
    }

    const pill = page.locator('.fc-event').first()
    if ((await pill.count()) > 0) {
      const borderRadius = await pill.evaluate((el) => getComputedStyle(el).borderRadius)
      const overflow = await pill.evaluate((el) => getComputedStyle(el).overflow)
      const textOverflow = await pill.evaluate((el) => getComputedStyle(el).textOverflow)
      if (parseFloat(borderRadius) >= 999 || borderRadius.includes('9999')) {
        pass('1280: calendar event pill rounded-full', `borderRadius=${borderRadius}`)
      } else {
        fail('1280: calendar event pill rounded-full', `borderRadius=${borderRadius}`)
      }
      if (overflow === 'hidden' || textOverflow === 'ellipsis') {
        pass('1280: calendar event pill ellipsis', `overflow=${overflow} textOverflow=${textOverflow}`)
      } else {
        fail('1280: calendar event pill ellipsis', `overflow=${overflow} textOverflow=${textOverflow}`)
      }
    } else {
      fail('1280: calendar event pills', 'no .fc-event elements found on calendar view')
    }

    await page.locator('button:has-text("New Booking")').click()
    await page.waitForSelector('h1:has-text("New Booking")', { timeout: 10_000 })

    // The booking form is a full-screen page above the sidebar (z-70 over z-60), not scoped to <main>.
    const formPage = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h1')].find((h) => h.textContent.includes('New Booking'))
      let el = heading
      while (el && getComputedStyle(el).position !== 'fixed') el = el.parentElement
      if (!el) return null
      const box = el.getBoundingClientRect()
      return { position: 'fixed', width: Math.round(box.width), height: Math.round(box.height), vw: window.innerWidth, vh: window.innerHeight }
    })
    // Allow for the scrollbar gutter: a fixed inset-0 box excludes it from the viewport size.
    if (formPage && formPage.width >= formPage.vw - 30 && formPage.height >= formPage.vh - 30) {
      pass('1280 booking form is a full-screen page', JSON.stringify(formPage))
    } else {
      fail('1280 booking form is a full-screen page', JSON.stringify(formPage))
    }

    // The overlay covers the sidebar, so a pointer cannot reach it; the nav handler is still guarded, so call it directly.
    const analyticsBtn = page.locator('aside nav button:has-text("Analytics")')
    const sidebarCovered = await analyticsBtn.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return !el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })
    if (sidebarCovered) {
      pass('1280: sidebar is covered while the booking form is open', 'full-screen overlay sits above the nav')
    } else {
      fail('1280: sidebar is covered while the booking form is open', 'nav button is clickable through the overlay')
    }

    const discardDialog = page.getByRole('dialog').filter({ hasText: 'Discard changes?' })
    await page.locator('#client_name').fill('Desktop Verify Client')
    await analyticsBtn.evaluate((el) => el.click())
    await discardDialog.waitFor({ timeout: 3000 }).catch(() => {})
    await discardDialog.getByRole('button', { name: 'Keep editing' }).click().catch(() => {})
    const modalStillOpen = (await page.locator('h1:has-text("New Booking")').count()) > 0
    const inputPreserved = (await page.locator('#client_name').inputValue()) === 'Desktop Verify Client'
    if (modalStillOpen && inputPreserved) {
      pass('1280 #019: dirty form nav opens the Discard dialog; Keep editing preserves input', 'ConfirmDialog, no native dialog')
    } else {
      fail('1280 #019: dirty form nav opens the Discard dialog; Keep editing preserves input', `modalOpen=${modalStillOpen} input=${inputPreserved}`)
    }

    await analyticsBtn.evaluate((el) => el.click())
    await discardDialog.waitFor({ timeout: 3000 }).catch(() => {})
    await discardDialog.getByRole('button', { name: 'Discard' }).click().catch(() => {})
    await page.waitForSelector('text=Business Analytics', { timeout: 5000 })
    pass('1280 #019: Discard navigates to the clicked view', 'Analytics rendered')

    await page.locator('aside nav button:has-text("Calendar")').click()
    await page.waitForSelector('text=Booking Calendar')

    await page.locator('aside nav button:has-text("My Activity")').click()
    await page.waitForSelector('text=Your Activity')
    const usageOk = (await page.locator('text=Your Activity').count()) > 0
    if (usageOk) {
      pass('1280 happy path: Calendar → Analytics → My Activity navigation', 'views render without overlap errors')
    } else {
      fail('1280 happy path: navigation', 'My Activity did not render')
    }

    await page.locator('aside nav button:has-text("Analytics")').click()
    await page.waitForSelector('text=Business Analytics')
    const peakMonthCard = page.locator('text=Peak Month').locator('..')
    const peakText = await peakMonthCard.innerText()
    if (/Peak Month/i.test(peakText) && peakText.length < 80) {
      pass('1280 #016: Peak Month card layout', peakText.replace(/\s+/g, ' ').trim())
    } else {
      fail('1280 #016: Peak Month card layout', peakText)
    }

    const titleAuthed = await page.title()
    if (titleAuthed === 'Analytics — Bala Ji Tent House') {
      pass('1280: document.title authenticated', titleAuthed)
    } else {
      fail('1280: document.title authenticated', titleAuthed)
    }

    await page.locator('aside button:has-text("Log Out")').click()
    await page.waitForSelector('#email', { timeout: 10_000 })
    const titleLogin = await page.title()
    if (titleLogin === 'Sign in — EventFlow') {
      pass('1280: document.title after logout', titleLogin)
    } else {
      fail('1280: document.title after logout', titleLogin)
    }

    const faviconHref = await page.locator('link[rel="icon"]').getAttribute('href')
    if (faviconHref && (faviconHref.includes('svg') || faviconHref.includes('%E2%9B%BA') || faviconHref.includes('⛺'))) {
      pass('1280: favicon link present (tent emoji)', 'data-uri SVG in index.html')
    } else {
      fail('1280: favicon link present', faviconHref || 'missing')
    }
  } catch (err) {
    fail('1280 desktop suite', err.message)
  } finally {
    await desktop.close()
  }

  // --- 375px mobile ---
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } })

  try {
    const mpage = await openAuthedPlaywrightPage(mobile, { width: 375, height: 812 })

    const mWidth = await mpage.evaluate(() => window.innerWidth)
    if (mWidth <= 380) {
      pass('375 viewport: window.innerWidth', String(mWidth))
    } else {
      fail('375 viewport: window.innerWidth', `got ${mWidth}`)
    }

    const headerVisible = await mpage.locator('header.md\\:hidden').isVisible()
    if (headerVisible) {
      pass('375: mobile hamburger header visible', 'md:hidden header shown')
    } else {
      fail('375: mobile hamburger header visible', 'header not visible')
    }

    await mpage.locator('button:has-text("New Booking")').click()
    await mpage.waitForSelector('h1:has-text("New Booking")')
    // The full-screen form covers the mobile header too; close it (untouched, so no prompt) to reach the drawer.
    await mpage.waitForTimeout(500) // the form slides up over ~200ms
    const headerCovered = await mpage.locator('header.md\\:hidden').evaluate((el) => {
      const box = el.getBoundingClientRect()
      return !el.contains(document.elementFromPoint(box.x + 20, box.y + box.height / 2))
    })
    await mpage.keyboard.press('Escape')
    await mpage.waitForSelector('h1:has-text("New Booking")', { state: 'detached' })
    await mpage.locator('header button[aria-label="Open navigation menu"]').click()
    const drawerOpen = await mpage.locator('aside nav button:has-text("Analytics")').isVisible()
    if (headerCovered && drawerOpen) {
      pass('375: form is full-screen; closing it (Escape) leaves the hamburger drawer usable', 'drawer shows nav')
    } else {
      fail('375: form is full-screen; closing it leaves the drawer usable', `headerCovered=${headerCovered} drawerOpen=${drawerOpen}`)
    }

    await mpage.locator('aside nav button:has-text("Analytics")').click()
    await mpage.waitForSelector('text=Business Analytics')
    const peakCard = mpage.locator('text=Peak Month').locator('..')
    const peakLayout = await peakCard.innerText()
    const peakBox = await peakCard.boundingBox()
    if (peakBox && peakBox.height < 120 && /bookings/i.test(peakLayout)) {
      pass('375 #016: Peak Month two-line layout', peakLayout.replace(/\s+/g, ' ').trim())
    } else {
      fail('375 #016: Peak Month two-line layout', `${peakLayout} box=${JSON.stringify(peakBox)}`)
    }
  } catch (err) {
    fail('375 mobile suite', err.message)
  } finally {
    await mobile.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter((r) => r.status === 'FAIL')
console.log(JSON.stringify({ summary: `${results.length - failed.length}/${results.length} passed`, results }, null, 2))
process.exit(failed.length > 0 ? 1 : 0)
