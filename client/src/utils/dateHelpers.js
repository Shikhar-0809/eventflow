import { daysBetweenISO, todayISO } from './merchantTime.js'

/** Calendar-date diff: negative = past, 0 = today, positive = future. */
export const getDaysUntilEvent = (eventDateString) => {
  if (eventDateString == null || eventDateString === '') return null

  const normalized = String(eventDateString).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null

  // The merchant's (Asia/Kolkata) today, not the UTC date and not the browser's: BUGS #100.
  return daysBetweenISO(todayISO(), normalized)
}
