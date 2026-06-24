import {
  VERIFY_FRONTEND_URL,
  applyVerifySessionToContext,
  getVerifyCookieHeader,
  invalidateVerifySessionCache,
} from './verifySession.mjs'

export {
  VERIFY_FRONTEND_URL,
  VERIFY_API_BASE,
  VERIFY_TEST_PASSWORD,
  VERIFY_SESSION_CACHE_PATH,
  getVerifySession,
  getVerifyCookieHeader,
  invalidateVerifySessionCache,
  applyVerifySessionToContext,
} from './verifySession.mjs'

export async function openAuthedPlaywrightPage(
  context,
  { width, height = 900, waitFor = 'text=Booking Calendar' } = {},
) {
  await applyVerifySessionToContext(context)
  const page = await context.newPage()
  if (width) {
    await page.setViewportSize({ width, height })
  }
  await page.goto(VERIFY_FRONTEND_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector(waitFor, { timeout: 15_000 })
  return page
}

export function armBrowserDialog(page, { accept = false, messageIncludes } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const handler = async (dialog) => {
      page.off('dialog', handler)
      clearTimeout(timer)
      if (settled) return
      settled = true
      const message = dialog.message()
      if (messageIncludes && !message.includes(messageIncludes)) {
        await dialog.dismiss()
        resolve({ shown: true, ok: false, message })
        return
      }
      if (accept) await dialog.accept()
      else await dialog.dismiss()
      resolve({ shown: true, ok: true, message })
    }
    page.on('dialog', handler)
    const timer = setTimeout(() => {
      page.off('dialog', handler)
      if (settled) return
      settled = true
      resolve({ shown: false, ok: true, message: null })
    }, 2000)
  })
}
