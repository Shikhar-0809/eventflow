export const MAX_INT4 = 2147483647

// An id that is not a positive 32-bit integer cannot exist, so callers treat it exactly like a missing row
// (the same 404 as an unknown id) instead of letting it reach Postgres and fail as a 500.
export const parseId = (value) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 && n <= MAX_INT4 ? n : null
}
