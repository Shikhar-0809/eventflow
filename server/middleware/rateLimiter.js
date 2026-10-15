import crypto from 'node:crypto'
import rateLimit from 'express-rate-limit'

// IPv6 users can rotate through a whole /64 at will, so an IPv6 address is reduced to its /64 prefix before it
// is used in a key (express-rate-limit 7.5 has no helper for this). IPv4 and IPv4-mapped addresses stay as is.
const clientIpKey = (ip) => {
  if (typeof ip !== 'string' || ip === '') return 'unknown'
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return mapped[1]
  if (!ip.includes(':')) return ip
  const address = ip.split('%')[0]
  const [head, tail] = address.includes('::') ? address.split('::') : [address, null]
  const groups = (part) => (part === '' ? [] : part.split(':'))
  let all = groups(head)
  if (tail !== null) {
    const tailGroups = groups(tail)
    all = [...all, ...Array(Math.max(0, 8 - all.length - tailGroups.length)).fill('0'), ...tailGroups]
  }
  return `${all.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}

const normalisedEmail = (req) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '')
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')

// Bucket per account AND source: if req.ip is wrong and every visitor shares one address (BUGS #079), one
// account's failed attempts still cannot lock out other accounts. The key is hashed so neither the email nor
// the address sits in the store or in any log. It runs before validate, so req.body.email is the raw value.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  // Only failed attempts (status 400 and above) count. A merchant who logs in successfully, however often,
  // must never be locked out; the limit exists to stop password guessing.
  skipSuccessfulRequests: true,
  keyGenerator: (req) => digest(`${normalisedEmail(req)}|${clientIpKey(req.ip)}`),
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Backstop against spraying many different emails from one source: failures per source, whatever the email.
// Much looser than the per-account limit so a shared address does not lock out honest merchants.
export const loginIpBackstopLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => digest(clientIpKey(req.ip)),
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// OTP emails cost money and can be used to spam an inbox: 5 per hour per purpose, email and source, plus a looser
// per-source backstop shared by every purpose for spraying many addresses. Same keying approach as the login limiters (BUGS #078/#079).
// The purpose is fixed per route when the limiter is built (never read from the body), so each purpose has its
// own bucket: spamming signup/send-otp for an existing email cannot use up that email's password-reset quota.
const makeOtpSendLimiter = (purpose) => rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => digest(`${purpose}|${normalisedEmail(req)}|${clientIpKey(req.ip)}`),
  message: { error: 'Too many code requests. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const otpSendLimiters = {
  signup: makeOtpSendLimiter('signup'),
  forgot: makeOtpSendLimiter('forgot'),
  change_email: makeOtpSendLimiter('change_email'),
}

export const otpSendIpBackstopLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => digest(clientIpKey(req.ip)),
  message: { error: 'Too many code requests. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => digest(clientIpKey(req.ip)),
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => digest(clientIpKey(req.ip)),
  message: { error: 'Too many sign-up attempts. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const bookingCreateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})
