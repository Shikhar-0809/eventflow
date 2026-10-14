/** Realistic 27-day demo analytics (19 Jul – 14 Aug 2026) for UsageView. */

const IST = '+05:30'

const ts = (date, time) => `${date}T${time}${IST}`

const DEMO_BOOKINGS = [
  // Week 20–26 Jul (2)
  { created_at: ts('2026-07-21', '11:23:00'), event_date: '2026-09-10', client_name: 'Rajesh Agarwal', phone: '9876510001', event_type: 'wedding', guest_count: 280, venue: 'Shastri Nagar Community Hall, Meerut', advance: 18000, total: 125000, status: 'confirmed', notes: 'Full tent + catering package' },
  { created_at: ts('2026-07-23', '14:45:00'), event_date: '2026-09-08', client_name: 'Poonam Verma', phone: '9876510002', event_type: 'birthday', guest_count: 75, venue: 'Pallavpuram Lawn, Meerut', advance: 9000, total: 48000, status: 'confirmed', notes: 'Golden birthday theme' },
  // Week 27 Jul–2 Aug (1)
  { created_at: ts('2026-07-28', '11:15:00'), event_date: '2026-09-15', client_name: 'Vikram Tyagi', phone: '9876510003', event_type: 'wedding', guest_count: 320, venue: 'Hapur Road Tent Ground, Meerut', advance: 20000, total: 150000, status: 'confirmed', notes: 'Two-stage wedding setup' },
  // Week 3–9 Aug (3) — unchanged
  { created_at: ts('2026-08-04', '11:08:00'), event_date: '2026-08-25', client_name: 'Nisha Kapoor', phone: '9876510011', event_type: 'wedding', guest_count: 200, venue: 'Shastri Nagar Banquet, Meerut', advance: 14000, total: 105000, status: 'confirmed', notes: 'Vegetarian menu only' },
  { created_at: ts('2026-08-06', '14:22:00'), event_date: '2026-08-27', client_name: 'Arun Yadav', phone: '9876510012', event_type: 'corporate', guest_count: 110, venue: 'Pallavpuram Convention, Meerut', advance: 12000, total: 72000, status: 'confirmed', notes: 'Product launch event' },
  { created_at: ts('2026-08-08', '16:45:00'), event_date: '2026-08-29', client_name: 'Priya Saini', phone: '9876510013', event_type: 'birthday', guest_count: 80, venue: 'Garh Road Terrace, Meerut', advance: 11000, total: 52000, status: 'confirmed', notes: 'Surprise party setup' },
  // Week 10–14 Aug (1)
  { created_at: ts('2026-08-11', '10:35:00'), event_date: '2026-09-01', client_name: 'Sanjay Mehta', phone: '9876510014', event_type: 'wedding', guest_count: 260, venue: 'Brahmpuri Garden, Meerut', advance: 19000, total: 132000, status: 'confirmed', notes: 'Barat + reception both days' },
  // Week 13–19 Jul (3)
  { created_at: ts('2026-07-14', '11:40:00'), event_date: '2026-09-20', client_name: 'Harpreet Kaur', phone: '9876510015', event_type: 'wedding', guest_count: 220, venue: 'Garh Road Banquet, Meerut', advance: 16000, total: 110000, status: 'confirmed', notes: 'Day wedding, morning barat' },
  { created_at: ts('2026-07-16', '15:10:00'), event_date: '2026-09-25', client_name: 'Imran Siddiqui', phone: '9876510016', event_type: 'birthday', guest_count: 85, venue: 'Shastri Nagar Party Plot, Meerut', advance: 9500, total: 50000, status: 'confirmed', notes: 'Outdoor setup with shamiana' },
  { created_at: ts('2026-07-18', '13:25:00'), event_date: '2026-10-02', client_name: 'Lata Mishra', phone: '9876510017', event_type: 'corporate', guest_count: 100, venue: 'Hapur Road Convention Hall, Meerut', advance: 12000, total: 68000, status: 'confirmed', notes: 'Quarterly team celebration' },
]

/** One login per day, 19 Jul – 14 Aug 2026, always first event of the day (9:00–10:30). */
const LOGIN_TIMES = [
  ts('2026-07-13', '09:08:00'),
  ts('2026-07-14', '09:21:00'),
  ts('2026-07-15', '10:05:00'),
  ts('2026-07-16', '09:35:00'),
  ts('2026-07-17', '09:52:00'),
  ts('2026-07-18', '10:18:00'),
  ts('2026-07-19', '09:14:00'),
  ts('2026-07-20', '09:22:00'),
  ts('2026-07-21', '09:38:00'),
  ts('2026-07-22', '09:05:00'),
  ts('2026-07-23', '10:12:00'),
  ts('2026-07-24', '09:47:00'),
  ts('2026-07-25', '09:31:00'),
  ts('2026-07-26', '10:05:00'),
  ts('2026-07-27', '09:18:00'),
  ts('2026-07-28', '09:55:00'),
  ts('2026-07-29', '10:22:00'),
  ts('2026-07-30', '09:08:00'),
  ts('2026-07-31', '09:42:00'),
  ts('2026-08-01', '10:15:00'),
  ts('2026-08-02', '09:27:00'),
  ts('2026-08-03', '09:51:00'),
  ts('2026-08-04', '10:08:00'),
  ts('2026-08-05', '09:33:00'),
  ts('2026-08-06', '09:19:00'),
  ts('2026-08-07', '10:28:00'),
  ts('2026-08-08', '09:44:00'),
  ts('2026-08-09', '09:06:00'),
  ts('2026-08-10', '09:58:00'),
  ts('2026-08-11', '10:11:00'),
  ts('2026-08-12', '09:25:00'),
  ts('2026-08-13', '09:37:00'),
  ts('2026-08-14', '09:49:00'),
]

/** booking index → edit timestamp (3 edits ≈ 43% of 7 bookings). */
const EDIT_SCHEDULE = [
  { bookingIndex: 0, created_at: ts('2026-07-22', '14:10:00') },  // week 20–26 Jul: 1
  { bookingIndex: 2, created_at: ts('2026-07-30', '10:15:00') },  // week 27 Jul–2 Aug: 1
  { bookingIndex: 3, created_at: ts('2026-08-05', '11:55:00') },  // week 3–9 Aug: 1 (unchanged)
  { bookingIndex: 7, created_at: ts('2026-07-16', '14:30:00') },  // week 13–19 Jul: 1
]

const WHATSAPP_CONFIRM_OFFSETS = [
  { bookingIndex: 0, created_at: ts('2026-07-21', '18:05:00') },  // week 20–26 Jul
  { bookingIndex: 1, created_at: ts('2026-07-23', '19:20:00') },  // week 20–26 Jul
  { bookingIndex: 2, created_at: ts('2026-07-28', '17:45:00') },  // week 27 Jul–2 Aug
  { bookingIndex: 4, created_at: ts('2026-08-06', '15:40:00') },  // week 3–9 Aug (unchanged)
  { bookingIndex: 5, created_at: ts('2026-08-08', '17:55:00') },  // week 3–9 Aug (unchanged)
  { bookingIndex: 6, created_at: ts('2026-08-11', '12:20:00') },  // week 10–14 Aug
  { bookingIndex: 7, created_at: ts('2026-07-14', '18:20:00') },  // week 13–19 Jul
  { bookingIndex: 8, created_at: ts('2026-07-16', '17:45:00') },  // week 13–19 Jul
]

const WHATSAPP_REMINDERS = [
  { bookingIndex: 1, created_at: ts('2026-07-24', '10:00:00') },
  { bookingIndex: 4, created_at: ts('2026-08-09', '14:15:00') },
  { bookingIndex: 6, created_at: ts('2026-08-13', '09:45:00') },
  { bookingIndex: 8, created_at: ts('2026-07-18', '10:30:00') },
]

/** booking index → 2–4 view timestamps after creation. */
const VIEW_SCHEDULE = [
  [ts('2026-07-22', '11:30:00'), ts('2026-07-25', '14:00:00'), ts('2026-08-01', '10:15:00')],
  [ts('2026-07-24', '12:20:00'), ts('2026-07-27', '15:45:00'), ts('2026-08-02', '11:00:00'), ts('2026-08-05', '16:30:00')],
  [ts('2026-07-29', '11:15:00'), ts('2026-08-02', '15:30:00'), ts('2026-08-06', '10:50:00')],
  [ts('2026-08-05', '12:00:00'), ts('2026-08-09', '14:30:00'), ts('2026-08-12', '10:05:00')],
  [ts('2026-08-07', '11:35:00'), ts('2026-08-10', '15:50:00')],
  [ts('2026-08-09', '12:45:00'), ts('2026-08-11', '16:20:00'), ts('2026-08-13', '11:10:00')],
  [ts('2026-08-12', '14:00:00'), ts('2026-08-13', '17:30:00'), ts('2026-08-14', '10:55:00')],
  [ts('2026-07-15', '12:10:00'), ts('2026-07-17', '15:40:00'), ts('2026-07-18', '11:25:00')],
  [ts('2026-07-17', '13:50:00'), ts('2026-07-19', '10:05:00')],
  [ts('2026-07-19', '11:20:00'), ts('2026-07-19', '16:10:00')],
]

// Every event carries the demo_seed marker so purgeNonDemoEventLog (which runs first on every dev boot)
// keeps them; unmarked, they were deleted at the second boot of a fresh database.
const buildEventRows = (bookingIds) => {
  const events = []

  for (const created_at of LOGIN_TIMES) {
    events.push({ event_type: 'login', metadata: JSON.stringify({ demo_seed: true }), created_at })
  }

  bookingIds.forEach((bookingId, index) => {
    events.push({
      event_type: 'booking_created',
      metadata: JSON.stringify({ booking_id: bookingId, demo_seed: true }),
      created_at: DEMO_BOOKINGS[index].created_at,
    })
  })

  for (const { bookingIndex, created_at } of EDIT_SCHEDULE) {
    events.push({
      event_type: 'booking_edited',
      metadata: JSON.stringify({ booking_id: bookingIds[bookingIndex], demo_seed: true }),
      created_at,
    })
  }

  bookingIds.forEach((bookingId, index) => {
    for (const created_at of VIEW_SCHEDULE[index]) {
      events.push({
        event_type: 'booking_viewed',
        metadata: JSON.stringify({ booking_id: bookingId, demo_seed: true }),
        created_at,
      })
    }
  })

  for (const { bookingIndex, created_at } of WHATSAPP_CONFIRM_OFFSETS) {
    events.push({
      event_type: 'whatsapp_confirmation_sent',
      metadata: JSON.stringify({ booking_id: bookingIds[bookingIndex], demo_seed: true }),
      created_at,
    })
  }

  for (const { bookingIndex, created_at } of WHATSAPP_REMINDERS) {
    events.push({
      event_type: 'whatsapp_reminder_sent',
      metadata: JSON.stringify({ booking_id: bookingIds[bookingIndex], demo_seed: true }),
      created_at,
    })
  }

  events.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return events
}

const summarizeByType = (events) => {
  const counts = {}
  for (const row of events) {
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1
  }
  return counts
}

export const seedDemoAnalytics = async (pool, merchantId) => {
  if (process.env.NODE_ENV === 'production') {
    return { skipped: true, reason: 'production' }
  }

  // Guard on the bookings this seed creates. event_log alone is not enough: purgeNonDemoEventLog
  // empties it on every boot (these events carry no demo_seed marker), which used to make this
  // seed insert another 10 bookings each time.
  const { rows: existingRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM bookings WHERE merchant_id = $1 AND phone = ANY($2::text[])',
    [merchantId, DEMO_BOOKINGS.map((row) => row.phone)],
  )
  if (existingRows[0].count > 0) {
    return { skipped: true, reason: 'demo analytics bookings already present', existing: existingRows[0].count }
  }

  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM event_log WHERE merchant_id = $1',
    [merchantId],
  )
  if (countRows[0].count >= 5) {
    return { skipped: true, reason: 'event_log already populated', existing: countRows[0].count }
  }

  const client = await pool.connect()
  let bookingIds = []
  let events = []

  try {
    await client.query('BEGIN')

    for (const row of DEMO_BOOKINGS) {
      const { rows } = await client.query(
        `INSERT INTO bookings (
           merchant_id, client_name, phone, event_type, event_date, guest_count, venue,
           advance, total, status, notes, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          merchantId,
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
          row.created_at,
        ],
      )
      bookingIds.push(rows[0].id)
    }

    events = buildEventRows(bookingIds)

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

  const byType = summarizeByType(events)
  console.log(`Seeded ${bookingIds.length} demo analytics bookings`)
  console.log(`Seeded ${events.length} demo analytics event_log rows:`)
  for (const [eventType, count] of Object.entries(byType).sort()) {
    console.log(`  ${eventType}: ${count}`)
  }

  return {
    skipped: false,
    inserted: true,
    bookings: bookingIds.length,
    events: events.length,
    byType,
  }
}
