const parseSqliteDatetime = (value) => {
  if (!value) return null
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatRelativeTime = (dateStr) => {
  const date = parseSqliteDatetime(dateStr)
  if (!date) return null

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 0) return null
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const daysUsingEventFlow = (firstActivityAt) => {
  const first = parseSqliteDatetime(firstActivityAt)
  if (!first) return null

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = startOfDay(new Date())
  const firstDay = startOfDay(first)
  const diffDays = Math.floor((today - firstDay) / 86400000) + 1

  return diffDays >= 1 ? diffDays : null
}
