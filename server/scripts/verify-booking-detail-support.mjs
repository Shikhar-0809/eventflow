/**
 * Support script for BookingDetail verification — DB/API/helpers.
 * UI checks are driven via Cursor MCP browser.
 */
import 'dotenv/config'
import { pool } from '../db/database.js'

const BASE = 'http://localhost:3001/api'
const PASSWORD = process.env.VERIFY_TEST_PASSWORD || 'testpass123'

const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const cookie = res.headers.getSetCookie?.()?.[0]?.split(';')[0]
    ?? res.headers.get('set-cookie')?.split(';')[0]
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  return cookie
}

const cmd = process.argv[2]

try {
if (cmd === 'set-malformed-phone') {
  const id = Number(process.argv[3])
  const phone = process.argv[4] ?? '123'
  await pool.query('UPDATE bookings SET phone = $1 WHERE id = $2', [phone, id])
  const row = (await pool.query('SELECT id FROM bookings WHERE id = $1', [id])).rows[0]
  console.log(JSON.stringify({ id: row?.id, updated: Boolean(row) }))
} else if (cmd === 'restore-phone') {
  const id = Number(process.argv[3])
  const phone = process.argv[4] ?? '9876543210'
  await pool.query('UPDATE bookings SET phone = $1 WHERE id = $2', [phone, id])
  console.log(JSON.stringify({ id, restored: true }))
} else if (cmd === 'set-sanitize-name') {
  const id = Number(process.argv[3])
  const name = process.argv[4] ?? 'Test\nEvil\rName'
  await pool.query('UPDATE bookings SET client_name = $1 WHERE id = $2', [name, id])
  const row = (await pool.query(
    'SELECT id, event_date, event_type, guest_count, advance FROM bookings WHERE id = $1',
    [id],
  )).rows[0]
  console.log(JSON.stringify({ ...row, updated: Boolean(row) }))
} else if (cmd === 'find-by-name') {
  const name = process.argv[3]
  const row = (await pool.query(
    'SELECT id, status, advance, total, event_date, event_type, guest_count, venue FROM bookings WHERE client_name LIKE $1 LIMIT 1',
    [`%${name}%`],
  )).rows[0]
  console.log(JSON.stringify({ found: Boolean(row), id: row?.id ?? null, event_date: row?.event_date ?? null, event_type: row?.event_type ?? null }))
} else if (cmd === 'get-booking') {
  const id = Number(process.argv[3])
  const row = (await pool.query(
    'SELECT id, event_date, event_type, guest_count, venue, advance, total, status FROM bookings WHERE id = $1',
    [id],
  )).rows[0]
  console.log(JSON.stringify(row ?? { id, found: false }))
} else if (cmd === 'whatsapp-decode') {
  const id = Number(process.argv[3])
  const type = process.argv[4] ?? 'confirmation'
  const row = (await pool.query('SELECT * FROM bookings WHERE id = $1', [id])).rows[0]

  const sanitizeText = (value, maxLength = 200) => {
    if (typeof value !== 'string') return ''
    return value.replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim().slice(0, maxLength)
  }
  const PHONE_REGEX = /^[6-9]\d{9}$/
  const validatePhone = (phone) => {
    const digits = String(phone ?? '').replace(/\D/g, '')
    return PHONE_REGEX.test(digits) ? digits : null
  }
  const formatCurrency = (amount) => `₹${Number(amount).toLocaleString('en-IN')}`

  const phone = validatePhone(row.phone)
  let url = null
  if (phone) {
    const clientName = sanitizeText(row.client_name, 100)
    const eventDate = sanitizeText(row.event_date, 10)
    if (type === 'reminder') {
      if (clientName && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
        const message =
          `Namaskar ${clientName}! This is a reminder that your event is on ${eventDate}. ` +
          'Kindly arrange the remaining balance before the event. Thank you! - EventFlow'
        url = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
      }
    } else {
      const eventType = row.event_type?.charAt(0).toUpperCase() + row.event_type?.slice(1)
      const guestCount = Number(row.guest_count)
      const advance = formatCurrency(Number(row.advance) || 0)
      if (clientName && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && guestCount > 0) {
        const message =
          `Namaskar ${clientName}! Your booking is confirmed for ${eventDate}. ` +
          `Event: ${eventType}, Guests: ${guestCount}. Advance received: ${advance}. ` +
          'Thank you! - EventFlow'
        url = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
      }
    }
  }

  if (!url) {
    console.log(JSON.stringify({ id, urlGenerated: false, messageLength: 0 }))
  } else {
    const u = new URL(url)
    const text = decodeURIComponent(u.searchParams.get('text') ?? '')
    console.log(JSON.stringify({
      id,
      urlGenerated: true,
      waMeHost: u.hostname === 'wa.me',
      messageLength: text.length,
    }))
  }
} else if (cmd === 'sanitize-test') {
  const id = Number(process.argv[3])
  const row = (await pool.query('SELECT * FROM bookings WHERE id = $1', [id])).rows[0]
  const sanitizeText = (value, maxLength = 200) => {
    if (typeof value !== 'string') return ''
    return value.replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim().slice(0, maxLength)
  }
  const PHONE_REGEX = /^[6-9]\d{9}$/
  const phone = String(row.phone ?? '').replace(/\D/g, '')
  const clientName = sanitizeText(row.client_name, 100)
  const eventDate = sanitizeText(row.event_date, 10)
  const message = phone && PHONE_REGEX.test(phone) && clientName
    ? `Namaskar ${clientName}! Your booking is confirmed for ${eventDate}.`
    : null
  const hasControl = message ? /[\r\n\x00-\x1f\x7f]/.test(message) : null
  console.log(JSON.stringify({ id, messageGenerated: Boolean(message), has_control_chars: hasControl }))
}
await pool.end()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
