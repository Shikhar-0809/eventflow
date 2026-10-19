// The merchant's business calendar (BUGS #100). "Today", "this month" and "this week" mean the day in
// MERCHANT_TZ (every merchant is in India today), NOT the clock or time zone of the server or the database: Render
// and Neon run in UTC, which would make every day wrong between 00:00 and 05:30 IST and show last month's analytics
// until 05:30 on the 1st. Nothing here reads the process time zone: all day arithmetic goes through Intl with an
// explicit time zone, or is done on plain 'YYYY-MM-DD' strings (calendar dates have no time zone).
//
// Two kinds of values, handled differently:
//  - a calendar date (bookings.event_date, text 'YYYY-MM-DD'): compare it with the ISO strings from todayISO() /
//    monthRange() / lastMonths(), passed to SQL as $n parameters. No SQL date function (CURRENT_DATE, NOW()::date)
//    is used for business days.
//  - a timestamp (event_log.created_at): compare it with UTC instants. weekRange() returns the instants of the IST
//    midnights that bound the week (startOfDayInstant), passed as $n::timestamptz; days are bucketed in SQL with
//    AT TIME ZONE <MERCHANT_TZ> passed as a parameter. Chosen over "AT TIME ZONE everywhere" because the boundaries
//    are then computed once, in JS, where they can be unit-tested with an injected `now`.
//
// Every function takes an injectable `now` (a Date) and defaults to merchantNow().

export const MERCHANT_TZ = 'Asia/Kolkata'

const pad2 = (n) => String(n).padStart(2, '0')

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MERCHANT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

// Wall-clock parts of an instant in MERCHANT_TZ.
const zonedParts = (instant) => {
  const out = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return out
}

// "Now". A test may pin it with MERCHANT_NOW_OVERRIDE (an ISO instant), but ONLY when NODE_ENV is exactly 'development'
// or 'test' (an allowlist, so an unset, misspelled or 'production' NODE_ENV can never pin the clock). Anywhere else the
// variable is ignored and this is the real clock. The server logs a loud warning at boot whenever the variable is set
// (nowOverrideWarning, used by index.js).
const OVERRIDE_ALLOWED_ENVS = ['development', 'test']

export const isNowOverrideAllowed = (env = process.env) => OVERRIDE_ALLOWED_ENVS.includes(env.NODE_ENV)

export const merchantNow = () => {
  if (isNowOverrideAllowed() && process.env.MERCHANT_NOW_OVERRIDE) {
    const pinned = new Date(process.env.MERCHANT_NOW_OVERRIDE)
    if (!Number.isNaN(pinned.getTime())) return pinned
  }
  return new Date()
}

// The boot warning text when MERCHANT_NOW_OVERRIDE is set at all, or null when it is not.
export const nowOverrideWarning = (env = process.env) => {
  if (!env.MERCHANT_NOW_OVERRIDE) return null
  return isNowOverrideAllowed(env)
    ? `WARNING: MERCHANT_NOW_OVERRIDE is set (${env.MERCHANT_NOW_OVERRIDE}) and NODE_ENV is '${env.NODE_ENV}': the business clock is PINNED, so "today", "this month" and "this week" are NOT real. This is for tests only.`
    : `WARNING: MERCHANT_NOW_OVERRIDE is set but IGNORED because NODE_ENV is '${env.NODE_ENV ?? '(unset)'}', not 'development' or 'test'. Remove it from this environment.`
}

// 'YYYY-MM-DD' of the instant in MERCHANT_TZ.
export const todayISO = (now = merchantNow()) => {
  const p = zonedParts(now)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

// Hour of day (0-23) of the instant in MERCHANT_TZ.
export const merchantHour = (now = merchantNow()) => zonedParts(now).hour

// ---- pure calendar-date arithmetic on 'YYYY-MM-DD' strings (no time zone involved) ----

const parseISO = (iso) => {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

export const addDaysISO = (iso, days) => {
  const { year, month, day } = parseISO(iso)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// First day ('YYYY-MM-01') of the month that is `months` months after the month of `iso`.
export const monthStartISO = (iso, months = 0) => {
  const { year, month } = parseISO(iso)
  const d = new Date(Date.UTC(year, month - 1 + months, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`
}

// Whole days from `fromISO` to `toISO` (negative when toISO is earlier).
export const daysBetweenISO = (fromISO, toISO) => {
  const a = parseISO(fromISO)
  const b = parseISO(toISO)
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000)
}

// 0 = Sunday ... 6 = Saturday, for a calendar date.
const weekdayOf = (iso) => {
  const { year, month, day } = parseISO(iso)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// ---- ranges ----

// The current month: { month: 'YYYY-MM', start: 'YYYY-MM-01', end: first day of the next month } (end is exclusive).
export const monthRange = (now = merchantNow()) => {
  const today = todayISO(now)
  return { month: today.slice(0, 7), start: monthStartISO(today, 0), end: monthStartISO(today, 1) }
}

// The last `count` months ending with the current one: keys oldest first, start = first day of the oldest, end exclusive.
export const lastMonths = (now = merchantNow(), count = 6) => {
  const today = todayISO(now)
  const keys = []
  for (let back = count - 1; back >= 0; back -= 1) keys.push(monthStartISO(today, -back).slice(0, 7))
  return { keys, start: monthStartISO(today, -(count - 1)), end: monthStartISO(today, 1) }
}

// The instant (a Date) at which `iso` 00:00 starts in MERCHANT_TZ.
export const startOfDayInstant = (iso) => {
  const { year, month, day } = parseISO(iso)
  const guess = Date.UTC(year, month - 1, day)
  const offsetAt = (ms) => {
    const p = zonedParts(new Date(ms))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
  }
  // Two passes settle the offset even if the zone's offset differs at the guess and at the result.
  const first = guess - offsetAt(guess)
  return new Date(guess - offsetAt(first))
}

// The Monday-Sunday week `weekOffset` weeks back (0 = this week): calendar dates and the UTC instants bounding it.
export const weekRange = (now = merchantNow(), weekOffset = 0) => {
  const today = todayISO(now)
  const dow = weekdayOf(today)
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const startDate = addDaysISO(today, -daysFromMonday - weekOffset * 7)
  const endDate = addDaysISO(startDate, 6)
  const nextStart = addDaysISO(startDate, 7)
  return {
    startDate,
    endDate,
    startInstant: startOfDayInstant(startDate),
    endInstantExclusive: startOfDayInstant(nextStart),
  }
}

// 'D Mon' label of a calendar date, e.g. '19 Oct' (formatted in UTC so the process time zone cannot shift it).
export const formatDayMonth = (iso) => {
  const { year, month, day } = parseISO(iso)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
