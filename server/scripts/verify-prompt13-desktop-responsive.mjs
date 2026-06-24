/**
 * Prompt 13 desktop/mobile responsive verification (1280px + 375px).
 * Requires: frontend on :5173, backend on :3001, playwright (server devDependency).
 * Run from repo root: node server/scripts/verify-prompt13-desktop-responsive.mjs
 */
import { chromium } from 'playwright'
import { armBrowserDialog, openAuthedPlaywrightPage } from './lib/verifyPlaywright.mjs'

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
    await page.waitForSelector('text=Confirm Booking', { timeout: 10_000 })

    const mainBox = await page.locator('main').boundingBox()
    const modalRoot = page.locator('main > div.absolute.inset-0.z-50').first()
    const modalBox = await modalRoot.boundingBox()
    const modalPosition = await modalRoot.evaluate((el) => getComputedStyle(el).position)

    const sidebarStillVisible =
      asideBox && (await aside.isVisible()) && (await aside.boundingBox())?.width >= 200
    const modalScopedToMain =
      modalPosition === 'absolute' &&
      mainBox &&
      modalBox &&
      modalBox.x >= asideBox.width - 2 &&
      Math.abs(modalBox.x - mainBox.x) < 4

    if (sidebarStillVisible && modalScopedToMain) {
      pass(
        '1280 #015: sidebar reachable beside modal (modal scoped to main)',
        `sidebarW=${Math.round(asideBox.width)} modalX=${Math.round(modalBox.x)} mainX=${Math.round(mainBox.x)} position=${modalPosition}`,
      )
    } else {
      fail(
        '1280 #015: sidebar reachable beside modal (modal scoped to main)',
        `sidebarVisible=${sidebarStillVisible} modalScoped=${modalScopedToMain} modalBox=${JSON.stringify(modalBox)} mainBox=${JSON.stringify(mainBox)}`,
      )
    }

    const analyticsBtn = page.locator('aside nav button:has-text("Analytics")')
    if (await analyticsBtn.isVisible()) {
      pass('1280: Analytics nav button visible while modal open', 'sidebar nav exposed')
    } else {
      fail('1280: Analytics nav button visible while modal open', 'button not visible')
    }

    await page.locator('#client_name').fill('Desktop Verify Client')

    const dirtyNavDialogPromise = armBrowserDialog(page, {
      accept: false,
      messageIncludes: 'Discard this booking',
    })
    await analyticsBtn.click()
    const dirtyNavDialog = await dirtyNavDialogPromise
    const modalStillOpen = (await page.locator('text=Confirm Booking').count()) > 0
    const inputPreserved = (await page.locator('#client_name').inputValue()) === 'Desktop Verify Client'
    if (dirtyNavDialog.shown && dirtyNavDialog.ok && modalStillOpen && inputPreserved) {
      pass(
        '1280 #019: dirty modal nav prompts and Keep Editing preserves input',
        dirtyNavDialog.message,
      )
    } else {
      fail(
        '1280 #019: dirty modal nav prompts and Keep Editing preserves input',
        `dialog=${JSON.stringify(dirtyNavDialog)} modalOpen=${modalStillOpen} input=${inputPreserved}`,
      )
    }

    const discardNavDialogPromise = armBrowserDialog(page, {
      accept: true,
      messageIncludes: 'Discard this booking',
    })
    await analyticsBtn.click()
    await page.waitForSelector('text=Business Analytics', { timeout: 5000 })
    const discardNavDialog = await discardNavDialogPromise
    if (discardNavDialog.shown && discardNavDialog.ok) {
      pass('1280 #019: dirty modal Discard navigates', 'confirmed discard; Analytics rendered')
    } else {
      fail('1280 #019: dirty modal Discard navigates', JSON.stringify(discardNavDialog))
    }

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
    if (titleAuthed.includes('Bala Ji Tent House')) {
      pass('1280: document.title authenticated', titleAuthed)
    } else {
      fail('1280: document.title authenticated', titleAuthed)
    }

    await page.locator('aside button:has-text("Log Out")').click()
    await page.waitForSelector('text=EventFlow', { timeout: 10_000 })
    const titleLogin = await page.title()
    if (titleLogin.includes('Log In')) {
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
    await mpage.waitForSelector('text=Confirm Booking')
    await mpage.locator('header button[aria-label="Open navigation menu"]').click()
    const drawerOpen = await mpage.locator('aside nav button:has-text("Analytics")').isVisible()
    if (drawerOpen) {
      pass('375 #015: drawer reachable over open modal', 'hamburger opens nav while modal open')
    } else {
      fail('375 #015: drawer reachable over open modal', 'Analytics button not visible in drawer')
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
