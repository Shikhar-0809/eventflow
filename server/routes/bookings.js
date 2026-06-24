import { Router } from 'express'
import db from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import { bookingCreateRateLimiter } from '../middleware/rateLimiter.js'
import { trackUsage } from '../middleware/trackUsage.js'
import { bookingSchema, changeLogSchema } from '../schemas/booking.schema.js'

const router = Router()

router.use(requireAuth)

const findDateConflict = (eventDate, excludeId = null) => {
  if (excludeId != null) {
    return db.prepare(
      `SELECT id, client_name, event_type FROM bookings
       WHERE event_date = ? AND status != 'cancelled' AND id != ?
       LIMIT 1`,
    ).get(eventDate, excludeId)
  }

  return db.prepare(
    `SELECT id, client_name, event_type FROM bookings
     WHERE event_date = ? AND status != 'cancelled'
     LIMIT 1`,
  ).get(eventDate)
}

const withOptionalConflict = (booking, clashRow) => {
  if (!clashRow) return booking

  return {
    ...booking,
    conflict: {
      detected: true,
      booking: {
        id: clashRow.id,
        client_name: clashRow.client_name,
        event_type: clashRow.event_type,
      },
    },
  }
}

const insertBookingInventory = db.prepare(
  'INSERT INTO booking_inventory (booking_id, item_id, quantity) VALUES (?, ?, ?)',
)

const replaceBookingInventory = (bookingId, inventoryLines = []) => {
  db.prepare('DELETE FROM booking_inventory WHERE booking_id = ?').run(bookingId)
  for (const line of inventoryLines) {
    insertBookingInventory.run(bookingId, line.item_id, line.quantity)
  }
}

const createBooking = db.transaction((fields, inventoryLines) => {
  const { client_name, phone, event_type, event_date, guest_count, venue, advance, total } = fields
  const result = db.prepare(
    'INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(client_name, phone, event_type, event_date, guest_count, venue ?? null, advance, total)

  const bookingId = Number(result.lastInsertRowid)
  if (inventoryLines?.length) {
    replaceBookingInventory(bookingId, inventoryLines)
  }

  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId)
})

const updateBooking = db.transaction((id, fields, inventoryLines) => {
  const { client_name, phone, event_type, event_date, guest_count, venue, advance, total } = fields
  const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  db.prepare(
    `UPDATE bookings
     SET client_name = ?, phone = ?, event_type = ?, event_date = ?, guest_count = ?, venue = ?, advance = ?, total = ?, updated_at = ?
     WHERE id = ?`,
  ).run(client_name, phone, event_type, event_date, guest_count, venue ?? null, advance, total, updatedAt, id)

  if (inventoryLines !== undefined) {
    replaceBookingInventory(id, inventoryLines)
  }

  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
})

router.get('/', async (req, res, next) => {
  try {
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY event_date ASC').all()
    res.status(200).json(bookings)
  } catch (err) {
    next(err)
  }
})

router.get('/check-conflict', async (req, res, next) => {
  try {
    const { date, excludeId } = req.query

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' })
    }

    const exclude = excludeId != null && excludeId !== ''
      ? Number(excludeId)
      : null
    const existing = findDateConflict(date, exclude)

    if (existing) {
      return res.status(200).json({ conflict: true, booking: existing })
    }

    res.status(200).json({ conflict: false })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', trackUsage('booking_viewed'), async (req, res, next) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const changeLog = db
      .prepare('SELECT * FROM change_log WHERE booking_id = ? ORDER BY logged_at ASC')
      .all(booking.id)

    const inventory = db
      .prepare(
        `SELECT bi.item_id, bi.quantity, ii.name
         FROM booking_inventory bi
         INNER JOIN inventory_items ii ON ii.id = bi.item_id
         WHERE bi.booking_id = ?
         ORDER BY ii.name ASC`,
      )
      .all(booking.id)

    res.status(200).json({ ...booking, change_log: changeLog, inventory })
  } catch (err) {
    next(err)
  }
})

router.post('/', validate(bookingSchema), bookingCreateRateLimiter, trackUsage('booking_created'), async (req, res, next) => {
  try {
    const { inventory, ...fields } = req.body
    const clash = findDateConflict(fields.event_date)
    const newBooking = createBooking(fields, inventory)
    res.locals.usageMetadata = { booking_id: Number(newBooking.id) }
    res.status(201).json(withOptionalConflict(newBooking, clash))
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/log', validate(changeLogSchema), trackUsage('change_logged'), async (req, res, next) => {
  try {
    const booking = db.prepare('SELECT id FROM bookings WHERE id = ?').get(req.params.id)

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    db.prepare('INSERT INTO change_log (booking_id, change_note) VALUES (?, ?)').run(
      booking.id,
      req.body.note,
    )

    const changeLog = db
      .prepare('SELECT * FROM change_log WHERE booking_id = ? ORDER BY logged_at ASC')
      .all(booking.id)

    res.status(200).json(changeLog)
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', validate(bookingSchema), trackUsage('booking_edited'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const existing = db.prepare('SELECT id FROM bookings WHERE id = ?').get(id)

    if (!existing) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { inventory, ...fields } = req.body
    // inventory omitted = unchanged; inventory: [] = cleared
    const clash = findDateConflict(fields.event_date, id)
    const updated = updateBooking(id, fields, inventory)
    res.locals.usageMetadata = { booking_id: id }
    res.status(200).json(withOptionalConflict(updated, clash))
  } catch (err) {
    next(err)
  }
})

export default router
