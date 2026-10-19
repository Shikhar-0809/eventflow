import { escapeHtml } from './sanitize.js'

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const toINR = (amount) => Number(amount).toLocaleString('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const formatEventType = (booking) => {
  if (booking.event_type === 'other' && booking.event_type_custom) {
    return booking.event_type_custom
  }
  return EVENT_TYPE_LABELS[booking.event_type] ?? 'Other'
}

const formatDisplayDate = (dateStr) => {
  const normalized = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return String(dateStr ?? '')
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(dateStr ?? '')
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatGeneratedAt = (isoString) => {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return String(isoString ?? '')
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const formatRangeDate = (dateStr) => formatDisplayDate(dateStr)

const buildExpensesSection = (booking) => {
  if (!booking.expenses?.length) return ''

  const rows = booking.expenses.map((expense) => `
    <tr>
      <td>${escapeHtml(expense.label)}</td>
      <td class="amount">${escapeHtml(toINR(expense.amount))}</td>
    </tr>
  `).join('')

  const profitClass = booking.profit >= 0 ? 'profit-positive' : 'profit-negative'

  return `
    <div class="expenses-block">
      <p class="expenses-heading">Expenses</p>
      <table class="expenses-table">
        <tbody>
          ${rows}
          <tr class="expenses-total-row">
            <td>Total Expenses</td>
            <td class="amount">${escapeHtml(toINR(booking.total_expenses))}</td>
          </tr>
          <tr class="expenses-profit-row ${profitClass}">
            <td>Profit</td>
            <td class="amount">${escapeHtml(toINR(booking.profit))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `
}

const buildBookingCard = (booking) => {
  const isCancelled = booking.status === 'cancelled'
  const cardClass = isCancelled ? 'booking-card cancelled' : 'booking-card'
  const statusBadge = isCancelled
    ? '<span class="badge badge-cancelled">Cancelled</span>'
    : `<span class="badge badge-status">${escapeHtml(booking.status ?? 'confirmed')}</span>`

  return `
    <article class="${cardClass}">
      <div class="booking-top">
        <h3 class="client-name">${escapeHtml(booking.client_name)}</h3>
        <div class="badges">
          <span class="badge badge-type">${escapeHtml(formatEventType(booking))}</span>
          ${statusBadge}
        </div>
      </div>
      <p class="booking-details">
        ${escapeHtml(formatDisplayDate(booking.event_date))}
        | ${escapeHtml(booking.venue?.trim() || '—')}
        | ${escapeHtml(booking.guest_count)} guests
        | ${escapeHtml(booking.phone)}
      </p>
      <p class="booking-financials">
        Total ${escapeHtml(toINR(booking.total))}
        | Advance ${escapeHtml(toINR(booking.advance))}
        | Balance Due ${escapeHtml(toINR(booking.pending_balance))}
      </p>
      ${buildExpensesSection(booking)}
    </article>
  `
}

const buildReportHtml = (reportData) => {
  const { from, to, generatedAt, summary, bookings, businessName } = reportData
  const displayName = businessName || 'EventFlow'
  const printedAt = formatGeneratedAt(new Date().toISOString())
  const netProfitClass = summary.netProfit >= 0 ? 'profit-positive' : 'profit-negative'

  const bookingCards = bookings.length > 0
    ? bookings.map(buildBookingCard).join('')
    : '<p class="empty-message">No bookings found in this date range.</p>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EventFlow Report — ${escapeHtml(from)} to ${escapeHtml(to)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #0f172a;
      background: #f8fafc;
      line-height: 1.5;
    }
    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px 20px 40px;
    }
    .no-print { margin-bottom: 24px; }
    .pdf-error { margin: 12px 0 0; padding: 8px 12px; border: 1px solid #f87171; background: #fee2e2; color: #b91c1c; border-radius: 8px; font-size: 14px; }
    .download-btn,
    .print-btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-right: 8px;
    }
    .download-btn {
      background: #0f766e;
      color: #fff;
      border: none;
    }
    .download-btn:hover:not(:disabled) { background: #0d6460; }
    .download-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .print-btn {
      background: #fff;
      color: #374151;
      border: 1px solid #d1d5db;
    }
    .print-btn:hover { background: #f9fafb; }
    .report-header { margin-bottom: 24px; }
    .report-header h1 {
      margin: 0 0 4px;
      font-size: 28px;
      font-weight: 700;
    }
    .report-header h2 {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 600;
      color: #334155;
    }
    .report-header p {
      margin: 4px 0;
      color: #475569;
      font-size: 14px;
    }
    .summary-box {
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      background: #fff;
      padding: 16px;
      margin-bottom: 28px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 16px;
    }
    .summary-item label {
      display: block;
      font-size: 12px;
      color: #64748b;
      margin-bottom: 2px;
    }
    .summary-item strong {
      font-size: 16px;
      color: #0f172a;
    }
    .summary-item strong.profit-positive { color: #047857; }
    .summary-item strong.profit-negative { color: #dc2626; }
    .section-heading {
      margin: 0 0 16px;
      font-size: 18px;
      font-weight: 700;
    }
    .booking-card {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #fff;
      padding: 16px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    .booking-card.cancelled {
      opacity: 0.65;
      border-color: #cbd5e1;
      background: #f8fafc;
    }
    .booking-top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .client-name {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: capitalize;
    }
    .badge-type { background: #ccfbf1; color: #0f766e; }
    .badge-status { background: #dbeafe; color: #1d4ed8; }
    .badge-cancelled { background: #e2e8f0; color: #475569; }
    .booking-details,
    .booking-financials {
      margin: 0 0 8px;
      font-size: 13px;
      color: #475569;
    }
    .expenses-block { margin-top: 10px; }
    .expenses-heading {
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
    }
    .expenses-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .expenses-table td {
      padding: 4px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .expenses-table .amount { text-align: right; font-weight: 600; }
    .expenses-total-row td { font-weight: 600; padding-top: 8px; }
    .expenses-profit-row td { font-weight: 700; }
    .profit-positive { color: #047857; }
    .profit-negative { color: #dc2626; }
    .empty-message {
      color: #64748b;
      font-size: 14px;
      margin: 0;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    @media print {
      body { background: #fff; color: #000; }
      .no-print { display: none !important; }
      .page { max-width: none; padding: 0; }
      .booking-card { page-break-inside: avoid; }
    }
    @media (max-width: 640px) {
      .summary-box { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="no-print">
      <button type="button" id="download-btn" class="download-btn">Download PDF</button>
      <button type="button" id="print-btn" class="print-btn">Print</button>
      <p id="pdf-error" class="pdf-error" role="alert" hidden></p>
    </div>

    <div id="report-body">
    <header class="report-header">
      <h1>${escapeHtml(displayName)}</h1>
      <h2>EventFlow Report</h2>
      <p>Date range: ${escapeHtml(formatRangeDate(from))} to ${escapeHtml(formatRangeDate(to))}</p>
      <p>Generated: ${escapeHtml(formatGeneratedAt(generatedAt))}</p>
    </header>

    <section class="summary-box">
      <div class="summary-item">
        <label>Total Bookings</label>
        <strong>${escapeHtml(summary.totalBookings)}</strong>
      </div>
      <div class="summary-item">
        <label>Total Revenue</label>
        <strong>${escapeHtml(toINR(summary.totalRevenue))}</strong>
      </div>
      <div class="summary-item">
        <label>Advance Collected</label>
        <strong>${escapeHtml(toINR(summary.totalAdvanceCollected))}</strong>
      </div>
      <div class="summary-item">
        <label>Pending Balance</label>
        <strong>${escapeHtml(toINR(summary.totalPendingBalance))}</strong>
      </div>
      <div class="summary-item">
        <label>Total Expenses</label>
        <strong>${escapeHtml(toINR(summary.totalExpenses))}</strong>
      </div>
      <div class="summary-item">
        <label>Net Profit</label>
        <strong class="${netProfitClass}">${escapeHtml(toINR(summary.netProfit))}</strong>
      </div>
    </section>

    <section>
      <h2 class="section-heading">Bookings (${escapeHtml(summary.totalBookings)})</h2>
      ${bookingCards}
    </section>

    <footer class="footer">
      <p>Generated by EventFlow${businessName ? ` — ${escapeHtml(businessName)}` : ''}</p>
      <p>Printed at: ${escapeHtml(printedAt)}</p>
    </footer>
    </div>
  </div>
</body>
</html>`
}

// Decide where each PDF page starts and ends along the tall report image (all values in mm).
// A page nominally takes pageHeight; if that cut would land inside a card, it ends padMm above the card instead.
// A card taller than a page cannot be kept whole: it is cut at the page height as before and counted in `oversized`.
export const planPdfPages = (imgHeight, pageHeight, cards, padMm = 0) => {
  const pages = []
  const oversizedCards = new Set()
  let start = 0
  while (start < imgHeight - 0.01) {
    let end = Math.min(start + pageHeight, imgHeight)
    if (end < imgHeight) {
      const hit = cards.find((card) => card.top < end && card.bottom > end)
      if (hit) {
        const cutAt = hit.top - padMm
        if (cutAt > start + 0.5) {
          end = cutAt
        } else {
          oversizedCards.add(hit)
        }
      }
    }
    pages.push({ startMm: start, endMm: end })
    start = end
  }
  return { pages, oversized: oversizedCards.size }
}

const CARD_BREAK_PAD_CSS_PX = 6

const downloadReportPdf = async (reportWindow, reportData) => {
  const doc = reportWindow.document
  const btn = doc.getElementById('download-btn')
  if (!btn) return
  const errorEl = doc.getElementById('pdf-error')
  if (errorEl) errorEl.hidden = true
  btn.disabled = true
  btn.textContent = 'Generating...'

  try {
    const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ])
    const reportEl = doc.getElementById('report-body')
    const canvas = await html2canvas(reportEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    // The report is one tall canvas. Cut it into A4 pages, but never through a booking card: when the nominal cut
    // would land inside a card, the page ends just above that card instead (BUGS #095).
    const reportTop = reportEl.getBoundingClientRect().top
    const mmPerCssPx = imgWidth / reportEl.getBoundingClientRect().width
    const cardsMm = [...reportEl.querySelectorAll('.booking-card')].map((card) => {
      const rect = card.getBoundingClientRect()
      return { top: (rect.top - reportTop) * mmPerCssPx, bottom: (rect.bottom - reportTop) * mmPerCssPx }
    })
    const layout = planPdfPages(imgHeight, pageHeight, cardsMm, CARD_BREAK_PAD_CSS_PX * mmPerCssPx)
    // Test hook: read by scripts/verify-report-pdf.mjs (against the dev client) to count cards that cross a page break.
    // Dev only, so it is not in the production bundle.
    if (import.meta.env.DEV) reportWindow.__reportPdfLayout = layout

    layout.pages.forEach((slice, index) => {
      if (index > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, -slice.startMm, imgWidth, imgHeight, undefined, 'FAST')
      // The image continues below the cut; blank it so the next page's first card is not shown twice.
      const used = slice.endMm - slice.startMm
      if (used < pageHeight) {
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, used, pageWidth, pageHeight - used, 'F')
      }
    })

    pdf.save(`EventFlow-Report-${reportData.from}-to-${reportData.to}.pdf`)
  } catch {
    if (errorEl) {
      errorEl.textContent = 'PDF generation failed. Please use the Print button instead.'
      errorEl.hidden = false
    }
  } finally {
    btn.disabled = false
    btn.textContent = 'Download PDF'
  }
}

export const openReportWindow = (reportData) => {
  const html = buildReportHtml(reportData)
  const reportWindow = window.open('', '_blank')
  if (!reportWindow) return
  reportWindow.document.write(html)
  reportWindow.document.close()

  reportWindow.document.getElementById('download-btn')?.addEventListener('click', () => {
    downloadReportPdf(reportWindow, reportData)
  })
  reportWindow.document.getElementById('print-btn')?.addEventListener('click', () => {
    reportWindow.print()
  })
}
