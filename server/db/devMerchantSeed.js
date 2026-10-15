// Dev-only second demo merchant, "Shree Ganesh Caterers": a catering business in Raipur, Chhattisgarh, deliberately
// different from merchant 1 (a tent house whose venues are spread across other cities) so a side-by-side demo makes per-merchant isolation obvious.
// seed() skips everything in production; this module also refuses to run there. Fictional data only.
// Idempotent: the merchant is found by name, and each table is only filled while this merchant has no rows in it.
import { DEMO_MERCHANTS } from './seedMerchants.js'

const DEV_MERCHANT = { business_name: DEMO_MERCHANTS[1].business_name, owner_name: 'Mahesh Agrawal', city: 'Raipur' }

// The merchant used to be seeded as "Test Tent Co" with two placeholder bookings and two items. A dev database
// that still has it is renamed and its placeholder rows are removed once, so the new demo data is not blocked.
const LEGACY_NAME = 'Test Tent Co'
const LEGACY_EMAIL = 'testtent@demo.eventflow.example'
const LEGACY_BOOKING_NAMES = ['Test Client One', 'Test Client Two']
const LEGACY_ITEM_NAMES = ['Plastic Chairs', 'Gas Burners']

// Arbitrary application-wide key so two booting servers cannot both create the merchant.
const DEV_MERCHANT_LOCK_KEY = 7240025

const INVENTORY = [
  { name: 'Gas Burners', total_quantity: 14, damaged_quantity: 2, unit_price: 150, damage_note: 'two regulators faulty' },
  { name: 'Steel Degchi (Large Pots)', total_quantity: 30, damaged_quantity: 0, unit_price: 120 },
  { name: 'Chafing Dishes', total_quantity: 45, damaged_quantity: 3, unit_price: 80, damage_note: 'lids cracked in transit' },
  { name: 'Buffet Counters', total_quantity: 10, damaged_quantity: 0, unit_price: 400 },
  { name: 'Water Dispensers', total_quantity: 8, damaged_quantity: 0, unit_price: 200 },
  { name: 'Serving Trolleys', total_quantity: 6, damaged_quantity: 0, unit_price: 250 },
]

const FIRST_NAMES = ['Aarti', 'Manoj', 'Sneha', 'Rakesh', 'Pooja', 'Dinesh', 'Neha', 'Sanjay', 'Ritu', 'Alok', 'Komal', 'Vivek', 'Shalini', 'Ashok']
const LAST_NAMES = ['Jain', 'Chouhan', 'Mishra', 'Soni', 'Pandey', 'Tiwari', 'Malviya', 'Dubey', 'Bhatia', 'Solanki']
const VENUES = [
  'Maitri Banquet Hall, Raipur',
  'Shankar Nagar Lawns, Raipur',
  'Hariyali Garden, Bhilai',
  'Durg Palace Resort, Durg',
  'Civil Lines Community Hall, Raipur',
  'Mahamaya Lawn, Bilaspur',
  'Telibandha Banquet, Raipur',
]
const EVENT_TYPES = ['wedding', 'birthday', 'corporate', 'other', 'wedding', 'wedding']

const formatDate = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const formatTimestamp = (date) => `${formatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`

const personName = (i) => `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length]}`
const personPhone = (i) => `9811${String(100000 + (i % 30)).padStart(6, '0')}`

// This month: a spread of dates, a date clash (day 21 twice), one booking today, a pending one and a cancelled one.
// Dates already in the past are completed; pending is only used for dates still ahead.
const buildCurrentMonthBookings = (now) => {
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const plan = [
    { day: 2, type: 'wedding', guests: 220, advance: 20000, total: 135000, notes: 'Full catering, 3 live counters' },
    { day: 5, type: 'birthday', guests: 70, advance: 6000, total: 32000, notes: 'Kids menu, chaat counter' },
    { day: 8, type: 'corporate', guests: 140, advance: 15000, total: 78000, notes: 'Dealers meet lunch' },
    { day: 11, type: 'other', guests: 90, advance: 8000, total: 41000, notes: 'Housewarming, pure veg' },
    { day: today, type: 'wedding', guests: 180, advance: 18000, total: 112000, notes: 'Reception dinner, setup from noon' },
    { day: 19, type: 'birthday', guests: 60, advance: 5000, total: 27000, notes: 'Evening snacks and cake table', pending: true },
    { day: 21, type: 'wedding', guests: 260, advance: 25000, total: 148000, notes: 'Clash demo booking 1' },
    { day: 21, type: 'corporate', guests: 110, advance: 10000, total: 64000, notes: 'Clash demo booking 2', pending: true },
    { day: 24, type: 'other', guests: 50, advance: 5000, total: 24000, notes: 'Client cancelled, venue unavailable', cancelled: true },
    { day: 27, type: 'wedding', guests: 200, advance: 22000, total: 125000, notes: 'Sangeet and dinner' },
  ]

  return plan
    .filter((p) => p.day >= 1 && p.day <= lastDay)
    .map((p, i) => {
      const status = p.cancelled ? 'cancelled' : p.day < today ? 'completed' : p.pending ? 'pending' : 'confirmed'
      return {
        client_name: personName(i),
        phone: personPhone(i),
        event_type: p.type,
        event_date: formatDate(new Date(year, month, p.day)),
        guest_count: p.guests,
        venue: VENUES[i % VENUES.length],
        advance: p.advance,
        total: p.total,
        status,
        notes: p.notes,
      }
    })
}

// Previous five months (the analytics window is six months including this one). The peak month is three months
// back, so the monthly chart has a visible shape and the peak-month stat names a past month.
const HISTORY_BOOKINGS_BY_MONTHS_AGO = { 5: 3, 4: 5, 3: 12, 2: 6, 1: 8 }
const buildHistoryBookings = (now) => {
  const rows = []
  let n = 100
  for (const [agoText, count] of Object.entries(HISTORY_BOOKINGS_BY_MONTHS_AGO)) {
    const ago = Number(agoText)
    for (let k = 0; k < count; k += 1) {
      const day = 2 + Math.floor((k * 25) / count)
      const date = new Date(now.getFullYear(), now.getMonth() - ago, day)
      const total = 30000 + ((n * 7919) % 11) * 9000
      rows.push({
        client_name: personName(n),
        phone: personPhone(n),
        event_type: EVENT_TYPES[n % EVENT_TYPES.length],
        event_date: formatDate(date),
        guest_count: 50 + ((n * 37) % 20) * 10,
        venue: VENUES[n % VENUES.length],
        advance: Math.round((total * 0.2) / 1000) * 1000,
        total,
        status: n % 17 === 0 ? 'cancelled' : 'completed',
        notes: null,
      })
      n += 1
    }
  }
  return rows
}

export const seedDevMerchant = async (pool) => {
  if (process.env.NODE_ENV === 'production') {
    return { skipped: true, reason: 'production' }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [DEV_MERCHANT_LOCK_KEY])

    let merchantId
    const { rows: existing } = await client.query('SELECT id FROM merchants WHERE business_name = $1', [
      DEV_MERCHANT.business_name,
    ])
    if (existing[0]) {
      merchantId = existing[0].id
    } else {
      const { rows: legacy } = await client.query('SELECT id FROM merchants WHERE business_name = $1', [LEGACY_NAME])
      if (legacy[0]) {
        merchantId = legacy[0].id
        await client.query('UPDATE merchants SET business_name = $2, owner_name = $3, city = $4 WHERE id = $1', [
          merchantId, DEV_MERCHANT.business_name, DEV_MERCHANT.owner_name, DEV_MERCHANT.city,
        ])
        await client.query('UPDATE merchants SET email = $2 WHERE id = $1 AND email = $3', [merchantId, DEMO_MERCHANTS[1].email, LEGACY_EMAIL])
        // Children first: the composite foreign keys tie them to these bookings and items.
        await client.query(
          `DELETE FROM booking_inventory WHERE merchant_id = $1
           AND (booking_id IN (SELECT id FROM bookings WHERE merchant_id = $1 AND client_name = ANY($2))
                OR item_id IN (SELECT id FROM inventory_items WHERE merchant_id = $1 AND name = ANY($3)))`,
          [merchantId, LEGACY_BOOKING_NAMES, LEGACY_ITEM_NAMES],
        )
        await client.query('DELETE FROM inventory_damage_log WHERE merchant_id = $1 AND item_id IN (SELECT id FROM inventory_items WHERE merchant_id = $1 AND name = ANY($2))', [merchantId, LEGACY_ITEM_NAMES])
        await client.query('DELETE FROM bookings WHERE merchant_id = $1 AND client_name = ANY($2)', [merchantId, LEGACY_BOOKING_NAMES])
        await client.query('DELETE FROM inventory_items WHERE merchant_id = $1 AND name = ANY($2)', [merchantId, LEGACY_ITEM_NAMES])
        console.log(`Renamed dev merchant ${merchantId} to ${DEV_MERCHANT.business_name} and removed its placeholder rows`)
      } else {
        const { rows } = await client.query(
          'INSERT INTO merchants (business_name, owner_name, city) VALUES ($1, $2, $3) RETURNING id',
          [DEV_MERCHANT.business_name, DEV_MERCHANT.owner_name, DEV_MERCHANT.city],
        )
        merchantId = rows[0].id
      }
    }

    const itemIds = {}
    const { rows: itemCount } = await client.query(
      'SELECT COUNT(*)::int AS count FROM inventory_items WHERE merchant_id = $1',
      [merchantId],
    )
    let items = 0
    if (itemCount[0].count === 0) {
      for (const item of INVENTORY) {
        const { rows } = await client.query(
          `INSERT INTO inventory_items (merchant_id, name, total_quantity, damaged_quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [merchantId, item.name, item.total_quantity, item.damaged_quantity, item.unit_price],
        )
        itemIds[item.name] = rows[0].id
        if (item.damaged_quantity > 0) {
          await client.query(
            'INSERT INTO inventory_damage_log (merchant_id, item_id, change, note) VALUES ($1, $2, $3, $4)',
            [merchantId, rows[0].id, item.damaged_quantity, item.damage_note],
          )
        }
        items += 1
      }
    }

    const { rows: bookingCount } = await client.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE merchant_id = $1',
      [merchantId],
    )
    let bookings = 0
    if (bookingCount[0].count === 0) {
      const now = new Date()
      const todayStr = formatDate(now)
      const inserted = []
      for (const row of [...buildHistoryBookings(now), ...buildCurrentMonthBookings(now)]) {
        const { rows } = await client.query(
          `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, venue,
                                 advance, total, subtotal, discount, grand_total, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 0, $9, $10, $11)
           RETURNING id`,
          [merchantId, row.client_name, row.phone, row.event_type, row.event_date, row.guest_count, row.venue, row.advance, row.total, row.status, row.notes],
        )
        inserted.push({ id: rows[0].id, ...row })
        bookings += 1
      }

      // Equipment on a few live bookings (one is today, so "in use today" is not zero) and costs on two finished ones.
      const live = inserted.filter((b) => b.status === 'confirmed' || b.status === 'pending')
      const todays = inserted.find((b) => b.event_date === todayStr && b.status !== 'cancelled')
      const equipped = [todays, ...live].filter((b, i, all) => b && all.indexOf(b) === i).slice(0, 3)
      const attachments = [
        { name: 'Gas Burners', quantity: 8 },
        { name: 'Chafing Dishes', quantity: 30 },
        { name: 'Buffet Counters', quantity: 4 },
      ]
      if (Object.keys(itemIds).length > 0) {
        for (const booking of equipped) {
          for (const line of attachments) {
            const item = INVENTORY.find((i) => i.name === line.name)
            await client.query(
              `INSERT INTO booking_inventory (merchant_id, booking_id, item_id, quantity, unit_price, line_total)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [merchantId, booking.id, itemIds[line.name], line.quantity, item.unit_price, line.quantity * item.unit_price],
            )
          }
        }
      }

      const finished = inserted.filter((b) => b.status === 'completed').slice(-2)
      const expenses = [
        { label: 'Cooks and helpers', amount: 18000 },
        { label: 'Gas cylinders', amount: 4500 },
      ]
      for (const booking of finished) {
        for (const expense of expenses) {
          await client.query(
            'INSERT INTO booking_expenses (merchant_id, booking_id, label, amount) VALUES ($1, $2, $3, $4)',
            [merchantId, booking.id, expense.label, expense.amount],
          )
        }
      }
    }

    await client.query('COMMIT')
    if (items > 0 || bookings > 0 || !existing[0]) {
      console.log(`Seeded dev merchant ${DEV_MERCHANT.business_name} (id ${merchantId}): ${bookings} bookings, ${items} inventory items`)
    }
    return { merchantId, bookings, items, created: !existing[0] }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
