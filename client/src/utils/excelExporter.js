import * as XLSX from 'xlsx'

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const SPREADSHEET_FORMULA_START = /^[=+\-@\t\r]/

const excelText = (value) => {
  const text = value == null ? '' : String(value)
  if (SPREADSHEET_FORMULA_START.test(text)) return `'${text}`
  return text
}

const protectCell = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return excelText(value)
}

const formatEventType = (record) => {
  if (record?.event_type === 'other' && record.event_type_custom) {
    return record.event_type_custom
  }
  return EVENT_TYPE_LABELS[record?.event_type] ?? 'Other'
}

const formatDisplayDate = (dateStr) => {
  const normalized = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return String(dateStr ?? '')
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(dateStr ?? '')
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatCreatedAt = (value) => {
  if (value == null || value === '') return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const colWidthsFromRows = (rows) => {
  const colCount = rows[0]?.length ?? 0
  const widths = []

  for (let col = 0; col < colCount; col += 1) {
    let maxLen = 12
    for (const row of rows) {
      const cell = row[col]
      const len = cell == null ? 0 : String(cell).length
      if (len > maxLen) maxLen = len
    }
    widths.push({ wch: maxLen + 2 })
  }

  return widths
}

const buildSheet = (headers, dataRows) => {
  const rows = [headers, ...dataRows].map((row) => row.map(protectCell))
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  worksheet['!cols'] = colWidthsFromRows(rows)
  worksheet['!views'] = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }]
  return worksheet
}

export const exportToExcel = (records, { from, to } = {}) => {
  const summaryHeaders = [
    '#',
    'Client Name',
    'Event Type',
    'Date',
    'Status',
    'Total (₹)',
    'Advance (₹)',
    'Pending Balance (₹)',
    'Expenses (₹)',
    'Profit (₹)',
  ]

  const fullHeaders = [
    '#',
    'Client Name',
    'Phone',
    'Event Type',
    'Date',
    'Venue',
    'Guests',
    'Status',
    'Total (₹)',
    'Advance (₹)',
    'Pending Balance (₹)',
    'Expenses (₹)',
    'Profit (₹)',
    'Booking Created At',
  ]

  const summaryRows = records.map((record, index) => [
    index + 1,
    record.client_name,
    formatEventType(record),
    formatDisplayDate(record.event_date),
    record.status,
    Number(record.total ?? 0),
    Number(record.advance ?? 0),
    Number(record.pending_balance ?? 0),
    Number(record.total_expenses ?? 0),
    Number(record.profit ?? 0),
  ])

  const fullRows = records.map((record, index) => [
    index + 1,
    record.client_name,
    record.phone,
    formatEventType(record),
    formatDisplayDate(record.event_date),
    record.venue ?? '',
    Number(record.guest_count ?? 0),
    record.status,
    Number(record.total ?? 0),
    Number(record.advance ?? 0),
    Number(record.pending_balance ?? 0),
    Number(record.total_expenses ?? 0),
    Number(record.profit ?? 0),
    formatCreatedAt(record.created_at),
  ])

  const exportedAt = new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, buildSheet(summaryHeaders, summaryRows), 'Summary')
  XLSX.utils.book_append_sheet(workbook, buildSheet(fullHeaders, fullRows), 'Full Records')

  const aboutSheet = XLSX.utils.aoa_to_sheet([
    ['EventFlow — Bala Ji Tent House'],
    [`Exported on: ${exportedAt}`],
    [`Total bookings in export: ${records.length}`],
  ].map((row) => row.map(protectCell)))
  XLSX.utils.book_append_sheet(workbook, aboutSheet, 'About')

  const filename = from && to
    ? `EventFlow-Records-${from}-to-${to}.xlsx`
    : 'EventFlow-Records-All.xlsx'

  XLSX.writeFile(workbook, filename)
}
