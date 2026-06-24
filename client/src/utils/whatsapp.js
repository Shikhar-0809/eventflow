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

export const confirmationMessage = (booking) => {
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
    'Thank you! - Bala Ji Tent House'

  return buildWaLink(phone, message)
}

export const paymentReminderMessage = (booking) => {
  const phone = validatePhoneForWhatsApp(booking?.phone)
  if (!phone) return null

  const clientName = sanitizeText(booking.client_name, 100)
  const eventDate = sanitizeText(booking.event_date, 10)

  if (!clientName || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null

  const message =
    `Namaskar ${clientName}! This is a reminder that your event is on ${eventDate}. ` +
    'Kindly arrange the remaining balance before the event. Thank you! - Bala Ji Tent House'

  return buildWaLink(phone, message)
}
