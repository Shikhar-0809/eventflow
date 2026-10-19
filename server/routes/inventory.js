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
import { parseId } from '../utils/ids.js'
import { monthRange, todayISO } from '../services/merchantTime.js'

const router = Router()

router.use(requireAuth)

// Every query below is scoped to the logged-in merchant (merchantId = req.merchantId, set by requireAuth).
// An item or booking of another merchant must look exactly like one that does not exist.
// Responses use an explicit column list so merchant_id never leaves the server.
const ITEM_COLUMNS = 'id, name, total_quantity, damaged_quantity, unit_price, created_at'

const REORDER_THRESHOLD = 0.2

// "Today" and "this month" are the merchant's (Asia/Kolkata) day and month, not the server's (BUGS #100).
const todayDate = () => todayISO()

const currentMonthPrefix = () => monthRange().month

const bookedThisMonthForItem = async (merchantId, itemId, monthPrefix = currentMonthPrefix()) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS booked_this_month
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
     WHERE bi.merchant_id = $1 AND bi.item_id = $2 AND b.status != 'cancelled' AND b.event_date LIKE $3`,
    [merchantId, itemId, `${monthPrefix}%`],
  )
  return Number(rows[0].booked_this_month)
}

const bookedThisMonthByItem = async (merchantId, monthPrefix = currentMonthPrefix()) => {
  const { rows } = await pool.query(
    `SELECT bi.item_id, COALESCE(SUM(bi.quantity), 0) AS booked_this_month
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
     WHERE bi.merchant_id = $1 AND b.status != 'cancelled' AND b.event_date LIKE $2
     GROUP BY bi.item_id`,
    [merchantId, `${monthPrefix}%`],
  )
  return new Map(rows.map((row) => [Number(row.item_id), Number(row.booked_this_month)]))
}

const inUseOnDate = async (merchantId, itemId, date) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS in_use
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
     WHERE bi.merchant_id = $1 AND bi.item_id = $2 AND b.event_date = $3 AND b.status != 'cancelled'`,
    [merchantId, itemId, date],
  )
  return Number(rows[0].in_use)
}

const committedOnDate = async (merchantId, itemId, date, excludeBookingId = null) => {
  if (excludeBookingId != null) {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(bi.quantity), 0) AS committed
       FROM booking_inventory bi
       INNER JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
       WHERE bi.merchant_id = $1 AND bi.item_id = $2 AND b.event_date = $3
         AND b.status != 'cancelled' AND b.id != $4`,
      [merchantId, itemId, date, excludeBookingId],
    )
    return Number(rows[0].committed)
  }

  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS committed
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
     WHERE bi.merchant_id = $1 AND bi.item_id = $2 AND b.event_date = $3 AND b.status != 'cancelled'`,
    [merchantId, itemId, date],
  )
  return Number(rows[0].committed)
}

const withComputedFields = async (merchantId, item, dateForInUse = todayDate(), bookedThisMonth = null) => {
  const usable = item.total_quantity - item.damaged_quantity
  const in_use_today = await inUseOnDate(merchantId, item.id, dateForInUse)
  const booked_this_month = bookedThisMonth ?? await bookedThisMonthForItem(merchantId, item.id)
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

// Returns undefined for a missing item, an unparsable id, and an item of another merchant alike.
const getItemRow = async (merchantId, id) => {
  const itemId = parseId(id)
  if (itemId === null) return undefined
  const { rows } = await pool.query(
    `SELECT ${ITEM_COLUMNS} FROM inventory_items WHERE id = $1 AND merchant_id = $2`,
    [itemId, merchantId],
  )
  return rows[0]
}

router.get('/', async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const today = todayDate()
    const monthPrefix = currentMonthPrefix()
    const { rows } = await pool.query(
      `SELECT ${ITEM_COLUMNS} FROM inventory_items WHERE merchant_id = $1 ORDER BY name ASC`,
      [merchantId],
    )
    const bookedByItem = await bookedThisMonthByItem(merchantId, monthPrefix)
    const items = await Promise.all(
      rows.map((row) => withComputedFields(merchantId, row, today, bookedByItem.get(Number(row.id)) ?? 0)),
    )
    res.status(200).json(items)
  } catch (err) {
    next(err)
  }
})

router.post('/check-availability', validate(availabilityCheckSchema), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const { date, items, excludeBookingId } = req.body
    const shortfalls = []
    const availability = []

    for (const line of items) {
      const item = await getItemRow(merchantId, line.item_id)
      if (!item) {
        // Same answer for a missing item and for another merchant's item.
        return res.status(400).json({ error: `Inventory item ${line.item_id} not found.` })
      }

      const usable = item.total_quantity - item.damaged_quantity
      const committed = await committedOnDate(merchantId, line.item_id, date, parseId(excludeBookingId))
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
    const merchantId = req.merchantId
    const { name, total_quantity, unit_price: unitPrice = 0 } = req.body

    const { rows } = await pool.query(
      `INSERT INTO inventory_items (merchant_id, name, total_quantity, damaged_quantity, unit_price)
       VALUES ($1, $2, $3, 0, $4) RETURNING id`,
      [merchantId, name, total_quantity, unitPrice],
    )

    const item = await getItemRow(merchantId, rows[0].id)
    res.status(201).json(await withComputedFields(merchantId, item))
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'An inventory item with this name already exists.' })
    }
    next(err)
  }
})

router.patch('/:id/price', validate(inventoryPriceUpdateSchema), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const item = await getItemRow(merchantId, req.params.id)

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    const { unit_price: unitPrice } = req.body

    await pool.query(
      'UPDATE inventory_items SET unit_price = $1 WHERE id = $2 AND merchant_id = $3',
      [unitPrice, item.id, merchantId],
    )

    const updated = await getItemRow(merchantId, item.id)
    res.status(200).json(await withComputedFields(merchantId, updated))
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', validate(inventoryQuantityUpdateSchema), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const item = await getItemRow(merchantId, req.params.id)

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    const { total_quantity } = req.body
    const damaged_quantity = Math.min(item.damaged_quantity, total_quantity)

    await pool.query(
      'UPDATE inventory_items SET total_quantity = $1, damaged_quantity = $2 WHERE id = $3 AND merchant_id = $4',
      [total_quantity, damaged_quantity, item.id, merchantId],
    )

    const updated = await getItemRow(merchantId, item.id)
    res.status(200).json(await withComputedFields(merchantId, updated))
  } catch (err) {
    next(err)
  }
})

router.post('/:id/damage', validate(inventoryDamageAdjustSchema), async (req, res, next) => {
  try {
    const merchantId = req.merchantId
    const item = await getItemRow(merchantId, req.params.id)

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
      await client.query(
        'UPDATE inventory_items SET damaged_quantity = $1 WHERE id = $2 AND merchant_id = $3',
        [clampedDamaged, item.id, merchantId],
      )
      await client.query(
        'INSERT INTO inventory_damage_log (merchant_id, item_id, change, note) VALUES ($1, $2, $3, $4)',
        [merchantId, item.id, appliedChange, note ?? null],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    const updated = await getItemRow(merchantId, item.id)
    const response = await withComputedFields(merchantId, updated)

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
    const merchantId = req.merchantId
    const item = await getItemRow(merchantId, req.params.id)

    if (!item) {
      return res.status(404).json({ error: 'Item not found.' })
    }

    const { rows: activeRefRows } = await pool.query(
      `SELECT COUNT(DISTINCT b.id)::int AS n
       FROM booking_inventory bi
       INNER JOIN bookings b ON b.id = bi.booking_id AND b.merchant_id = bi.merchant_id
       WHERE bi.merchant_id = $1 AND bi.item_id = $2 AND b.status != 'cancelled'`,
      [merchantId, item.id],
    )
    const activeBookingCount = activeRefRows[0].n

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM booking_inventory WHERE item_id = $1 AND merchant_id = $2', [item.id, merchantId])
      await client.query('DELETE FROM inventory_damage_log WHERE item_id = $1 AND merchant_id = $2', [item.id, merchantId])
      await client.query('DELETE FROM inventory_items WHERE id = $1 AND merchant_id = $2', [item.id, merchantId])
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
