import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import { bookingCreateRateLimiter } from '../middleware/rateLimiter.js'
import { trackUsage } from '../middleware/trackUsage.js'
import { bookingSchema, changeLogSchema } from '../schemas/booking.schema.js'

const router = Router()

router.use(requireAuth)

const findDateConflict = async (eventDate, excludeId = null) => {
  if (excludeId != null) {
    const { rows } = await pool.query(
      `SELECT id, client_name, event_type FROM bookings
       WHERE event_date = $1 AND status != 'cancelled' AND id != $2
       LIMIT 1`,
      [eventDate, excludeId],
    )
    return rows[0]
  }

  const { rows } = await pool.query(
    `SELECT id, client_name, event_type FROM bookings
     WHERE event_date = $1 AND status != 'cancelled'
     LIMIT 1`,
    [eventDate],
  )
  return rows[0]
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

const replaceBookingInventory = async (client, bookingId, inventoryLines = []) => {
  await client.query('DELETE FROM booking_inventory WHERE booking_id = $1', [bookingId])
  for (const line of inventoryLines) {
    await client.query(
      'INSERT INTO booking_inventory (booking_id, item_id, quantity) VALUES ($1, $2, $3)',
      [bookingId, line.item_id, line.quantity],
    )
  }
}

const createBooking = async (fields, inventoryLines) => {
  const { client_name, phone, event_type, event_date, guest_count, venue, advance, total } = fields
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: insertRows } = await client.query(
      'INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [client_name, phone, event_type, event_date, guest_count, venue ?? null, advance, total],
    )
    const bookingId = insertRows[0].id

    if (inventoryLines?.length) {
      await replaceBookingInventory(client, bookingId, inventoryLines)
    }

    const { rows: bookingRows } = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId])
    await client.query('COMMIT')
    return bookingRows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

const updateBooking = async (id, fields, inventoryLines) => {
  const { client_name, phone, event_type, event_date, guest_count, venue, advance, total } = fields
  const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `UPDATE bookings
       SET client_name = $1, phone = $2, event_type = $3, event_date = $4, guest_count = $5, venue = $6, advance = $7, total = $8, updated_at = $9
       WHERE id = $10`,
      [client_name, phone, event_type, event_date, guest_count, venue ?? null, advance, total, updatedAt, id],
    )

    if (inventoryLines !== undefined) {
      await replaceBookingInventory(client, id, inventoryLines)
    }

    const { rows: bookingRows } = await client.query('SELECT * FROM bookings WHERE id = $1', [id])
    await client.query('COMMIT')
    return bookingRows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { rows: bookings } = await pool.query('SELECT * FROM bookings ORDER BY event_date ASC')
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
    const existing = await findDateConflict(date, exclude)

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
    const { rows: bookingRows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id])
    const booking = bookingRows[0]

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { rows: changeLog } = await pool.query(
      'SELECT * FROM change_log WHERE booking_id = $1 ORDER BY logged_at ASC',
      [booking.id],
    )

    const { rows: inventory } = await pool.query(
      `SELECT bi.item_id, bi.quantity, ii.name
       FROM booking_inventory bi
       INNER JOIN inventory_items ii ON ii.id = bi.item_id
       WHERE bi.booking_id = $1
       ORDER BY ii.name ASC`,
      [booking.id],
    )

    res.status(200).json({ ...booking, change_log: changeLog, inventory })
  } catch (err) {
    next(err)
  }
})

router.post('/', validate(bookingSchema), bookingCreateRateLimiter, trackUsage('booking_created'), async (req, res, next) => {
  try {
    const { inventory, ...fields } = req.body
    const clash = await findDateConflict(fields.event_date)
    const newBooking = await createBooking(fields, inventory)
    res.locals.usageMetadata = { booking_id: Number(newBooking.id) }
    res.status(201).json(withOptionalConflict(newBooking, clash))
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/log', validate(changeLogSchema), trackUsage('change_logged'), async (req, res, next) => {
  try {
    const { rows: bookingRows } = await pool.query('SELECT id FROM bookings WHERE id = $1', [req.params.id])
    const booking = bookingRows[0]

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    await pool.query(
      'INSERT INTO change_log (booking_id, change_note) VALUES ($1, $2)',
      [booking.id, req.body.note],
    )

    const { rows: changeLog } = await pool.query(
      'SELECT * FROM change_log WHERE booking_id = $1 ORDER BY logged_at ASC',
      [booking.id],
    )

    res.status(200).json(changeLog)
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', validate(bookingSchema), trackUsage('booking_edited'), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const { rows: existingRows } = await pool.query('SELECT id FROM bookings WHERE id = $1', [id])
    const existing = existingRows[0]

    if (!existing) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { inventory, ...fields } = req.body
    const clash = await findDateConflict(fields.event_date, id)
    const updated = await updateBooking(id, fields, inventory)
    res.locals.usageMetadata = { booking_id: id }
    res.status(200).json(withOptionalConflict(updated, clash))
  } catch (err) {
    next(err)
  }
})

export default router
