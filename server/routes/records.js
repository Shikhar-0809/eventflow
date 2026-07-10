import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { recordsQuerySchema } from '../schemas/records.schema.js'

const router = Router()

router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    const parsed = recordsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message })
    }

    const {
      from,
      to,
      event_type: eventType,
      status,
      search,
      sort_by: sortBy,
      sort_order: sortOrder = 'asc',
    } = parsed.data

    const conditions = []
    const params = []
    let paramIndex = 1

    if (from) {
      conditions.push(`event_date >= $${paramIndex}`)
      params.push(from)
      paramIndex += 1
    }
    if (to) {
      conditions.push(`event_date <= $${paramIndex}`)
      params.push(to)
      paramIndex += 1
    }
    if (eventType) {
      conditions.push(`event_type = $${paramIndex}`)
      params.push(eventType)
      paramIndex += 1
    }
    if (status) {
      conditions.push(`status = $${paramIndex}`)
      params.push(status)
      paramIndex += 1
    }
    if (search) {
      conditions.push(
        `(client_name ILIKE $${paramIndex} OR venue ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`,
      )
      params.push(`%${search}%`)
      paramIndex += 1
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    let orderClause = 'ORDER BY event_date ASC'
    if (sortBy === 'revenue') {
      orderClause = `ORDER BY total ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`
    } else if (!sortBy) {
      orderClause = `ORDER BY event_date ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`
    }

    const { rows: bookingRows } = await pool.query(
      `SELECT id, client_name, phone, event_type, event_date, venue,
              guest_count, status, advance, total, created_at
       FROM bookings
       ${whereClause}
       ${orderClause}`,
      params,
    )

    const bookingIds = bookingRows.map((row) => Number(row.id))
    const expenseTotals = new Map()

    if (bookingIds.length > 0) {
      const { rows: expenseRows } = await pool.query(
        `SELECT booking_id, amount
         FROM booking_expenses
         WHERE booking_id = ANY($1::int[])`,
        [bookingIds],
      )

      for (const row of expenseRows) {
        const bookingId = Number(row.booking_id)
        const amount = Number(row.amount ?? 0)
        expenseTotals.set(bookingId, (expenseTotals.get(bookingId) ?? 0) + amount)
      }
    }

    let records = bookingRows.map((row) => {
      const total = Number(row.total ?? 0)
      const advance = Number(row.advance ?? 0)
      const totalExpenses = expenseTotals.get(Number(row.id)) ?? 0

      return {
        id: Number(row.id),
        client_name: row.client_name,
        phone: row.phone,
        event_type: row.event_type,
        event_date: row.event_date,
        venue: row.venue ?? null,
        guest_count: Number(row.guest_count ?? 0),
        status: row.status,
        advance,
        total,
        pending_balance: total - advance,
        total_expenses: totalExpenses,
        profit: total - totalExpenses,
        created_at: row.created_at,
      }
    })

    if (sortBy === 'profit' || sortBy === 'expenses') {
      const field = sortBy === 'profit' ? 'profit' : 'total_expenses'
      records.sort((a, b) => {
        const diff = a[field] - b[field]
        return sortOrder === 'desc' ? -diff : diff
      })
    }

    res.status(200).json(records)
  } catch (err) {
    next(err)
  }
})

export default router
