/**
 * Report PDF check (BUGS #091, #095), end to end in Chromium (Playwright) against the DEV stack. Logs in as the dev demo
 * merchant through the real login screen, opens Analytics, generates the report for several date ranges, clicks
 * "Download PDF" in the report window and inspects the downloaded file:
 *   - the download succeeds and the PDF is small (under 5 MB: the image data is compressed, not raw RGB)
 *   - the PDF holds ONE image object (jsPDF reuses it on every page; it is not embedded once per page)
 *   - the page count matches the page layout, which covers the report with no gap, and no booking card is cut by a
 *     page break (#095; also prints how many the old fixed 297 mm cuts would have cut)
 *   - the PDF's image data is pixel-identical to the canvas html2canvas produced (SHA-256 of the RGB bytes)
 * It also prints each canvas area and WARNs (does not fail) when it is over the iOS Safari limit (BUGS #094).
 * Cases are picked from the demo data at run time: an empty range, a small month, the widest window of up to 12
 * months, and a month with expenses (skipped with a SKIP line if the demo data has none). Read-only: it creates and
 * changes nothing in the database. Refuses to run against production.
 *
 * Requires: dev API on :3001 and dev client on :5173 (npm run dev), playwright (server devDependency).
 * Run from server/: node scripts/verify-report-pdf.mjs --confirm-host=<dev db host>
 * Downloaded PDFs go to REPORT_PDF_DIR, default <tmp>/eventflow-report-pdf.
 */
import './lib/guardFirst.mjs'
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { chromium } from 'playwright'
import { authFetch, loginVerifySession, resolveVerifyPassword, VERIFY_LOGIN_EMAIL } from './lib/verifyScriptAuth.mjs'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production.')
  process.exit(1)
}

const FRONTEND = process.env.VERIFY_FRONTEND_URL || 'http://localhost:5173'
const OUT = process.env.REPORT_PDF_DIR || path.join(tmpdir(), 'eventflow-report-pdf')
const IOS_CANVAS_LIMIT = 16_777_216
const MAX_PDF_BYTES = 5 * 1024 * 1024
const A4_RATIO = 297 / 210
const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---- choose the cases from the demo data ----------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthRange = (y, m) => [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))]

const { cookieHeader } = await loginVerifySession()
const fetchReport = async (from, to) => {
  const res = await authFetch(cookieHeader, `/reports/range?from=${from}&to=${to}`)
  if (res.status !== 200) throw new Error(`reports/range ${from}..${to} -> ${res.status}`)
  return res.json()
}

const today = new Date()
const months = []
for (let i = -18; i <= 12; i++) {
  const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
  const [from, to] = monthRange(d.getFullYear(), d.getMonth())
  const data = await fetchReport(from, to)
  months.push({
    from,
    to,
    count: data.bookings.length,
    withExpenses: data.bookings.filter((b) => b.expenses?.length).length,
  })
}

let widest = null
for (let a = 0; a < months.length; a++) {
  for (let b = a; b < months.length && b - a < 12; b++) {
    const count = months.slice(a, b + 1).reduce((s, m) => s + m.count, 0)
    const span = (new Date(months[b].to) - new Date(months[a].from)) / 86_400_000
    if (span <= 365 && (!widest || count > widest.count)) widest = { from: months[a].from, to: months[b].to, count }
  }
}
const small = months
  .filter((m) => m.count >= 6 && m.count <= 25)
  .sort((x, y) => Math.abs(x.count - 12) - Math.abs(y.count - 12))[0]
const expensesMonth = months.filter((m) => m.withExpenses > 0 && m.count <= 30).sort((x, y) => y.withExpenses - x.withExpenses)[0]

const cases = [{ name: 'empty', from: '2000-01-01', to: '2000-01-31', expectCards: 0 }]
if (small) cases.push({ name: 'small', from: small.from, to: small.to, expectCards: small.count })
else console.log('[SKIP] small case: no month with 6-25 bookings in the demo data')
if (widest && widest.count > 0) cases.push({ name: 'large', from: widest.from, to: widest.to, expectCards: widest.count })
else console.log('[SKIP] large case: no bookings in the demo data')
if (expensesMonth) cases.push({ name: 'expenses', from: expensesMonth.from, to: expensesMonth.to, expectCards: expensesMonth.count })
else console.log('[SKIP] expenses case: the demo data has no booking with expenses')

// ---- PDF inspection --------------------------------------------------------------------------------------------
// Undo the PNG row filters of a /Predictor 10-15 stream (8-bit RGB, so 3 bytes per pixel).
const unfilter = (raw, width, height) => {
  const stride = width * 3
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const left = i >= 3 ? cur[i - 3] : 0
      const up = prev ? prev[i] : 0
      const upLeft = prev && i >= 3 ? prev[i - 3] : 0
      let add = 0
      if (filter === 1) add = left
      else if (filter === 2) add = up
      else if (filter === 3) add = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      cur[i] = (line[i] + add) & 255
    }
  }
  return out
}

const inspectPdf = (file) => {
  const buf = readFileSync(file)
  const text = buf.toString('latin1')
  const pages = (text.match(/\/Type\s*\/Page(?!s)/g) || []).length
  const images = [...text.matchAll(/\/Subtype\s*\/Image/g)]
  if (images.length !== 1) return { bytes: buf.length, pages, imageObjects: images.length }
  const objStart = text.lastIndexOf(' obj', images[0].index)
  const dict = text.slice(objStart, text.indexOf('stream', images[0].index))
  const num = (key) => Number(new RegExp(`/${key}\\s+(\\d+)`).exec(dict)?.[1])
  const width = num('Width')
  const height = num('Height')
  const length = num('Length')
  const predictor = Number(/\/Predictor\s+(\d+)/.exec(dict)?.[1] ?? 1)
  const start = text.indexOf('stream', images[0].index) + 'stream'.length + (text[text.indexOf('stream', images[0].index) + 6] === '\r' ? 2 : 1)
  let data = buf.subarray(start, start + length)
  if (/\/FlateDecode/.test(dict)) data = inflateSync(data)
  const rgb = predictor >= 10 ? unfilter(data, width, height) : data
  return { bytes: buf.length, pages, imageObjects: 1, width, height, sha: createHash('sha256').update(rgb).digest('hex'), rgbBytes: rgb.length }
}

// ---- drive the real UI ----------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  // html2canvas runs in the app window: remember the last big canvas handed to toDataURL (what jsPDF receives).
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const result = original.apply(this, args)
      if (this.width > 500) window.__reportCanvas = { url: result, width: this.width, height: this.height }
      return result
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  await page.goto(FRONTEND, { waitUntil: 'networkidle' })
  await page.fill('#email', VERIFY_LOGIN_EMAIL)
  await page.fill('#password', resolveVerifyPassword())
  await page.click('button[type=submit]')
  await page.getByText('Analytics', { exact: true }).first().click()
  await page.waitForSelector('#report_from')

  for (const c of cases) {
    const label = `${c.name} (${c.from}..${c.to}, ${c.expectCards} bookings)`
    await page.evaluate(() => { window.__reportCanvas = null })
    await page.fill('#report_from', c.from)
    await page.fill('#report_to', c.to)
    const popupPromise = context.waitForEvent('page')
    await page.getByRole('button', { name: /Generate Report/ }).click()
    const popup = await popupPromise
    await popup.waitForLoadState()
    const cards = await popup.locator('.booking-card').count()
    // jsPDF runs in the app window, so the download event fires on the app page, not on the report window.
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
    await popup.click('#download-btn')
    let download
    try {
      download = await downloadPromise
    } catch {
      const shown = await popup.locator('#pdf-error').innerText().catch(() => '')
      record(`${label}: download succeeds`, false, shown || 'no download within 120 s')
      await popup.close()
      continue
    }
    const file = path.join(OUT, `${c.name}.pdf`)
    await download.saveAs(file)
    record(`${label}: download succeeds`, true, `${cards} cards in the report`)

    const canvas = await page.evaluate(async () => {
      const captured = window.__reportCanvas
      if (!captured) return null
      const img = new Image()
      img.src = captured.url
      await img.decode()
      const surface = document.createElement('canvas')
      surface.width = img.width
      surface.height = img.height
      const ctx = surface.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const rgba = ctx.getImageData(0, 0, img.width, img.height).data
      const rgb = new Uint8Array(img.width * img.height * 3)
      let opaque = true
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i]
        rgb[j + 1] = rgba[i + 1]
        rgb[j + 2] = rgba[i + 2]
        if (rgba[i + 3] !== 255) opaque = false
      }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgb))
      return { width: img.width, height: img.height, opaque, sha: [...digest].map((b) => b.toString(16).padStart(2, '0')).join('') }
    })
    if (!canvas) {
      record(`${label}: canvas captured`, false, 'toDataURL was never called with a report-sized canvas')
      await popup.close()
      continue
    }

    const area = canvas.width * canvas.height
    console.log(`       canvas ${canvas.width}x${canvas.height} = ${area.toLocaleString('en-US')} px`)
    if (area > IOS_CANVAS_LIMIT) {
      console.log(`[WARN] ${c.name}: canvas area ${area.toLocaleString('en-US')} px exceeds ${IOS_CANVAS_LIMIT.toLocaleString('en-US')} px (iOS Safari canvas limit); this report would fail on iOS (BUGS #094)`)
    }

    const pdf = inspectPdf(file)
    const sizeMb = (pdf.bytes / 1048576).toFixed(2)
    record(`${label}: PDF under 5 MB`, pdf.bytes < MAX_PDF_BYTES, `${sizeMb} MB`)

    record(`${label}: report window shows every booking`, cards === c.expectCards, `${cards} of ${c.expectCards}`)

    // Page layout from the report window (planPdfPages in reportPrinter.js) and every card's position in mm.
    const measured = await popup.evaluate(() => {
      const body = document.getElementById('report-body')
      const top = body.getBoundingClientRect().top
      const mmPerPx = 210 / body.getBoundingClientRect().width
      return {
        layout: window.__reportPdfLayout ?? null,
        cards: [...body.querySelectorAll('.booking-card')].map((c) => {
          const r = c.getBoundingClientRect()
          return { top: (r.top - top) * mmPerPx, bottom: (r.bottom - top) * mmPerPx }
        }),
      }
    })
    const imgHeight = (canvas.height * 210) / canvas.width
    const pages = measured.layout?.pages ?? []
    record(`${label}: page layout was exposed`, pages.length > 0, pages.length ? `${pages.length} pages` : 'window.__reportPdfLayout missing')
    record(`${label}: page count matches the layout`, pdf.pages === pages.length, `${pdf.pages} pages, layout ${pages.length} (${(imgHeight / 297).toFixed(2)} pages of image)`)
    const contiguous = pages.length > 0 && pages[0].startMm === 0 && pages.every((p, i) => i === 0 || Math.abs(p.startMm - pages[i - 1].endMm) < 0.001)
      && Math.abs(pages.at(-1).endMm - imgHeight) < 0.1 && pages.every((p) => p.endMm - p.startMm <= 297 + 0.001) // jsPDF's A4 is 210.0016 x 297.0001 mm, so allow a hair
    record(`${label}: pages cover the whole report with no gap or overlap`, contiguous)

    // Cards that a page break runs through. "Fixed cut" is what the old slicing (every 297 mm) did on this same report.
    const crosses = (card, at) => card.top < at - 0.05 && card.bottom > at + 0.05
    const fixedCuts = []
    for (let at = 297; at < imgHeight; at += 297) fixedCuts.push(at)
    const fixedCrossing = measured.cards.filter((card) => fixedCuts.some((at) => crosses(card, at))).length
    const smartCuts = pages.slice(0, -1).map((p) => p.endMm)
    const crossing = measured.cards.filter((card) => smartCuts.some((at) => crosses(card, at)))
    const tooTall = crossing.filter((card) => card.bottom - card.top > 297)
    console.log(`       cards cut by a page break: ${fixedCrossing} with fixed 297 mm cuts, ${crossing.length} now (${measured.layout?.oversized ?? '?'} taller than a page)`)
    record(`${label}: no card is cut by a page break (except cards taller than a page)`, crossing.length === tooTall.length, `${crossing.length - tooTall.length} cut`)

    record(`${label}: one image object, reused on every page`, pdf.imageObjects === 1, `${pdf.imageObjects} image object(s)`)

    if (pdf.imageObjects === 1) {
      const sameSize = pdf.width === canvas.width && pdf.height === canvas.height && pdf.rgbBytes === canvas.width * canvas.height * 3
      record(`${label}: PDF image has the canvas dimensions`, sameSize, `${pdf.width}x${pdf.height} vs ${canvas.width}x${canvas.height}`)
      record(`${label}: PDF image data is pixel-identical to the canvas`, canvas.opaque && sameSize && pdf.sha === canvas.sha, canvas.opaque ? pdf.sha.slice(0, 12) : 'canvas has transparent pixels')
    }
    await popup.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed (PDFs in ${OUT})`)
process.exit(failed.length > 0 ? 1 : 0)
