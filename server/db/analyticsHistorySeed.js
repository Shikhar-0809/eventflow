const formatDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const monthStart = (year, monthIndex) => {
  const month = String(monthIndex + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

const nextMonthStart = (year, monthIndex) => {
  if (monthIndex === 11) return `${year + 1}-01-01`
  const month = String(monthIndex + 2).padStart(2, '0')
  return `${year}-${month}-01`
}

const dayInMonth = (year, monthIndex, day) => formatDate(new Date(year, monthIndex, day))

/** Bookings for months M-5 … M-1 (never current month — June seed stays separate). */
export const buildHistoricalSeedBookings = () => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const monthOffset = (ago) => {
    const d = new Date(currentYear, currentMonth - ago, 1)
    return { year: d.getFullYear(), monthIndex: d.getMonth() }
  }

  const m5 = monthOffset(5)
  const m4 = monthOffset(4)
  const m3 = monthOffset(3)
  const m2 = monthOffset(2)
  const m1 = monthOffset(1)

  return [
    { client_name: 'Harish Iyer', phone: '9865000001', event_type: 'wedding', event_date: dayInMonth(m5.year, m5.monthIndex, 8), guest_count: 220, venue: 'City Garden, Indore', advance: 14000, total: 98000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Lata Menon', phone: '9865000002', event_type: 'birthday', event_date: dayInMonth(m5.year, m5.monthIndex, 16), guest_count: 70, venue: 'Rose Banquet, Bhopal', advance: 7000, total: 38000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Gopal Das', phone: '9865000003', event_type: 'corporate', event_date: dayInMonth(m5.year, m5.monthIndex, 24), guest_count: 110, venue: 'Trade Centre, Nagpur', advance: 11000, total: 62000, status: 'pending', notes: 'Analytics history seed' },
    { client_name: 'Sunita Rao', phone: '9865000004', event_type: 'wedding', event_date: dayInMonth(m4.year, m4.monthIndex, 5), guest_count: 260, venue: 'Palace Lawns, Mysuru', advance: 16000, total: 115000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Imran Khan', phone: '9865000005', event_type: 'wedding', event_date: dayInMonth(m4.year, m4.monthIndex, 12), guest_count: 190, venue: 'Royal Tent City, Lucknow', advance: 15000, total: 105000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Pooja Shah', phone: '9865000006', event_type: 'birthday', event_date: dayInMonth(m4.year, m4.monthIndex, 19), guest_count: 90, venue: 'Skyline Terrace, Mumbai', advance: 9000, total: 48000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Nitin Bose', phone: '9865000007', event_type: 'other', event_date: dayInMonth(m4.year, m4.monthIndex, 26), guest_count: 55, venue: 'Community Park, Kolkata', advance: 5500, total: 30000, status: 'cancelled', notes: 'Analytics history seed' },
    { client_name: 'Asha Pillai', phone: '9865000008', event_type: 'wedding', event_date: dayInMonth(m3.year, m3.monthIndex, 4), guest_count: 240, venue: 'Backwater Resort, Kochi', advance: 17000, total: 125000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Rahul Khanna', phone: '9865000009', event_type: 'corporate', event_date: dayInMonth(m3.year, m3.monthIndex, 9), guest_count: 130, venue: 'Innovation Hub, Gurgaon', advance: 13000, total: 78000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Divya Saxena', phone: '9865000010', event_type: 'birthday', event_date: dayInMonth(m3.year, m3.monthIndex, 15), guest_count: 75, venue: 'Garden Cafe, Chandigarh', advance: 7500, total: 42000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Mohit Agarwal', phone: '9865000011', event_type: 'wedding', event_date: dayInMonth(m3.year, m3.monthIndex, 21), guest_count: 210, venue: 'Heritage Haveli, Jaipur', advance: 19000, total: 128000, status: 'pending', notes: 'Analytics history seed' },
    { client_name: 'Kiran Malhotra', phone: '9865000012', event_type: 'other', event_date: dayInMonth(m3.year, m3.monthIndex, 28), guest_count: 50, venue: 'Town Hall, Amritsar', advance: 5000, total: 27000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Suresh Kumar', phone: '9865000013', event_type: 'wedding', event_date: dayInMonth(m2.year, m2.monthIndex, 2), guest_count: 350, venue: 'Gandhi Maidan, Patna', advance: 20000, total: 120000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Neha Singh', phone: '9865000014', event_type: 'wedding', event_date: dayInMonth(m2.year, m2.monthIndex, 6), guest_count: 280, venue: 'Lotus Banquet, Delhi', advance: 21000, total: 140000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Farhan Ali', phone: '9865000015', event_type: 'wedding', event_date: dayInMonth(m2.year, m2.monthIndex, 9), guest_count: 230, venue: 'Pearl Convention, Hyderabad', advance: 18000, total: 112000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Geeta Rani', phone: '9865000016', event_type: 'birthday', event_date: dayInMonth(m2.year, m2.monthIndex, 12), guest_count: 85, venue: 'Sunset Lawn, Pune', advance: 8500, total: 46000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Tarun Bhatt', phone: '9865000017', event_type: 'corporate', event_date: dayInMonth(m2.year, m2.monthIndex, 15), guest_count: 140, venue: 'Tech Campus, Bengaluru', advance: 14000, total: 82000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Rekha Nambiar', phone: '9865000018', event_type: 'wedding', event_date: dayInMonth(m2.year, m2.monthIndex, 18), guest_count: 200, venue: 'Coconut Grove, Chennai', advance: 16000, total: 108000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Sanjay Pawar', phone: '9865000019', event_type: 'other', event_date: dayInMonth(m2.year, m2.monthIndex, 22), guest_count: 65, venue: 'Riverfront, Nashik', advance: 6500, total: 34000, status: 'pending', notes: 'Analytics history seed' },
    { client_name: 'Anjali Trivedi', phone: '9865000020', event_type: 'wedding', event_date: dayInMonth(m2.year, m2.monthIndex, 27), guest_count: 260, venue: 'Marble Hall, Vadodara', advance: 20000, total: 132000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Vivek Chopra', phone: '9865000021', event_type: 'wedding', event_date: dayInMonth(m1.year, m1.monthIndex, 3), guest_count: 240, venue: 'Grand Vista, Noida', advance: 17000, total: 118000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Manisha Dutta', phone: '9865000022', event_type: 'birthday', event_date: dayInMonth(m1.year, m1.monthIndex, 8), guest_count: 80, venue: 'Lake Club, Bhubaneswar', advance: 8000, total: 44000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Rohit Saini', phone: '9865000023', event_type: 'corporate', event_date: dayInMonth(m1.year, m1.monthIndex, 14), guest_count: 125, venue: 'Expo Centre, Ahmedabad', advance: 12500, total: 74000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Swati Kulkarni', phone: '9865000024', event_type: 'wedding', event_date: dayInMonth(m1.year, m1.monthIndex, 19), guest_count: 210, venue: 'Hilltop Gardens, Lonavala', advance: 18000, total: 122000, status: 'confirmed', notes: 'Analytics history seed' },
    { client_name: 'Amit Yadav', phone: '9865000025', event_type: 'other', event_date: dayInMonth(m1.year, m1.monthIndex, 23), guest_count: 45, venue: 'Open Ground, Ranchi', advance: 4500, total: 26000, status: 'cancelled', notes: 'Analytics history seed' },
    { client_name: 'Preeti Anand', phone: '9865000026', event_type: 'wedding', event_date: dayInMonth(m1.year, m1.monthIndex, 29), guest_count: 195, venue: 'Silver Oak, Dehradun', advance: 15500, total: 99000, status: 'pending', notes: 'Analytics history seed' },
  ]
}

export const seedAnalyticsHistory = async (pool, merchantId) => {
  if (process.env.NODE_ENV === 'production') {
    return { inserted: 0, skipped: true }
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const currentStart = monthStart(currentYear, currentMonth)

  const monthBookingCount = async (year, monthIndex) => {
    const start = monthStart(year, monthIndex)
    const end = nextMonthStart(year, monthIndex)
    const { rows } = await pool.query(
      'SELECT COUNT(*) AS count FROM bookings WHERE merchant_id = $1 AND event_date >= $2 AND event_date < $3',
      [merchantId, start, end],
    )
    return parseInt(rows[0].count, 10)
  }

  const historical = buildHistoricalSeedBookings().filter((row) => row.event_date < currentStart)
  const toInsert = []

  for (const row of historical) {
    const [yearStr, monthStr] = row.event_date.split('-')
    const year = Number(yearStr)
    const monthIndex = Number(monthStr) - 1
    if (await monthBookingCount(year, monthIndex) > 0) {
      continue
    }
    toInsert.push(row)
  }

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: false }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const row of toInsert) {
      await client.query(
        `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, venue, advance, total, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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

  console.log(`Seeded ${toInsert.length} analytics history bookings`)
  return { inserted: toInsert.length, skipped: false }
}

export { monthStart, nextMonthStart }
