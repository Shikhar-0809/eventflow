import { Router } from 'express'
import db from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import {
  availabilityCheckSchema,
  inventoryDamageAdjustSchema,
  inventoryItemSchema,
  inventoryQuantityUpdateSchema,
} from '../schemas/inventory.schema.js'

const router = Router()

router.use(requireAuth)

const todayDate = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const inUseOnDate = (itemId, date) =>
  db.prepare(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS in_use
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id
     WHERE bi.item_id = ? AND b.event_date = ? AND b.status != 'cancelled'`,
  ).get(itemId, date).in_use

const committedOnDate = (itemId, date, excludeBookingId = null) => {
  if (excludeBookingId != null) {
    return db.prepare(
      `SELECT COALESCE(SUM(bi.quantity), 0) AS committed
       FROM booking_inventory bi
       INNER JOIN bookings b ON b.id = bi.booking_id
       WHERE bi.item_id = ? AND b.event_date = ? AND b.status != 'cancelled' AND b.id != ?`,
    ).get(itemId, date, excludeBookingId).committed
  }

  return db.prepare(
    `SELECT COALESCE(SUM(bi.quantity), 0) AS committed
     FROM booking_inventory bi
     INNER JOIN bookings b ON b.id = bi.booking_id
     WHERE bi.item_id = ? AND b.event_date = ? AND b.status != 'cancelled'`,
  ).get(itemId, date).committed
}

const withComputedFields = (item, dateForInUse = todayDate()) => {
  const usable = item.total_quantity - item.damaged_quantity
  const in_use_today = inUseOnDate(item.id, dateForInUse)
  return {
    ...item,
    usable,
    in_use_today,
    available: usable - in_use_today,
  }
}

const getItemRow = (id) => db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id)

router.get('/', (req, res, next) => {
  try {
    const today = todayDate()
    const rows = db.prepare('SELECT * FROM inventory_items ORDER BY name ASC').all()
    res.status(200).json(rows.map((row) => withComputedFields(row, today)))
  } catch (err) {
    next(err)
  }
})

router.post('/check-availability', validate(availabilityCheckSchema), (req, res, next) => {
  try {
    const { date, items, excludeBookingId } = req.body
    const shortfalls = []
    const availability = []

    for (const line of items) {
      const item = getItemRow(line.item_id)
      if (!item) {
        return res.status(400).json({ error: `Inventory item ${line.item_id} not found.` })
      }

      const usable = item.total_quantity - item.damaged_quantity
      const committed = committedOnDate(line.item_id, date, excludeBookingId ?? null)
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

router.post('/', validate(inventoryItemSchema), (req, res, next) => {
  try {
    const { name, total_quantity } = req.body

    const result = db.prepare(
      'INSERT INTO inventory_items (name, total_quantity, damaged_quantity) VALUES (?, ?, 0)',
    ).run(name, total_quantity)

    const item = getItemRow(result.lastInsertRowid)
    res.status(201).json(withComputedFields(item))
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'An inventory item with this name already exists.' })
    }
    next(err)
  }
})

router.patch('/:id', validate(inventoryQuantityUpdateSchema), (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = getItemRow(id)

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    const { total_quantity } = req.body
    const damaged_quantity = Math.min(item.damaged_quantity, total_quantity)

    db.prepare(
      'UPDATE inventory_items SET total_quantity = ?, damaged_quantity = ? WHERE id = ?',
    ).run(total_quantity, damaged_quantity, id)

    const updated = getItemRow(id)
    res.status(200).json(withComputedFields(updated))
  } catch (err) {
    next(err)
  }
})

router.post('/:id/damage', validate(inventoryDamageAdjustSchema), (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const item = getItemRow(id)

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

    const applyDamage = db.transaction(() => {
      db.prepare('UPDATE inventory_items SET damaged_quantity = ? WHERE id = ?').run(clampedDamaged, id)
      db.prepare(
        'INSERT INTO inventory_damage_log (item_id, change, note) VALUES (?, ?, ?)',
      ).run(id, appliedChange, note ?? null)
    })
    applyDamage()

    const updated = getItemRow(id)
    const response = withComputedFields(updated)

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

export default router
