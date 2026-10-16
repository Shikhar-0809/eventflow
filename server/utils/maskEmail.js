// Server copy of client/src/utils/maskEmail.js (same output): "shikharkumarsanjay08@gmail.com" -> "sh****08@gmail.com".
// Used wherever an address appears in a response or an email body, so a full address is never repeated.
export const maskEmail = (email) => {
  if (typeof email !== 'string') return ''
  const at = email.lastIndexOf('@')
  if (at < 1) return email
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 4) return `${local[0]}****${domain}`
  return `${local.slice(0, 2)}****${local.slice(-2)}${domain}`
}
