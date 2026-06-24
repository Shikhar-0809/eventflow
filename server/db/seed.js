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

const seedInventory = (db) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM inventory_items').get().count
  if (count > 0) return

  const runSeed = db.transaction(() => {
    const insertItem = db.prepare(
      'INSERT INTO inventory_items (name, total_quantity, damaged_quantity) VALUES (?, ?, ?)',
    )
    const itemIds = {}
    for (const item of STARTER_INVENTORY) {
      const result = insertItem.run(item.name, item.total_quantity, item.damaged_quantity)
      itemIds[item.name] = Number(result.lastInsertRowid)
    }

    db.prepare(
      'INSERT INTO inventory_damage_log (item_id, change, note) VALUES (?, ?, ?)',
    ).run(itemIds['Plastic Chairs'], 15, 'damaged in transit')

    const insertBookingInventory = db.prepare(
      'INSERT INTO booking_inventory (booking_id, item_id, quantity) VALUES (?, ?, ?)',
    )

    const ramesh = db.prepare(
      `SELECT id FROM bookings
       WHERE client_name = 'Ramesh Sharma' AND status != 'cancelled'
       LIMIT 1`,
    ).get()
    if (ramesh) {
      insertBookingInventory.run(ramesh.id, itemIds['Plastic Chairs'], 150)
      insertBookingInventory.run(ramesh.id, itemIds['Round Tables'], 15)
    }

    const vikram = db.prepare(
      `SELECT id FROM bookings
       WHERE client_name = 'Vikram Singh' AND status != 'cancelled'
       LIMIT 1`,
    ).get()
    if (vikram) {
      insertBookingInventory.run(vikram.id, itemIds['Shamiana Tents'], 2)
      insertBookingInventory.run(vikram.id, itemIds['Sofas'], 4)
    }
  })

  runSeed()
  console.log(`Seeded ${STARTER_INVENTORY.length} starter inventory items`)
}

export const seed = (db) => {
  if (process.env.NODE_ENV === 'production') {
    console.log('Seed skipped: NODE_ENV is production. Demo seed data will not run.')
    return
  }

  const count = db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count

  if (count === 0) {
    const bookings = buildSeedBookings()
    const insert = db.prepare(`
      INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insert.run(
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
        )
      }
    })
    insertMany(bookings)
    console.log(`Seeded ${bookings.length} demo bookings`)
  }

  seedInventory(db)

  seedAnalyticsHistory(db)
  removeManualTestBookings(db)
  removeVerificationBookings(db)
  seedSureshDemoBooking(db)
  purgeNonDemoEventLog(db)
  seedDemoEventLog(db)
  logDevBookings(db)
}
