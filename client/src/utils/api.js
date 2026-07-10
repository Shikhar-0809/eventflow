const BASE = import.meta.env.VITE_API_URL

class ApiError extends Error {
  constructor(message, status, conflictBooking = null) {
    super(message)
    this.status = status
    this.conflictBooking = conflictBooking
  }
}

const request = async (path, options = {}) => {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new ApiError('Something went wrong. Please try again.', 0)
  }

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(
      body?.error || 'Something went wrong. Please try again.',
      res.status,
      body?.conflict ? body.booking : null,
    )
  }

  if (body == null || typeof body !== 'object') {
    throw new ApiError('Something went wrong. Please try again.', res.status)
  }

  return body
}

export const api = {
  login: (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  getBookings: () => request('/bookings'),
  getBooking: async (id) => {
    const body = await request(`/bookings/${id}`, { cache: 'no-store' })
    if (Array.isArray(body)) {
      throw new ApiError('Something went wrong. Please try again.', 200)
    }
    return body
  },
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  updateBooking: (id, data) => request(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  checkConflict: (date, excludeId) => {
    const params = new URLSearchParams({ date })
    if (excludeId != null) params.set('excludeId', String(excludeId))
    return request(`/bookings/check-conflict?${params}`)
  },
  logChange: (id, note) => request(`/bookings/${id}/log`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  logClientAction: (eventType, bookingId) =>
    request('/usage/log-client-action', {
      method: 'POST',
      body: JSON.stringify({ event_type: eventType, booking_id: bookingId }),
    }),
  getAnalyticsSummary: () => request('/analytics/summary'),
  getMonthlyAnalytics: () => request('/analytics/monthly'),
  getMyUsage: (weekOffset = 0) => request(`/usage/me?weekOffset=${weekOffset}`),
  getInventory: () => request('/inventory'),
  addInventoryItem: (data) => request('/inventory', { method: 'POST', body: JSON.stringify(data) }),
  updateInventoryQuantity: (id, data) =>
    request(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateInventoryPrice: (id, unit_price) =>
    request(`/inventory/${id}/price`, { method: 'PATCH', body: JSON.stringify({ unit_price }) }),
  deleteInventoryItem: (id) => request(`/inventory/${id}`, { method: 'DELETE' }),
  adjustInventoryDamage: (id, data) =>
    request(`/inventory/${id}/damage`, { method: 'POST', body: JSON.stringify(data) }),
  checkInventoryAvailability: (data) =>
    request('/inventory/check-availability', { method: 'POST', body: JSON.stringify(data) }),
}
