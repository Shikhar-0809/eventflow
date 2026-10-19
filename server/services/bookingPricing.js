// Server-side pricing for bookings (BUGS #062). The server, not the browser, decides every derived amount.
//
// With inventory lines:
//   unit_price  = the client's value when sent (the merchant's per-line override), else the item's stored rate
//   line_total  = quantity x unit_price
//   subtotal    = sum of line totals
//   grand_total = max(0, subtotal - discount)
//   total       = grand_total
//   Any line_total / subtotal / grand_total / total the client sent is ignored (stripped, not rejected).
// With no lines the merchant's typed total is kept (see priceZeroLineBooking).

export const MAX_AMOUNT = 10000000
export const INVALID_ITEMS_MESSAGE = 'One or more inventory items are invalid.'
export const ADVANCE_EXCEEDS_TOTAL_MESSAGE = 'Advance cannot exceed total.'
const MAX_AMOUNT_LABEL = '₹1,00,00,000'

// A 400 with a message written for the merchant.
export class BookingInputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BookingInputError'
    this.status = 400
  }
}

const MAX_INT4 = 2147483647

// Rates and names of the lines' items, but only items that belong to this merchant.
// Throws the same "invalid items" error for a missing item and for another merchant's item.
export const loadItemRates = async (client, merchantId, lines) => {
  const ids = [...new Set(lines.map((line) => line.item_id))]
  if (ids.length === 0) return new Map()
  if (ids.some((id) => !Number.isInteger(id) || id <= 0 || id > MAX_INT4)) {
    throw new BookingInputError(INVALID_ITEMS_MESSAGE)
  }

  const { rows } = await client.query(
    'SELECT id, name, unit_price FROM inventory_items WHERE merchant_id = $1 AND id = ANY($2::int[])',
    [merchantId, ids],
  )
  if (rows.length !== ids.length) throw new BookingInputError(INVALID_ITEMS_MESSAGE)
  return new Map(rows.map((row) => [Number(row.id), { name: row.name, unit_price: Number(row.unit_price ?? 0) }]))
}

const rejectIfAdvanceExceedsTotal = (advance, total) => {
  // Same rule as the client schema: it only applies once the booking has a price.
  if (total > 0 && advance > total) throw new BookingInputError(ADVANCE_EXCEEDS_TOTAL_MESSAGE)
}

// No lines: the merchant's typed total is authoritative (an unpriced or hand-priced booking).
//   total       = typed total
//   grand_total = total (never the client's separate value)
//   subtotal    = client's subtotal if sent, else 0 (as before)
//   discount    = client's discount if sent, else 0 (as before)
const priceZeroLineBooking = (fields) => {
  const total = fields.total ?? 0
  const subtotal = fields.subtotal ?? 0
  const discount = fields.discount ?? 0
  if (subtotal > MAX_AMOUNT) throw new BookingInputError(`Subtotal cannot be more than ${MAX_AMOUNT_LABEL}.`)
  if (total > MAX_AMOUNT) throw new BookingInputError(`Total cannot be more than ${MAX_AMOUNT_LABEL}.`)
  rejectIfAdvanceExceedsTotal(fields.advance, total)
  return { totals: { total, subtotal, discount, grand_total: total }, lines: [] }
}

// Returns { totals: { total, subtotal, discount, grand_total }, lines: [{ item_id, quantity, unit_price, line_total }] }
// or throws BookingInputError.
export const priceBooking = (fields, lines, rates) => {
  if (!lines || lines.length === 0) return priceZeroLineBooking(fields)

  const seen = new Set()
  for (const line of lines) {
    if (seen.has(line.item_id)) {
      throw new BookingInputError(`${rates.get(line.item_id)?.name ?? 'An item'} is listed more than once. Combine it into one line.`)
    }
    seen.add(line.item_id)
  }

  let subtotal = 0
  const priced = lines.map((line) => {
    const rate = rates.get(line.item_id)
    const unit_price = line.unit_price ?? rate.unit_price
    const line_total = line.quantity * unit_price
    if (line_total > MAX_AMOUNT) {
      throw new BookingInputError(`The line for ${rate.name} cannot be more than ${MAX_AMOUNT_LABEL}. Check the quantity and price.`)
    }
    subtotal += line_total
    return { item_id: line.item_id, quantity: line.quantity, unit_price, line_total }
  })

  if (subtotal > MAX_AMOUNT) throw new BookingInputError(`Subtotal cannot be more than ${MAX_AMOUNT_LABEL}.`)

  const discount = fields.discount ?? 0
  const grand_total = Math.max(0, subtotal - discount)
  rejectIfAdvanceExceedsTotal(fields.advance, grand_total)
  return { totals: { total: grand_total, subtotal, discount, grand_total }, lines: priced }
}
