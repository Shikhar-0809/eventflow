import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import { bookingCreateRateLimiter } from '../middleware/rateLimiter.js'
import { trackUsage } from '../middleware/trackUsage.js'
import { bookingSchema, bookingStatusSchema, changeLogSchema, expenseSchema } from '../schemas/booking.schema.js'
import { MAX_INT4, parseId } from '../utils/ids.js'

const router = Router()

router.use(requireAuth)

// Every query below is scoped to req.merchantId (set by requireAuth from the signed token).
// A row that belongs to another merchant must look exactly like a row that does not exist: same 404, same text.
// Responses use explicit column lists so merchant_id never leaves the server.
const BOOKING_COLUMNS = `id, client_name, phone, event_type, event_type_custom, event_date, guest_count, venue,
  advance, total, subtotal, discount, grand_total, status, notes, created_at, updated_at`
const CHANGE_LOG_COLUMNS = 'id, booking_id, change_note, logged_at'

const INVALID_ITEMS_MESSAGE = 'One or more inventory items are invalid.'
const findDateConflict = async (merchantId, eventDate, excludeId = null) => {
  if (excludeId != null) {
    const { rows } = await pool.query(
      `SELECT id, client_name, event_type FROM bookings
       WHERE merchant_id = $1 AND event_date = $2 AND status != 'cancelled' AND id != $3
       LIMIT 1`,
      [merchantId, eventDate, excludeId],
    )
    return rows[0]
  }

  const { rows } = await pool.query(
    `SELECT id, client_name, event_type FROM bookings
     WHERE merchant_id = $1 AND event_date = $2 AND status != 'cancelled'
     LIMIT 1`,
    [merchantId, eventDate],
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

// True only if every referenced item exists AND belongs to this merchant.
const inventoryLinesBelongToMerchant = async (merchantId, inventoryLines) => {
  const ids = [...new Set((inventoryLines ?? []).map((line) => line.item_id))]
  if (ids.length === 0) return true
  if (ids.some((id) => !Number.isInteger(id) || id <= 0 || id > MAX_INT4)) return false

  const { rows } = await pool.query(
    'SELECT id FROM inventory_items WHERE merchant_id = $1 AND id = ANY($2::int[])',
    [merchantId, ids],
  )
  return rows.length === ids.length
}

const replaceBookingInventory = async (client, merchantId, bookingId, inventoryLines = []) => {
  await client.query('DELETE FROM booking_inventory WHERE booking_id = $1 AND merchant_id = $2', [bookingId, merchantId])
  for (const line of inventoryLines) {
    await client.query(
      `INSERT INTO booking_inventory (merchant_id, booking_id, item_id, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        merchantId,
        bookingId,
        line.item_id,
        line.quantity,
        line.unit_price ?? 0,
        line.line_total ?? 0,
      ],
    )
  }
}

const resolveEventTypeCustom = (event_type, event_type_custom) =>
  event_type === 'other' ? (event_type_custom?.trim() || null) : null

const rejectMissingEventTypeCustom = (fields, res) => {
  if (fields.event_type === 'other' && !fields.event_type_custom?.trim()) {
    res.status(400).json({ error: 'Please specify the event type.' })
    return true
  }
  return false
}

const createBooking = async (merchantId, fields, inventoryLines) => {
  const {
    client_name,
    phone,
    event_type,
    event_type_custom,
    event_date,
    guest_count,
    venue,
    advance,
    total,
    subtotal,
    discount,
    grand_total,
    notes,
  } = fields
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: insertRows } = await client.query(
      `INSERT INTO bookings (
         merchant_id, client_name, phone, event_type, event_type_custom, event_date, guest_count, venue, advance, total,
         subtotal, discount, grand_total, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        merchantId,
        client_name,
        phone,
        event_type,
        resolveEventTypeCustom(event_type, event_type_custom),
        event_date,
        guest_count,
        venue ?? null,
        advance,
        total,
        subtotal ?? 0,
        discount ?? 0,
        grand_total ?? 0,
        notes?.trim() || null,
      ],
    )
    const bookingId = insertRows[0].id

    if (inventoryLines?.length) {
      await replaceBookingInventory(client, merchantId, bookingId, inventoryLines)
    }

    const { rows: bookingRows } = await client.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1 AND merchant_id = $2`,
      [bookingId, merchantId],
    )
    await client.query('COMMIT')
    return bookingRows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

const updateBooking = async (merchantId, id, fields, inventoryLines) => {
  const {
    client_name,
    phone,
    event_type,
    event_type_custom,
    event_date,
    guest_count,
    venue,
    advance,
    total,
    subtotal,
    discount,
    grand_total,
    notes,
  } = fields
  const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rowCount } = await client.query(
      `UPDATE bookings
       SET client_name = $1, phone = $2, event_type = $3, event_type_custom = $4, event_date = $5, guest_count = $6,
           venue = $7, advance = $8, total = $9, subtotal = $10,
           discount = $11, grand_total = $12, notes = $13, updated_at = $14
       WHERE id = $15 AND merchant_id = $16`,
      [
        client_name,
        phone,
        event_type,
        resolveEventTypeCustom(event_type, event_type_custom),
        event_date,
        guest_count,
        venue ?? null,
        advance,
        total,
        subtotal ?? 0,
        discount ?? 0,
        grand_total ?? 0,
        notes?.trim() || null,
        updatedAt,
        id,
        merchantId,
      ],
    )

    if (rowCount === 0) {
      await client.query('ROLLBACK')
      return null
    }

    if (inventoryLines !== undefined) {
      await replaceBookingInventory(client, merchantId, id, inventoryLines)
    }

    const { rows: bookingRows } = await client.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    )
    await client.query('COMMIT')
    return bookingRows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// A foreign key violation while saving booking lines means an item vanished or is not this merchant's.
const handleBookingWriteError = (err, res, next) => {
  if (err.code === '23503') {
    return res.status(400).json({ error: INVALID_ITEMS_MESSAGE })
  }
  return next(err)
}

router.get('/', async (req, res, next) => {
  try {
    const { rows: bookings } = await pool.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE merchant_id = $1 ORDER BY event_date ASC`,
      [req.merchantId],
    )
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
      ? parseId(excludeId)
      : null
    const existing = await findDateConflict(req.merchantId, date, exclude)

    if (existing) {
      return res.status(200).json({ conflict: true, booking: existing })
    }

    res.status(200).json({ conflict: false })
  } catch (err) {
    next(err)
  }
})

router.get('/pending-balances', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id, client_name, phone, event_type, event_date, venue,
         guest_count, status, advance, total,
         (total - advance) AS pending_balance,
         (event_date::date - CURRENT_DATE) AS days_until_event
       FROM bookings
       WHERE merchant_id = $1
         AND status IN ('confirmed', 'pending')
         AND (total - advance) > 0
         AND event_date::date >= CURRENT_DATE
       ORDER BY event_date ASC`,
      [req.merchantId],
    )

    const bookings = rows.map((row) => ({
      id: Number(row.id),
      client_name: row.client_name,
      phone: row.phone,
      event_type: row.event_type,
      event_date: row.event_date,
      venue: row.venue,
      guest_count: Number(row.guest_count),
      status: row.status,
      advance: Number(row.advance ?? 0),
      total: Number(row.total ?? 0),
      pending_balance: Number(row.pending_balance ?? 0),
      days_until_event: Number(row.days_until_event ?? 0),
    }))

    res.status(200).json(bookings)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', trackUsage('booking_viewed'), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { rows: bookingRows } = await pool.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    )
    const booking = bookingRows[0]

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { rows: changeLog } = await pool.query(
      `SELECT ${CHANGE_LOG_COLUMNS} FROM change_log
       WHERE booking_id = $1 AND merchant_id = $2 ORDER BY logged_at ASC`,
      [booking.id, merchantId],
    )

    const { rows: inventoryRows } = await pool.query(
      `SELECT bi.item_id, bi.quantity, bi.unit_price, bi.line_total, ii.name
       FROM booking_inventory bi
       INNER JOIN inventory_items ii ON ii.id = bi.item_id AND ii.merchant_id = bi.merchant_id
       WHERE bi.booking_id = $1 AND bi.merchant_id = $2
       ORDER BY ii.name ASC`,
      [booking.id, merchantId],
    )

    const inventory = (inventoryRows ?? []).map((row) => ({
      item_id: Number(row.item_id),
      quantity: Number(row.quantity ?? 0),
      unit_price: Number(row.unit_price ?? 0),
      line_total: Number(row.line_total ?? 0),
      name: row.name ?? '',
    }))

    const { rows: expenseRows } = await pool.query(
      `SELECT id, booking_id, label, amount, created_at FROM booking_expenses
       WHERE booking_id = $1 AND merchant_id = $2 ORDER BY created_at ASC`,
      [booking.id, merchantId],
    )

    const expenses = (expenseRows ?? []).map((row) => ({
      id: Number(row.id),
      booking_id: Number(row.booking_id),
      label: row.label ?? '',
      amount: Number(row.amount ?? 0),
      created_at: row.created_at,
    }))

    res.status(200).json({
      ...booking,
      change_log: changeLog ?? [],
      inventory,
      expenses,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/', bookingCreateRateLimiter, validate(bookingSchema), trackUsage('booking_created'), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const { inventory, ...fields } = req.body
    if (rejectMissingEventTypeCustom(fields, res)) return
    if (!(await inventoryLinesBelongToMerchant(merchantId, inventory))) {
      return res.status(400).json({ error: INVALID_ITEMS_MESSAGE })
    }
    const clash = await findDateConflict(merchantId, fields.event_date)
    const newBooking = await createBooking(merchantId, fields, inventory)
    res.locals.usageMetadata = { booking_id: Number(newBooking.id) }
    res.status(201).json(withOptionalConflict(newBooking, clash))
  } catch (err) {
    handleBookingWriteError(err, res, next)
  }
})

router.patch('/:id/log', validate(changeLogSchema), trackUsage('change_logged'), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const id = parseId(req.params.id)
    const { rows: bookingRows } = id === null
      ? { rows: [] }
      : await pool.query('SELECT id FROM bookings WHERE id = $1 AND merchant_id = $2', [id, merchantId])
    const booking = bookingRows[0]

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    await pool.query(
      'INSERT INTO change_log (merchant_id, booking_id, change_note) VALUES ($1, $2, $3)',
      [merchantId, booking.id, req.body.note],
    )

    const { rows: changeLog } = await pool.query(
      `SELECT ${CHANGE_LOG_COLUMNS} FROM change_log
       WHERE booking_id = $1 AND merchant_id = $2 ORDER BY logged_at ASC`,
      [booking.id, merchantId],
    )

    res.status(200).json(changeLog)
  } catch (err) {
    next(err)
  }
})

router.post('/:id/expenses', validate(expenseSchema), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const bookingId = parseId(req.params.id)
    const { rows: bookingRows } = bookingId === null
      ? { rows: [] }
      : await pool.query('SELECT id FROM bookings WHERE id = $1 AND merchant_id = $2', [bookingId, merchantId])
    if (!bookingRows[0]) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { label, amount } = req.body
    const { rows } = await pool.query(
      `INSERT INTO booking_expenses (merchant_id, booking_id, label, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING id, booking_id, label, amount, created_at`,
      [merchantId, bookingId, label, amount],
    )

    const expense = rows[0]
    res.status(201).json({
      id: Number(expense.id),
      booking_id: Number(expense.booking_id),
      label: expense.label,
      amount: Number(expense.amount),
      created_at: expense.created_at,
    })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/expenses/:expenseId', async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const bookingId = parseId(req.params.id)
    const expenseId = parseId(req.params.expenseId)

    const { rows: bookingRows } = bookingId === null
      ? { rows: [] }
      : await pool.query('SELECT id FROM bookings WHERE id = $1 AND merchant_id = $2', [bookingId, merchantId])
    if (!bookingRows[0]) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { rowCount } = expenseId === null
      ? { rowCount: 0 }
      : await pool.query(
        'DELETE FROM booking_expenses WHERE id = $1 AND booking_id = $2 AND merchant_id = $3',
        [expenseId, bookingId, merchantId],
      )

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found.' })
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/status', validate(bookingStatusSchema), trackUsage('booking_status_updated'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const { status } = req.body

    const { rows: bookingRows } = await pool.query(
      `UPDATE bookings SET status = $1, updated_at = $2
       WHERE id = $3 AND merchant_id = $4
       RETURNING ${BOOKING_COLUMNS}`,
      [status, updatedAt, id, req.merchantId],
    )
    if (!bookingRows[0]) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    res.locals.usageMetadata = { booking_id: id }
    res.status(200).json(bookingRows[0])
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    // Children (change log, expenses, inventory lines) go with it through the composite ON DELETE CASCADE keys.
    const { rowCount } = await pool.query(
      'DELETE FROM bookings WHERE id = $1 AND merchant_id = $2',
      [id, req.merchantId],
    )
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    res.status(200).json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', validate(bookingSchema), trackUsage('booking_edited'), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const id = parseId(req.params.id)
    const { rows: existingRows } = id === null
      ? { rows: [] }
      : await pool.query('SELECT id FROM bookings WHERE id = $1 AND merchant_id = $2', [id, merchantId])

    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const { inventory, ...fields } = req.body
    if (rejectMissingEventTypeCustom(fields, res)) return
    if (!(await inventoryLinesBelongToMerchant(merchantId, inventory))) {
      return res.status(400).json({ error: INVALID_ITEMS_MESSAGE })
    }
    const clash = await findDateConflict(merchantId, fields.event_date, id)
    const updated = await updateBooking(merchantId, id, fields, inventory)
    if (!updated) {
      return res.status(404).json({ error: 'Booking not found.' })
    }
    res.locals.usageMetadata = { booking_id: id }
    res.status(200).json(withOptionalConflict(updated, clash))
  } catch (err) {
    handleBookingWriteError(err, res, next)
  }
})

export default router
