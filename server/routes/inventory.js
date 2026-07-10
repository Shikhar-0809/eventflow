import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import {
  availabilityCheckSchema,
  inventoryDamageAdjustSchema,
  inventoryItemSchema,
  inventoryPriceUpdateSchema,
  inventoryQuantityUpdateSchema,
} from '../schemas/inventory.schema.js'

const router = Router()

router.use(requireAuth)

const REORDER_THRESHOLD = 0.2

const todayDate = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const currentMonthPrefix = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

const bookedThisMonthForItem = async (itemId, monthPrefix = currentMonthPrefix()) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS booked_this_month
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id
     WHERE bi.item_id = $1 AND b.status != 'cancelled' AND b.event_date LIKE $2`,
    [itemId, `${monthPrefix}%`],
  )
  return Number(rows[0].booked_this_month)
}

const bookedThisMonthByItem = async (monthPrefix = currentMonthPrefix()) => {
  const { rows } = await pool.query(
    `SELECT bi.item_id, COALESCE(SUM(bi.quantity), 0) AS booked_this_month
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id
     WHERE b.status != 'cancelled' AND b.event_date LIKE $1
     GROUP BY bi.item_id`,
    [`${monthPrefix}%`],
  )
  return new Map(rows.map((row) => [Number(row.item_id), Number(row.booked_this_month)]))
}

const inUseOnDate = async (itemId, date) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS in_use
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id
     WHERE bi.item_id = $1 AND b.event_date = $2 AND b.status != 'cancelled'`,
    [itemId, date],
  )
  return Number(rows[0].in_use)
}

const committedOnDate = async (itemId, date, excludeBookingId = null) => {
  if (excludeBookingId != null) {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(bi.quantity), 0) AS committed
       FROM booking_inventory bi
       INNER JOIN bookings b ON b.id = bi.booking_id
       WHERE bi.item_id = $1 AND b.event_date = $2 AND b.status != 'cancelled' AND b.id != $3`,
      [itemId, date, excludeBookingId],
    )
    return Number(rows[0].committed)
  }

  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS committed
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id
     WHERE bi.item_id = $1 AND b.event_date = $2 AND b.status != 'cancelled'`,
    [itemId, date],
  )
  return Number(rows[0].committed)
}

const withComputedFields = async (item, dateForInUse = todayDate(), bookedThisMonth = null) => {
  const usable = item.total_quantity - item.damaged_quantity
  const in_use_today = await inUseOnDate(item.id, dateForInUse)
  const booked_this_month = bookedThisMonth ?? await bookedThisMonthForItem(item.id)
  const availability_ratio = usable > 0 ? (usable - booked_this_month) / usable : 0

  return {
    ...item,
    usable,
    in_use_today,
    available: usable - in_use_today,
    booked_this_month,
    availability_ratio,
  }
}

const getItemRow = async (id) => {
  const { rows } = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [id])
  return rows[0]
}

router.get('/', async (req, res, next) => {
  try {
    const today = todayDate()
    const monthPrefix = currentMonthPrefix()
    const { rows } = await pool.query('SELECT * FROM inventory_items ORDER BY name ASC')
    const bookedByItem = await bookedThisMonthByItem(monthPrefix)
    const items = await Promise.all(
      rows.map((row) => withComputedFields(row, today, bookedByItem.get(Number(row.id)) ?? 0)),
    )
    res.status(200).json(items)
  } catch (err) {
    next(err)
  }
})

router.post('/check-availability', validate(availabilityCheckSchema), async (req, res, next) => {
  try {
    const { date, items, excludeBookingId } = req.body
    const shortfalls = []
    const availability = []

    for (const line of items) {
      const item = await getItemRow(line.item_id)
      if (!item) {
        return res.status(400).json({ error: `Inventory item ${line.item_id} not found.` })
      }

      const usable = item.total_quantity - item.damaged_quantity
      const committed = await committedOnDate(line.item_id, date, excludeBookingId ?? null)
      const available = usable - committed

      availability.push({
        item_id: line.item_id,
        name: item.name,
        available,
      })

      if (line.quantity > 0 && line.quantity > available) {
        shortfalls.push({
          item_id: line.item_id,
          name: item.name,
          requested: line.quantity,
          available,
        })
      }
    }

    res.status(200).json({
      sufficient: shortfalls.length === 0,
      shortfalls,
      availability,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/', validate(inventoryItemSchema), async (req, res, next) => {
  try {
    const { name, total_quantity, unit_price: unitPrice = 0 } = req.body

    const { rows } = await pool.query(
      'INSERT INTO inventory_items (name, total_quantity, damaged_quantity, unit_price) VALUES ($1, $2, 0, $3) RETURNING id',
      [name, total_quantity, unitPrice],
    )

    const item = await getItemRow(rows[0].id)
    res.status(201).json(await withComputedFields(item))
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'An inventory item with this name already exists.' })
    }
    next(err)
  }
})

router.patch('/:id/price', validate(inventoryPriceUpdateSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = await getItemRow(id)

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    const { unit_price: unitPrice } = req.body

    await pool.query(
      'UPDATE inventory_items SET unit_price = $1 WHERE id = $2',
      [unitPrice, id],
    )

    const updated = await getItemRow(id)
    res.status(200).json(await withComputedFields(updated))
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', validate(inventoryQuantityUpdateSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = await getItemRow(id)

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    const { total_quantity } = req.body
    const damaged_quantity = Math.min(item.damaged_quantity, total_quantity)

    await pool.query(
      'UPDATE inventory_items SET total_quantity = $1, damaged_quantity = $2 WHERE id = $3',
      [total_quantity, damaged_quantity, id],
    )

    const updated = await getItemRow(id)
    res.status(200).json(await withComputedFields(updated))
  } catch (err) {
    next(err)
  }
})

router.post('/:id/damage', validate(inventoryDamageAdjustSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = await getItemRow(id)

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    const { change, note } = req.body
    const requested = item.damaged_quantity + change
    const clampedDamaged = Math.max(0, Math.min(item.total_quantity, requested))
    const appliedChange = clampedDamaged - item.damaged_quantity

    if (appliedChange === 0) {
      return res.status(400).json({ error: 'Damage adjustment would not change the damaged count.' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE inventory_items SET damaged_quantity = $1 WHERE id = $2', [clampedDamaged, id])
      await client.query(
        'INSERT INTO inventory_damage_log (item_id, change, note) VALUES ($1, $2, $3)',
        [id, appliedChange, note ?? null],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    const updated = await getItemRow(id)
    const response = await withComputedFields(updated)

    if (appliedChange !== change) {
      response.damage_adjustment = {
        requested_change: change,
        applied_change: appliedChange,
        clamped: true,
        message: 'Requested change was clamped to stay within 0 and total quantity.',
      }
    }

    res.status(200).json(response)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = await getItemRow(id)

    if (!item) {
      return res.status(404).json({ error: 'Item not found.' })
    }

    const { rows: activeRefRows } = await pool.query(
      `SELECT COUNT(DISTINCT b.id)::int AS n
       FROM booking_inventory bi
       INNER JOIN bookings b ON b.id = bi.booking_id
       WHERE bi.item_id = $1 AND b.status != 'cancelled'`,
      [id],
    )
    const activeBookingCount = activeRefRows[0].n

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM booking_inventory WHERE item_id = $1', [id])
      await client.query('DELETE FROM inventory_damage_log WHERE item_id = $1', [id])
      await client.query('DELETE FROM inventory_items WHERE id = $1', [id])
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    const response = { success: true }
    if (activeBookingCount > 0) {
      response.warning = `This item was attached to ${activeBookingCount} active booking(s). It has been removed from those bookings.`
    }

    res.status(200).json(response)
  } catch (err) {
    next(err)
  }
})

export default router
