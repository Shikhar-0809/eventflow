import { formatCurrency } from './formatCurrency'
import { sanitizeText } from './sanitize'

const PHONE_REGEX = /^[6-9]\d{9}$/
const EVENT_TYPES = new Set(['wedding', 'birthday', 'corporate', 'other'])

export const validatePhoneForWhatsApp = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return PHONE_REGEX.test(digits) ? digits : null
}

const formatEventType = (type) => {
  const safe = sanitizeText(type, 20).toLowerCase()
  if (!EVENT_TYPES.has(safe)) return 'event'
  return safe.charAt(0).toUpperCase() + safe.slice(1)
}

const buildWaLink = (phone, message) =>
  `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`

// Messages go out on the merchant's behalf, so they are signed with the logged-in merchant's business name.
const signOff = (businessName) => {
  const name = sanitizeText(businessName, 100)
  return name ? ` - ${name}` : ''
}

// The confirmation text and the phone it goes to, or null when the booking is not complete enough to message.
const confirmationParts = (booking, businessName) => {
  const phone = validatePhoneForWhatsApp(booking?.phone)
  if (!phone) return null

  const clientName = sanitizeText(booking.client_name, 100)
  const eventDate = sanitizeText(booking.event_date, 10)
  const eventType = formatEventType(booking.event_type)
  const guestCount = Number(booking.guest_count)
  const advance = formatCurrency(Number(booking.advance) || 0)

  if (!clientName || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null
  if (!Number.isFinite(guestCount) || guestCount <= 0) return null

  const message =
    `Namaskar ${clientName}! Your booking is confirmed for ${eventDate}. ` +
    `Event: ${eventType}, Guests: ${guestCount}. Advance received: ${advance}. ` +
    `Thank you!${signOff(businessName)}`

  return { phone, message }
}

export const confirmationMessage = (booking, businessName) => {
  const parts = confirmationParts(booking, businessName)
  return parts ? buildWaLink(parts.phone, parts.message) : null
}

// The plain confirmation text (no link). The Profile screen shows it as a sample of how messages are signed.
export const confirmationPreview = (booking, businessName) => confirmationParts(booking, businessName)?.message ?? null

export const paymentReminderMessage = (booking, businessName) => {
  const phone = validatePhoneForWhatsApp(booking?.phone)
  if (!phone) return null

  const clientName = sanitizeText(booking.client_name, 100)
  const eventDate = sanitizeText(booking.event_date, 10)

  if (!clientName || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null

  const message =
    `Namaskar ${clientName}! This is a reminder that your event is on ${eventDate}. ` +
    `Kindly arrange the remaining balance before the event. Thank you!${signOff(businessName)}`

  return buildWaLink(phone, message)
}

const toINR = (n) => Number(n).toLocaleString('en-IN')

// merchantPhone is the logged-in merchant's own whatsapp_phone from their profile (never an env var).
export const selfSummaryMessage = (booking, businessName, merchantPhone) => {
  const phone = validatePhoneForWhatsApp(merchantPhone)
  if (!phone) return null

  const clientName = sanitizeText(booking?.client_name, 100)
  const eventDate = sanitizeText(booking?.event_date, 10)
  const eventType = formatEventType(booking?.event_type)
  const venue = sanitizeText(booking?.venue, 200) || 'TBD'
  const guestCount = Number(booking?.guest_count)
  const total = Number(booking?.total) || 0
  const advance = Number(booking?.advance) || 0
  const pending = Math.max(0, total - advance)

  if (!clientName || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null
  if (!Number.isFinite(guestCount) || guestCount <= 0) return null

  const message =
    `EventFlow Booking Summary — ${clientName}'s ${eventType} on ${eventDate}. ` +
    `Venue: ${venue}. Guests: ${guestCount}. ` +
    `Total: ₹${toINR(total)}. Advance: ₹${toINR(advance)}. Pending: ₹${toINR(pending)}.${signOff(businessName)}`

  return buildWaLink(phone, message)
}
