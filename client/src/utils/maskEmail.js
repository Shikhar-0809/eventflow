// "shikharkumarsanjay08@gmail.com" -> "sh****08@gmail.com". Shows which account a screen is about without printing the
// whole address (screenshots, shoulder surfing). Short names keep only their first letter. The domain stays visible.
export const maskEmail = (email) => {
  if (typeof email !== 'string') return ''
  const at = email.lastIndexOf('@')
  if (at < 1) return email
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 4) return `${local[0]}****${domain}`
  return `${local.slice(0, 2)}****${local.slice(-2)}${domain}`
}
