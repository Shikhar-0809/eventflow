// Which bookings count toward money and counts (BUGS #096). A cancelled booking stays in the records but is
// never revenue, never a booked event and never a client. Reports, analytics and the sidebar target bar all use this.
//
// NULL status counts as active (the column is nullable, defaults to 'confirmed'): the JS rule below treats it
// that way, so the SQL fragment uses IS DISTINCT FROM, which keeps NULL rows where `<> 'cancelled'` would drop them.

// For SQL on the bookings table (unaliased column; prefix the alias yourself if a query joins).
export const ACTIVE_BOOKING_SQL = "status IS DISTINCT FROM 'cancelled'"

// Same rule for rows already in memory.
export const isActiveBooking = (booking) => booking.status !== 'cancelled'
