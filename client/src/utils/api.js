const BASE = import.meta.env.VITE_API_URL

// A 429 that is not ours: our rate limiters always answer with JSON that has an `error` string, so a 429 without one
// came from the host. In practice that is Render's free tier answering for a hibernated API (text/plain "Too Many
// Requests", header x-render-routing: hibernate-rate-limited), i.e. the server is waking up, not the user doing
// anything wrong (BUGS #104). The body check works on its own; the header is a bonus when the browser can read it.
const WAKING_MESSAGE = 'The server is waking up. Please try again in a minute.'
const WAKING_RETRY_DELAY_MS = 3000
// Requests that never reached our app (a host 429) are safe to send again, but only these are retried automatically:
// reads, and the sign-in / password-reset code requests. Anything that writes data (bookings, expenses, inventory,
// profile changes, the reset itself) is never retried here.
const REPEATABLE_POSTS = new Set(['/auth/login', '/auth/forgot/send-otp', '/auth/forgot/resend-otp'])

// The header counts only when it says "hibernate" (Render may set x-render-routing on other responses too, and a real
// limiter message must never be hidden); a body without our `error` string is enough by itself.
const isHostRateLimit = (res, body) =>
  res.status === 429 &&
  ((res.headers.get('x-render-routing') ?? '').toLowerCase().startsWith('hibernate') ||
    typeof body?.error !== 'string' ||
    body.error === '')

const canRepeat = (path, options) => {
  const method = (options.method ?? 'GET').toUpperCase()
  return method === 'GET' || (method === 'POST' && REPEATABLE_POSTS.has(path))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class ApiError extends Error {
  constructor(message, status, conflictBooking = null, retryAfter = null) {
    super(message)
    this.status = status
    this.conflictBooking = conflictBooking
    // Seconds until another code may be requested (only on a resend that came too soon).
    this.retryAfter = retryAfter
  }
}

const request = async (path, options = {}, alreadyRetried = false) => {
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

  if (isHostRateLimit(res, body)) {
    // One quiet retry for requests that are safe to repeat, then the waking-up message.
    if (!alreadyRetried && canRepeat(path, options)) {
      await sleep(WAKING_RETRY_DELAY_MS)
      return request(path, options, true)
    }
    throw new ApiError(WAKING_MESSAGE, 429)
  }

  if (!res.ok) {
    const fallback = 'Something went wrong. Please try again.'
    throw new ApiError(
      (typeof body?.error === 'string' && body.error) || fallback,
      res.status,
      body?.conflict ? body.booking : null,
      Number.isFinite(body?.retryAfter) ? body.retryAfter : null,
    )
  }

  if (body == null || typeof body !== 'object') {
    throw new ApiError('Something went wrong. Please try again.', res.status)
  }

  return body
}

// A 401 on a profile call normally means the session is gone. Three routes also answer 401 for a wrong current
// password, so for those the session is checked separately (getMe) before the error is called a session expiry.
// call sites read err.sessionExpired; nothing here shows or interprets the message.
const profileRequest = async (path, options = {}, { checksPassword = false } = {}) => {
  try {
    return await request(`/profile${path}`, options)
  } catch (err) {
    if (err.status === 401) {
      let expired = !checksPassword
      if (checksPassword) {
        try {
          await request('/auth/me')
        } catch (meErr) {
          expired = meErr.status === 401
        }
      }
      err.sessionExpired = expired
    }
    throw err
  }
}

const jsonBody = (data) => JSON.stringify(data)

export const api = {
  getProfile: () => profileRequest('', { cache: 'no-store' }),
  updateProfileBusiness: (data) => profileRequest('/business', { method: 'PATCH', body: jsonBody(data) }),
  getSignIns: () => profileRequest('/sign-ins', { cache: 'no-store' }),
  changePassword: (currentPassword, newPassword) =>
    profileRequest(
      '/password',
      { method: 'POST', body: jsonBody({ current_password: currentPassword, new_password: newPassword }) },
      { checksPassword: true },
    ),
  profileResetSend: () => profileRequest('/password/reset/send', { method: 'POST' }),
  profileResetVerify: (code, newPassword) =>
    profileRequest('/password/reset/verify', { method: 'POST', body: jsonBody({ code, new_password: newPassword }) }),
  logoutOtherDevices: () => profileRequest('/logout-others', { method: 'POST' }),
  profileEmailSend: (currentPassword, newEmail) =>
    profileRequest(
      '/email/send',
      { method: 'POST', body: jsonBody({ current_password: currentPassword, new_email: newEmail }) },
      { checksPassword: true },
    ),
  profileEmailVerify: (code) => profileRequest('/email/verify', { method: 'POST', body: jsonBody({ code }) }),
  deleteAccount: (currentPassword, confirmBusinessName) =>
    profileRequest(
      '',
      { method: 'DELETE', body: jsonBody({ current_password: currentPassword, confirm_business_name: confirmBusinessName }) },
      { checksPassword: true },
    ),
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (data) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  signupSendOtp: (email) => request('/auth/signup/send-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  signupResendOtp: (email) => request('/auth/signup/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  signupVerifyOtp: (email, code) => request('/auth/signup/verify-otp', { method: 'POST', body: JSON.stringify({ email, code }) }),
  forgotSendOtp: (email) => request('/auth/forgot/send-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotResendOtp: (email) => request('/auth/forgot/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotVerifyOtp: (email, code) => request('/auth/forgot/verify-otp', { method: 'POST', body: JSON.stringify({ email, code }) }),
  forgotReset: (resetToken, newPassword) =>
    request('/auth/forgot/reset', { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  getBookings: () => request('/bookings'),
  getPendingBalances: () => request('/bookings/pending-balances'),
  getBooking: async (id) => {
    const body = await request(`/bookings/${id}`, { cache: 'no-store' })
    if (Array.isArray(body)) {
      throw new ApiError('Something went wrong. Please try again.', 200)
    }
    return body
  },
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  updateBooking: (id, data) => request(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBooking: (id) => request(`/bookings/${id}`, { method: 'DELETE' }),
  updateBookingStatus: (id, status) =>
    request(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  checkConflict: (date, excludeId) => {
    const params = new URLSearchParams({ date })
    if (excludeId != null) params.set('excludeId', String(excludeId))
    return request(`/bookings/check-conflict?${params}`)
  },
  logChange: (id, note) => request(`/bookings/${id}/log`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  addExpense: (bookingId, data) =>
    request(`/bookings/${bookingId}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  deleteExpense: (bookingId, expenseId) =>
    request(`/bookings/${bookingId}/expenses/${expenseId}`, { method: 'DELETE' }),
  logClientAction: (eventType, bookingId) =>
    request('/usage/log-client-action', {
      method: 'POST',
      body: JSON.stringify({ event_type: eventType, booking_id: bookingId }),
    }),
  getAnalyticsSummary: () => request('/analytics/summary'),
  getMonthlyAnalytics: () => request('/analytics/monthly'),
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  getReport: (from, to) => {
    const params = new URLSearchParams({ from, to })
    return request(`/reports/range?${params}`)
  },
  getRecords: (params = {}) => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== '') searchParams.set(key, String(value))
    })
    const query = searchParams.toString()
    return request(query ? `/records?${query}` : '/records')
  },
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
