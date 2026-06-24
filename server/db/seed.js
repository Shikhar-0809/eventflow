import { pool } from './database.js'
import { seedAnalyticsHistory } from './analyticsHistorySeed.js'
import {
  logDevBookings,
  purgeNonDemoEventLog,
  removeManualTestBookings,
  removeVerificationBookings,
  seedDemoEventLog,
  seedSureshDemoBooking,
} from './demoSeed.js'

const formatDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const buildSeedBookings = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()

  const conflictDate = new Date(now)
  conflictDate.setDate(now.getDate() + 6)

  const day = (d) => formatDate(new Date(year, month, d))

  return [
    { client_name: 'Ramesh Sharma', phone: '9876543210', event_type: 'wedding', event_date: day(3), guest_count: 250, venue: 'Grand Palace Banquet, Jaipur', advance: 15000, total: 120000, status: 'confirmed', notes: 'Vegetarian menu, 2-stage setup' },
    { client_name: 'Priya Patel', phone: '9876543211', event_type: 'birthday', event_date: day(7), guest_count: 80, venue: 'Sunrise Garden, Ahmedabad', advance: 8000, total: 45000, status: 'confirmed', notes: 'Theme: golden jubilee' },
    { client_name: 'Sunil Verma', phone: '9876543212', event_type: 'corporate', event_date: day(10), guest_count: 150, venue: 'Tech Park Convention Hall, Pune', advance: 20000, total: 95000, status: 'confirmed', notes: 'Annual company day event' },
    { client_name: 'Anita Desai', phone: '9876543213', event_type: 'other', event_date: day(14), guest_count: 60, venue: 'Community Hall, Surat', advance: 5000, total: 28000, status: 'pending', notes: 'Awaiting advance confirmation' },
    { client_name: 'Vikram Singh', phone: '9876543214', event_type: 'wedding', event_date: day(18), guest_count: 300, venue: 'Royal Orchid Resort, Udaipur', advance: 25000, total: 150000, status: 'confirmed', notes: 'Full catering + tent package' },
    { client_name: 'Kavita Reddy', phone: '9876543215', event_type: 'wedding', event_date: formatDate(conflictDate), guest_count: 200, venue: 'Lakeview Lawn, Hyderabad', advance: 18000, total: 110000, status: 'confirmed', notes: 'Conflict demo booking 1' },
    { client_name: 'Arjun Mehta', phone: '9876543216', event_type: 'birthday', event_date: formatDate(conflictDate), guest_count: 100, venue: 'Lakeview Lawn, Hyderabad', advance: 10000, total: 55000, status: 'pending', notes: 'Conflict demo booking 2' },
    { client_name: 'Deepa Nair', phone: '9876543217', event_type: 'corporate', event_date: day(22), guest_count: 120, venue: 'Business Centre, Kochi', advance: 12000, total: 72000, status: 'confirmed', notes: 'Product launch dinner' },
    { client_name: 'Rajesh Gupta', phone: '9876543218', event_type: 'other', event_date: day(28), guest_count: 40, venue: 'Riverside Cafe, Lucknow', advance: 6000, total: 25000, status: 'cancelled', notes: 'Client cancelled — venue unavailable' },
    { client_name: 'Meera Joshi', phone: '9876543219', event_type: 'wedding', event_date: day(lastDay), guest_count: 180, venue: 'Heritage Fort Lawn, Jodhpur', advance: 22000, total: 135000, status: 'confirmed', notes: 'Sunset ceremony preferred' },
  ]
}

const STARTER_INVENTORY = [
  { name: 'Plastic Chairs', total_quantity: 300, damaged_quantity: 15 },
  { name: 'Round Tables', total_quantity: 40, damaged_quantity: 0 },
  { name: 'Shamiana Tents', total_quantity: 4, damaged_quantity: 0 },
  { name: 'Sofas', total_quantity: 10, damaged_quantity: 0 },
]

const seedInventory = async () => {
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items')
  if (countRows[0].count > 0) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const itemIds = {}
    for (const item of STARTER_INVENTORY) {
      const { rows } = await client.query(
        'INSERT INTO inventory_items (name, total_quantity, damaged_quantity) VALUES ($1, $2, $3) RETURNING id',
        [item.name, item.total_quantity, item.damaged_quantity],
      )
      itemIds[item.name] = rows[0].id
    }

    await client.query(
      'INSERT INTO inventory_damage_log (item_id, change, note) VALUES ($1, $2, $3)',
      [itemIds['Plastic Chairs'], 15, 'damaged in transit'],
    )

    const { rows: rameshRows } = await client.query(
      `SELECT id FROM bookings
       WHERE client_name = 'Ramesh Sharma' AND status != 'cancelled'
       LIMIT 1`,
    )
    if (rameshRows[0]) {
      await client.query(
        'INSERT INTO booking_inventory (booking_id, item_id, quantity) VALUES ($1, $2, $3)',
        [rameshRows[0].id, itemIds['Plastic Chairs'], 150],
      )
      await client.query(
        'INSERT INTO booking_inventory (booking_id, item_id, quantity) VALUES ($1, $2, $3)',
        [rameshRows[0].id, itemIds['Round Tables'], 15],
      )
    }

    const { rows: vikramRows } = await client.query(
      `SELECT id FROM bookings
       WHERE client_name = 'Vikram Singh' AND status != 'cancelled'
       LIMIT 1`,
    )
    if (vikramRows[0]) {
      await client.query(
        'INSERT INTO booking_inventory (booking_id, item_id, quantity) VALUES ($1, $2, $3)',
        [vikramRows[0].id, itemIds['Shamiana Tents'], 2],
      )
      await client.query(
        'INSERT INTO booking_inventory (booking_id, item_id, quantity) VALUES ($1, $2, $3)',
        [vikramRows[0].id, itemIds['Sofas'], 4],
      )
    }

    await client.query('COMMIT')
    console.log(`Seeded ${STARTER_INVENTORY.length} starter inventory items`)
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      console.log('Inventory seed skipped: starter items already exist')
      return
    }
    throw err
  } finally {
    client.release()
  }
}

export const seed = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.log('Seed skipped: NODE_ENV is production. Demo seed data will not run.')
    return
  }

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM bookings')
  if (rows[0].count === 0) {
    const bookings = buildSeedBookings()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const row of bookings) {
        await client.query(
          `INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            row.client_name,
            row.phone,
            row.event_type,
            row.event_date,
            row.guest_count,
            row.venue,
            row.advance,
            row.total,
            row.status,
            row.notes,
          ],
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    console.log(`Seeded ${bookings.length} demo bookings`)
  }

  await seedInventory()
  await seedAnalyticsHistory(pool)
  await removeManualTestBookings(pool)
  await removeVerificationBookings(pool)
  await seedSureshDemoBooking(pool)
  await purgeNonDemoEventLog(pool)
  await seedDemoEventLog(pool)
  await logDevBookings(pool)
}
