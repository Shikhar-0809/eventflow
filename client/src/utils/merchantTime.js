// The merchant's business calendar on the client (BUGS #100): the same definition of "today", "this month" and "this
// week" as the server (server/services/merchantTime.js). It always uses MERCHANT_TZ, never the browser's time zone, so
// a merchant travelling or a device set to another zone still sees the same business day the server uses.
// `now` is injectable (a Date) so the functions can be tested.

export const MERCHANT_TZ = 'Asia/Kolkata'

const pad2 = (n) => String(n).padStart(2, '0')

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MERCHANT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

const zonedParts = (instant) => {
  const out = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return out
}

// 'YYYY-MM-DD' of the instant in MERCHANT_TZ.
export const todayISO = (now = new Date()) => {
  const p = zonedParts(now)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

// Hour of day (0-23) in MERCHANT_TZ.
export const merchantHour = (now = new Date()) => zonedParts(now).hour

// 'YYYY-MM' of the merchant's current month.
export const currentMonthKey = (now = new Date()) => todayISO(now).slice(0, 7)

// 'YYYY-MM-01' of the merchant's current month.
export const monthStartISO = (now = new Date()) => `${currentMonthKey(now)}-01`

const parseISO = (iso) => {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

export const addDaysISO = (iso, days) => {
  const { year, month, day } = parseISO(iso)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// Whole days from `fromISO` to `toISO` (negative when toISO is earlier).
export const daysBetweenISO = (fromISO, toISO) => {
  const a = parseISO(fromISO)
  const b = parseISO(toISO)
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000)
}

// The Monday-Sunday week containing the merchant's today, as 'YYYY-MM-DD' strings.
export const weekRangeISO = (now = new Date()) => {
  const today = todayISO(now)
  const { year, month, day } = parseISO(today)
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const weekStart = addDaysISO(today, -daysFromMonday)
  return { weekStart, weekEnd: addDaysISO(weekStart, 6) }
}
