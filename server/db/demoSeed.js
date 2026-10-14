const formatDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (base, days) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

const formatTimestamp = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}:${s}`
}

const DEMO_SURESH_PHONE = '9876543220'
const VERIFICATION_CLIENT = 'Verify Demo Client'
const MANUAL_TEST_BOOKING_IDS = [65, 66, 67, 68]

export const removeManualTestBookings = async (pool, merchantId) => {
  const placeholders = MANUAL_TEST_BOOKING_IDS.map((_, i) => `$${i + 2}`).join(', ')
  const { rows } = await pool.query(
    `SELECT id, client_name, event_date FROM bookings WHERE merchant_id = $1 AND id IN (${placeholders})`,
    [merchantId, ...MANUAL_TEST_BOOKING_IDS],
  )

  if (rows.length === 0) {
    return { removed: 0, rows: [] }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const row of rows) {
      await client.query('DELETE FROM change_log WHERE booking_id = $1', [row.id])
      await client.query('DELETE FROM bookings WHERE id = $1', [row.id])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return { removed: rows.length, rows }
}

export const purgeNonDemoEventLog = async (pool, merchantId) => {
  const result = await pool.query(
    `DELETE FROM event_log
     WHERE merchant_id = $1
       AND (metadata NOT LIKE '%"demo_seed":true%' OR metadata IS NULL)`,
    [merchantId],
  )
  return { removed: result.rowCount }
}

export const removeVerificationBookings = async (pool, merchantId) => {
  const { rows } = await pool.query(
    'SELECT id, client_name, event_date FROM bookings WHERE merchant_id = $1 AND client_name = $2',
    [merchantId, VERIFICATION_CLIENT],
  )

  if (rows.length === 0) {
    return { removed: 0, rows: [] }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const row of rows) {
      await client.query('DELETE FROM change_log WHERE booking_id = $1', [row.id])
      await client.query('DELETE FROM bookings WHERE id = $1', [row.id])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return { removed: rows.length, rows }
}

export const seedSureshDemoBooking = async (pool, merchantId) => {
  const { rows: existingRows } = await pool.query(
    'SELECT id FROM bookings WHERE merchant_id = $1 AND phone = $2',
    [merchantId, DEMO_SURESH_PHONE],
  )
  if (existingRows[0]) {
    return { inserted: false, id: existingRows[0].id }
  }

  const now = new Date()
  const conflictDay = addDays(now, 6)
  const conflictDateStr = formatDate(conflictDay)
  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*) AS count FROM bookings WHERE merchant_id = $1 AND event_date = $2',
    [merchantId, conflictDateStr],
  )
  const conflictCount = parseInt(countRows[0].count, 10)

  const targetDay = conflictCount > 0 ? addDays(now, 7) : conflictDay
  const eventDate = formatDate(targetDay)

  const { rows } = await pool.query(
    `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      merchantId,
      'Suresh Kumar',
      DEMO_SURESH_PHONE,
      'wedding',
      eventDate,
      350,
      'Gandhi Maidan',
      20000,
      120000,
      'confirmed',
      'Demo recording booking — near-term wedding, separate from conflict-demo date',
    ],
  )

  return { inserted: true, id: rows[0].id, eventDate, conflictDateStr }
}

export const seedDemoEventLog = async (pool, merchantId) => {
  const { rows: markerRows } = await pool.query(
    "SELECT COUNT(*) AS count FROM event_log WHERE merchant_id = $1 AND metadata LIKE '%\"demo_seed\":true%'",
    [merchantId],
  )
  const markerCount = parseInt(markerRows[0].count, 10)

  if (markerCount >= 7) {
    return { inserted: 0, skipped: true, total: markerCount }
  }

  if (markerCount > 0) {
    await pool.query('DELETE FROM event_log WHERE merchant_id = $1', [merchantId])
  }

  const { rows: bookingIdRows } = await pool.query(
    'SELECT id FROM bookings WHERE merchant_id = $1 ORDER BY id ASC LIMIT 10',
    [merchantId],
  )
  const bookingIds = bookingIdRows.map((row) => row.id)

  if (bookingIds.length === 0) {
    return { inserted: 0, skipped: true }
  }

  const pickId = (index) => bookingIds[index % bookingIds.length]

  const now = new Date()
  const at = (daysAgo, hour, minute = 0) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hour, minute, 0, 0)
    return formatTimestamp(d)
  }

  const events = [
    { event_type: 'login', metadata: JSON.stringify({ demo_seed: true }), created_at: at(6, 9, 15) },
    { event_type: 'login', metadata: JSON.stringify({ demo_seed: true }), created_at: at(4, 18, 40) },
    { event_type: 'login', metadata: JSON.stringify({ demo_seed: true }), created_at: at(1, 8, 5) },
    {
      event_type: 'booking_created',
      metadata: JSON.stringify({ booking_id: pickId(0), demo_seed: true }),
      created_at: at(5, 11, 20),
    },
    {
      event_type: 'booking_created',
      metadata: JSON.stringify({ booking_id: pickId(2), demo_seed: true }),
      created_at: at(2, 16, 45),
    },
    {
      event_type: 'whatsapp_confirmation_sent',
      metadata: JSON.stringify({ booking_id: pickId(4), demo_seed: true }),
      created_at: at(3, 10, 30),
    },
    {
      event_type: 'whatsapp_confirmation_sent',
      metadata: JSON.stringify({ booking_id: pickId(5), demo_seed: true }),
      created_at: at(1, 14, 10),
    },
  ]

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const row of events) {
      await client.query(
        'INSERT INTO event_log (merchant_id, event_type, metadata, created_at) VALUES ($1, $2, $3, $4)',
        [merchantId, row.event_type, row.metadata, row.created_at],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return { inserted: events.length, skipped: false }
}

export const seedKapilTomarBooking = async (pool, merchantId) => {
  const KAPIL_NAME = 'Kapil Tomar'
  const KAPIL_PHONE = '9837541200'
  const BOOKING_CREATED_AT = '2026-06-30 11:30:00'
  const EVENT_CREATED_AT = '2026-06-30 11:32:00'

  const { rows: existingRows } = await pool.query(
    'SELECT id FROM bookings WHERE merchant_id = $1 AND client_name = $2 AND phone = $3',
    [merchantId, KAPIL_NAME, KAPIL_PHONE],
  )

  let bookingId = existingRows[0]?.id

  if (!bookingId) {
    const { rows } = await pool.query(
      `INSERT INTO bookings (
         merchant_id, client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        merchantId,
        KAPIL_NAME,
        KAPIL_PHONE,
        'wedding',
        '2026-07-18',
        45,
        'Brahmpuri Garden, Meerut',
        12000,
        65000,
        'confirmed',
        'Family wedding, evening setup',
        BOOKING_CREATED_AT,
      ],
    )
    bookingId = rows[0].id
  }

  const metadata = JSON.stringify({ booking_id: bookingId })
  const { rows: logRows } = await pool.query(
    `SELECT id FROM event_log
     WHERE merchant_id = $1 AND event_type = 'booking_created' AND metadata = $2 AND created_at = $3`,
    [merchantId, metadata, EVENT_CREATED_AT],
  )

  if (!logRows[0]) {
    await pool.query(
      `INSERT INTO event_log (merchant_id, event_type, metadata, created_at)
       VALUES ($1, 'booking_created', $2, $3)`,
      [merchantId, metadata, EVENT_CREATED_AT],
    )
  }

  return { inserted: !existingRows[0], id: bookingId }
}

export const logDevBookings = async (pool, merchantId) => {
  const { rows } = await pool.query(
    'SELECT id, event_date, status FROM bookings WHERE merchant_id = $1 ORDER BY event_date, id',
    [merchantId],
  )

  console.log(`Demo bookings (dev boot, merchant ${merchantId}): count=${rows.length}`)
  for (const row of rows) {
    console.log(`  id=${row.id}  date=${row.event_date}  status=${row.status}`)
  }

  return rows
}
