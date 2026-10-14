// Dev-only second tenant, "Test Tent Co", so cross-merchant leaks are visible locally.
// seed() skips everything in production; this module also refuses to run there. Fictional data only.
// Idempotent: the merchant is found by name, and each table is only filled while this merchant has no rows in it.

const DEV_MERCHANT = { business_name: 'Test Tent Co', owner_name: 'Test Owner', city: 'Testville' }

// Arbitrary application-wide key so two booting servers cannot both create the merchant.
const DEV_MERCHANT_LOCK_KEY = 7240025

// "Plastic Chairs" deliberately shares its name with a merchant-1 item to exercise UNIQUE (merchant_id, name).
const DEV_ITEMS = [
  { name: 'Plastic Chairs', total_quantity: 80, damaged_quantity: 0, unit_price: 5 },
  { name: 'Gas Burners', total_quantity: 6, damaged_quantity: 0, unit_price: 150 },
]

const formatDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const buildDevBookings = () => {
  const now = new Date()
  const inDays = (days) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    return formatDate(d)
  }
  return [
    { client_name: 'Test Client One', phone: '9000000001', event_type: 'wedding', event_date: inDays(5), guest_count: 120, venue: 'Test Hall One', advance: 5000, total: 40000, status: 'confirmed', notes: 'Second-merchant dev data' },
    { client_name: 'Test Client Two', phone: '9000000002', event_type: 'birthday', event_date: inDays(12), guest_count: 40, venue: 'Test Hall Two', advance: 2000, total: 15000, status: 'pending', notes: 'Second-merchant dev data' },
  ]
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
      const { rows } = await client.query(
        'INSERT INTO merchants (business_name, owner_name, city) VALUES ($1, $2, $3) RETURNING id',
        [DEV_MERCHANT.business_name, DEV_MERCHANT.owner_name, DEV_MERCHANT.city],
      )
      merchantId = rows[0].id
    }

    const { rows: itemCount } = await client.query(
      'SELECT COUNT(*)::int AS count FROM inventory_items WHERE merchant_id = $1',
      [merchantId],
    )
    let items = 0
    if (itemCount[0].count === 0) {
      for (const item of DEV_ITEMS) {
        await client.query(
          `INSERT INTO inventory_items (merchant_id, name, total_quantity, damaged_quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [merchantId, item.name, item.total_quantity, item.damaged_quantity, item.unit_price],
        )
        items += 1
      }
    }

    const { rows: bookingCount } = await client.query(
      'SELECT COUNT(*)::int AS count FROM bookings WHERE merchant_id = $1',
      [merchantId],
    )
    let bookings = 0
    if (bookingCount[0].count === 0) {
      for (const row of buildDevBookings()) {
        await client.query(
          `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [merchantId, row.client_name, row.phone, row.event_type, row.event_date, row.guest_count, row.venue, row.advance, row.total, row.status, row.notes],
        )
        bookings += 1
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
