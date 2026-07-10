const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return escapeHtml(dateStr)
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return escapeHtml(dateStr)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatGeneratedAt = (isoString) => {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return escapeHtml(isoString)
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
      <td class="amount">${toINR(expense.amount)}</td>
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
            <td class="amount">${toINR(booking.total_expenses)}</td>
          </tr>
          <tr class="expenses-profit-row ${profitClass}">
            <td>Profit</td>
            <td class="amount">${toINR(booking.profit)}</td>
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
        ${formatDisplayDate(booking.event_date)}
        | ${escapeHtml(booking.venue?.trim() || '—')}
        | ${escapeHtml(booking.guest_count)} guests
        | ${escapeHtml(booking.phone)}
      </p>
      <p class="booking-financials">
        Total ${toINR(booking.total)}
        | Advance ${toINR(booking.advance)}
        | Balance Due ${toINR(booking.pending_balance)}
      </p>
      ${buildExpensesSection(booking)}
    </article>
  `
}

const buildReportHtml = (reportData) => {
  const { from, to, generatedAt, summary, bookings } = reportData
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
    .print-btn {
      background: #0d9488;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { background: #0f766e; }
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
      <button type="button" class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>

    <header class="report-header">
      <h1>Bala Ji Tent House</h1>
      <h2>EventFlow Report</h2>
      <p>Date range: ${formatRangeDate(from)} to ${formatRangeDate(to)}</p>
      <p>Generated: ${formatGeneratedAt(generatedAt)}</p>
    </header>

    <section class="summary-box">
      <div class="summary-item">
        <label>Total Bookings</label>
        <strong>${summary.totalBookings}</strong>
      </div>
      <div class="summary-item">
        <label>Total Revenue</label>
        <strong>${toINR(summary.totalRevenue)}</strong>
      </div>
      <div class="summary-item">
        <label>Advance Collected</label>
        <strong>${toINR(summary.totalAdvanceCollected)}</strong>
      </div>
      <div class="summary-item">
        <label>Pending Balance</label>
        <strong>${toINR(summary.totalPendingBalance)}</strong>
      </div>
      <div class="summary-item">
        <label>Total Expenses</label>
        <strong>${toINR(summary.totalExpenses)}</strong>
      </div>
      <div class="summary-item">
        <label>Net Profit</label>
        <strong class="${netProfitClass}">${toINR(summary.netProfit)}</strong>
      </div>
    </section>

    <section>
      <h2 class="section-heading">Bookings (${summary.totalBookings})</h2>
      ${bookingCards}
    </section>

    <footer class="footer">
      <p>Generated by EventFlow — Bala Ji Tent House</p>
      <p>Printed at: ${printedAt}</p>
    </footer>
  </div>
</body>
</html>`
}

export const openReportWindow = (reportData) => {
  const html = buildReportHtml(reportData)
  const newWindow = window.open('', '_blank')
  if (!newWindow) return
  newWindow.document.write(html)
  newWindow.document.close()
}
