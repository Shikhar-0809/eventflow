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

export const seed = (db) => {
  if (process.env.NODE_ENV === 'production') {
    console.log('Seed skipped: NODE_ENV is production. Demo seed data will not run.')
    return
  }

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM bookings').get()
  if (count > 0) {
    return
  }

  const bookings = buildSeedBookings()
  const insert = db.prepare(`
    INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertAll = db.transaction((rows) => {
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

  insertAll(bookings)
  console.log(`Seeded ${bookings.length} demo bookings`)
}
