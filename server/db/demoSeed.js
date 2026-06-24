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

export const removeManualTestBookings = (db) => {
  const placeholders = MANUAL_TEST_BOOKING_IDS.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT id, client_name, event_date FROM bookings WHERE id IN (${placeholders})`)
    .all(...MANUAL_TEST_BOOKING_IDS)

  if (rows.length === 0) {
    return { removed: 0, rows: [] }
  }

  const deleteChangeLog = db.prepare('DELETE FROM change_log WHERE booking_id = ?')
  const deleteBooking = db.prepare('DELETE FROM bookings WHERE id = ?')
  const removeMany = db.transaction((toRemove) => {
    for (const row of toRemove) {
      deleteChangeLog.run(row.id)
      deleteBooking.run(row.id)
    }
  })
  removeMany(rows)

  return { removed: rows.length, rows }
}

export const purgeNonDemoEventLog = (db) => {
  const result = db
    .prepare(`DELETE FROM event_log
              WHERE metadata NOT LIKE '%"demo_seed":true%' OR metadata IS NULL`)
    .run()
  return { removed: result.changes }
}

export const removeVerificationBookings = (db) => {
  const rows = db
    .prepare('SELECT id, client_name, event_date FROM bookings WHERE client_name = ?')
    .all(VERIFICATION_CLIENT)

  if (rows.length === 0) {
    return { removed: 0, rows: [] }
  }

  const deleteChangeLog = db.prepare('DELETE FROM change_log WHERE booking_id = ?')
  const deleteBooking = db.prepare('DELETE FROM bookings WHERE id = ?')
  const removeMany = db.transaction((toRemove) => {
    for (const row of toRemove) {
      deleteChangeLog.run(row.id)
      deleteBooking.run(row.id)
    }
  })
  removeMany(rows)

  return { removed: rows.length, rows }
}

export const seedSureshDemoBooking = (db) => {
  const existing = db.prepare('SELECT id FROM bookings WHERE phone = ?').get(DEMO_SURESH_PHONE)
  if (existing) {
    return { inserted: false, id: existing.id }
  }

  const now = new Date()
  const conflictDay = addDays(now, 6)
  const conflictDateStr = formatDate(conflictDay)
  const conflictCount = db
    .prepare('SELECT COUNT(*) AS count FROM bookings WHERE event_date = ?')
    .get(conflictDateStr).count

  const targetDay = conflictCount > 0 ? addDays(now, 7) : conflictDay
  const eventDate = formatDate(targetDay)

  const result = db.prepare(`
    INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  )

  return { inserted: true, id: result.lastInsertRowid, eventDate, conflictDateStr }
}

export const seedDemoEventLog = (db) => {
  const markerCount = db
    .prepare("SELECT COUNT(*) AS count FROM event_log WHERE metadata LIKE '%\"demo_seed\":true%'")
    .get().count

  if (markerCount >= 7) {
    return { inserted: 0, skipped: true, total: markerCount }
  }

  if (markerCount > 0) {
    db.prepare('DELETE FROM event_log').run()
  }

  const bookingIds = db
    .prepare('SELECT id FROM bookings ORDER BY id ASC LIMIT 10')
    .all()
    .map((row) => row.id)

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

  const insert = db.prepare(
    'INSERT INTO event_log (event_type, metadata, created_at) VALUES (?, ?, ?)',
  )
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row.event_type, row.metadata, row.created_at)
    }
  })
  insertMany(events)

  return { inserted: events.length, skipped: false }
}

export const logDevBookings = (db) => {
  const rows = db
    .prepare('SELECT id, client_name, event_date, status FROM bookings ORDER BY event_date, id')
    .all()

  console.log('Demo bookings (dev boot):')
  for (const row of rows) {
    console.log(`  id=${row.id}  ${row.event_date}  ${row.client_name}  (${row.status})`)
  }

  return rows
}
