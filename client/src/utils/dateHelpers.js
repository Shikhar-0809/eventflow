const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Calendar-date diff: negative = past, 0 = today, positive = future. */
export const getDaysUntilEvent = (eventDateString) => {
  if (eventDateString == null || eventDateString === '') return null

  const normalized = String(eventDateString).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null

  const today = new Date(new Date().toISOString().split('T')[0])
  const eventDate = new Date(normalized)
  if (Number.isNaN(today.getTime()) || Number.isNaN(eventDate.getTime())) return null

  return Math.round((eventDate.getTime() - today.getTime()) / MS_PER_DAY)
}
