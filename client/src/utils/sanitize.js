export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export const sanitizeText = (value, maxLength = 200) => {
  if (typeof value !== 'string') return ''
  return value.replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim().slice(0, maxLength)
}
