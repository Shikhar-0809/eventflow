/**
 * Merchant profile API (/api/profile): scoping, limiter, session rotation, change-email, delete-account, sign-in log.
 * Starts its OWN server on PORT 3057 with EMAIL_DEV_LOG=true and reads the codes and notices from its output, so no
 * inbox is needed and the dev server on :3001 is left alone. Seeds fictional merchants (@profile-verify.test) and
 * removes them at the end. Refuses to run against production (NODE_ENV or database host).
 *
 * Run from server/: node scripts/verify-profile-api.mjs
 */
import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { freshPassword } from './lib/testPassword.mjs'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production.')
  process.exit(1)
}

const { pool } = await import('../db/database.js')
const { signActionToken } = await import('../services/otp.js')
const { recordSignIn } = await import('../services/signInLog.js')

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3057
const BASE = `http://127.0.0.1:${PORT}/api`
const RUN = String(Date.now()).slice(-7)
const DOMAIN = 'profile-verify.test'
const PASSWORD = freshPassword()
const WRONG_PASSWORD = freshPassword()
const OTHER_PASSWORD = freshPassword()
const emailFor = (tag) => `${tag.toLowerCase()}-${RUN}@${DOMAIN}`

// The hand-written delete order from routes/profile.js. The guard test fails if the schema has any other
// table with a merchant_id column.
const LISTED_TABLES = [
  'booking_inventory', 'booking_expenses', 'change_log', 'bookings', 'inventory_damage_log', 'inventory_items',
  'merchant_settings', 'event_log', 'sign_in_log', 'email_otps',
]

const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}
const check = (name, condition, detail = '') => record(name, Boolean(condition), condition ? '' : detail)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---- server under test ----
let serverOutput = ''
const server = spawn(process.execPath, ['index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), EMAIL_DEV_LOG: 'true', NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', (d) => { serverOutput += d })
server.stderr.on('data', (d) => { serverOutput += d })

const waitForServer = async () => {
  for (let i = 0; i < 80; i += 1) {
    if (server.exitCode !== null) throw new Error(`Test server exited early.\n${serverOutput.slice(-500)}`)
    try {
      if ((await fetch(`${BASE}/health`)).status === 200) return
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error('Test server did not start.')
}

// ---- http helpers ----
let ipCounter = 0
const freshIp = () => { ipCounter += 1; return `10.${Number(RUN.slice(-3)) % 250}.${Math.floor(ipCounter / 250)}.${ipCounter % 250 + 1}` }

const api = async (method, path, { cookie, body, ip = freshIp(), ua = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36' } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, 'user-agent': ua, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  const setCookie = res.headers.getSetCookie?.() ?? []
  return { status: res.status, body: json, text, setCookie, cookie: setCookie.map((c) => c.split(';')[0]).join('; ') || null }
}

const login = (email, password = PASSWORD, ua) => api('POST', '/auth/login', { body: { email, password }, ua })
const cookieFlags = (setCookie) => (setCookie[0] ?? '').split(';').slice(1).map((a) => a.trim().toLowerCase()).filter((a) => !a.startsWith('expires')).sort().join('|')

// Dev emails in the server output: [{ to, subject, text }]
const devEmails = () => {
  const out = []
  const parts = serverOutput.split('[dev email] to=').slice(1)
  for (const part of parts) {
    const [head, ...rest] = part.split('\n')
    const [to, subject] = head.split(' subject=')
    out.push({ to: to.trim(), subject: (subject ?? '').trim(), text: rest.join('\n') })
  }
  return out
}
const emailsTo = (address) => devEmails().filter((e) => e.to === address)
const codeFrom = (email) => email?.text.match(/Your code: (\d{6})/)?.[1]
const waitForEmail = async (address, count = 1, ms = 6000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const found = emailsTo(address)
    if (found.length >= count) return found[count - 1]
    await sleep(150)
  }
  return null
}

// ---- seeding ----
const created = []
const seedMerchant = async (tag, { withData = true } = {}) => {
  const email = emailFor(tag)
  const hash = await bcrypt.hash(PASSWORD, 4)
  const { rows } = await pool.query(
    'INSERT INTO merchants (business_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [`Verify ${tag} Tents ${RUN}`, email, hash],
  )
  const id = rows[0].id
  created.push(id)
  if (withData) await seedData(id, tag)
  return { id, email, name: `Verify ${tag} Tents ${RUN}` }
}

const seedData = async (id, tag) => {
  const b = async (phone, date, status) => (await pool.query(
    `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, status)
     VALUES ($1, $2, $3, 'wedding', $4, 50, $5) RETURNING id`, [id, `Client ${tag}`, phone, date, status])).rows[0].id
  const future = '2099-01-15'
  const b1 = await b('9876500001', future, 'confirmed')
  await b('9876500001', '2020-01-15', 'completed')
  if (tag === 'A') {
    await b('9876500002', future, 'cancelled')
    await b('9876500003', future, 'pending')
  }
  const item = (await pool.query('INSERT INTO inventory_items (merchant_id, name, total_quantity) VALUES ($1, $2, 10) RETURNING id', [id, `Chairs ${tag}`])).rows[0].id
  if (tag === 'A') await pool.query('INSERT INTO inventory_items (merchant_id, name, total_quantity) VALUES ($1, $2, 5)', [id, `Tables ${tag}`])
  await pool.query('INSERT INTO booking_inventory (merchant_id, booking_id, item_id, quantity) VALUES ($1, $2, $3, 2)', [id, b1, item])
  await pool.query("INSERT INTO booking_expenses (merchant_id, booking_id, label, amount) VALUES ($1, $2, 'Transport', 100)", [id, b1])
  await pool.query("INSERT INTO change_log (merchant_id, booking_id, change_note) VALUES ($1, $2, 'note')", [id, b1])
  await pool.query("INSERT INTO inventory_damage_log (merchant_id, item_id, change, note) VALUES ($1, $2, -1, 'broken')", [id, item])
  await pool.query("INSERT INTO merchant_settings (merchant_id, key, value) VALUES ($1, 'monthly_revenue_target', '1000')", [id])
  await pool.query("INSERT INTO event_log (merchant_id, event_type) VALUES ($1, 'login')", [id])
  await pool.query("INSERT INTO sign_in_log (merchant_id, device_label) VALUES ($1, 'Chrome on Linux')", [id])
}

const rowCounts = async (id, email) => {
  const counts = {}
  for (const table of LISTED_TABLES) {
    const sql = table === 'email_otps'
      ? 'SELECT COUNT(*)::int n FROM email_otps WHERE email = $2 OR merchant_id = $1'
      : `SELECT COUNT(*)::int n FROM ${table} WHERE merchant_id = $1`
    counts[table] = (await pool.query(sql, table === 'email_otps' ? [id, email] : [id])).rows[0].n
  }
  counts.merchants = (await pool.query('SELECT COUNT(*)::int n FROM merchants WHERE id = $1', [id])).rows[0].n
  return counts
}

const FAIL_FN = `verify_profile_fail_${RUN}`
const dropFailTrigger = async () => {
  await pool.query(`DROP TRIGGER IF EXISTS ${FAIL_FN} ON merchants`).catch(() => {})
  await pool.query(`DROP FUNCTION IF EXISTS ${FAIL_FN}()`).catch(() => {})
}

const cleanup = async () => {
  await dropFailTrigger()
  for (const id of created) {
    for (const table of LISTED_TABLES.filter((t) => t !== 'email_otps')) {
      await pool.query(`DELETE FROM ${table} WHERE merchant_id = $1`, [id]).catch(() => {})
    }
    await pool.query('DELETE FROM email_otps WHERE merchant_id = $1', [id]).catch(() => {})
    await pool.query('DELETE FROM merchants WHERE id = $1', [id]).catch(() => {})
  }
  await pool.query('DELETE FROM merchants WHERE email LIKE $1', [`%${RUN}@${DOMAIN}`]).catch(() => {})
  await pool.query('DELETE FROM email_otps WHERE email LIKE $1', [`%@${DOMAIN}`]).catch(() => {})
}

// ---- the checks ----
const run = async () => {
  await waitForServer()
  const A = await seedMerchant('A')
  const B = await seedMerchant('B')
  const loginA = async (ua) => (await login(A.email, PASSWORD, ua)).cookie

  // Every route is behind requireAuth; an action token is not a session.
  const routes = [
    ['GET', '/profile'], ['PATCH', '/profile/business'], ['GET', '/profile/sign-ins'], ['POST', '/profile/password'],
    ['POST', '/profile/password/reset/send'], ['POST', '/profile/password/reset/verify'], ['POST', '/profile/logout-others'],
    ['POST', '/profile/email/send'], ['POST', '/profile/email/verify'], ['DELETE', '/profile'],
  ]
  let allRejected = true
  for (const [method, path] of routes) if ((await api(method, path, { body: {} })).status !== 401) allRejected = false
  check('every /api/profile route rejects a request with no session (401)', allRejected)
  const actionCookie = `${process.env.SESSION_COOKIE_NAME}=${signActionToken({ merchant_id: A.id, tv: 0 }, 'reset')}`
  check('an action token (aud) is not accepted as a session', (await api('GET', '/profile', { cookie: actionCookie })).status === 401)

  // 1. GET is scoped.
  const sA = await loginA()
  const sB = (await login(B.email)).cookie
  const pA = await api('GET', '/profile', { cookie: sA })
  const pB = await api('GET', '/profile', { cookie: sB })
  check('profile GET: merchant A counts are A\'s own', JSON.stringify(pA.body?.summary) === JSON.stringify({ bookings: 4, upcoming: 2, inventory_items: 2, clients: 3 }), JSON.stringify(pA.body?.summary))
  check('profile GET: merchant B counts are B\'s own', JSON.stringify(pB.body?.summary) === JSON.stringify({ bookings: 2, upcoming: 1, inventory_items: 1, clients: 1 }), JSON.stringify(pB.body?.summary))
  check('profile GET: email is masked, no ids or hashes in the response',
    pA.body?.email_masked && !pA.text.includes(A.email) && !/merchant_id|password_hash|"id"/.test(pA.text) && pA.body.member_since, pA.text)
  check('profile GET: business_name returned', pA.body?.business_name === A.name)

  // 2. PATCH /business
  check('PATCH business: name too short -> 400', (await api('PATCH', '/profile/business', { cookie: sA, body: { business_name: 'x' } })).status === 400)
  check('PATCH business: bad phone -> 400', (await api('PATCH', '/profile/business', { cookie: sA, body: { business_name: 'Valid Name', whatsapp_phone: '1234567890' } })).status === 400)
  const patched = await api('PATCH', '/profile/business', { cookie: sA, body: { business_name: '  Renamed Tents  ', whatsapp_phone: '9876543210' } })
  check('PATCH business: trims the name, saves the phone, returns the profile', patched.status === 200 && patched.body?.business_name === 'Renamed Tents' && patched.body?.whatsapp_phone === '9876543210')
  const kept = await api('PATCH', '/profile/business', { cookie: sA, body: { business_name: 'Renamed Tents' } })
  check('PATCH business: omitting whatsapp_phone keeps it', kept.body?.whatsapp_phone === '9876543210')
  const cleared = await api('PATCH', '/profile/business', { cookie: sA, body: { business_name: 'Renamed Tents', whatsapp_phone: '' } })
  check('PATCH business: empty phone clears it', cleared.status === 200 && cleared.body?.whatsapp_phone === null)
  check('PATCH business did not touch merchant B', (await api('GET', '/profile', { cookie: sB })).body?.business_name === B.name)
  await pool.query('UPDATE merchants SET business_name = $2 WHERE id = $1', [A.id, A.name])

  // 3. Limiter: wrong passwords count across every route that takes current_password (own merchant: C).
  const C = await seedMerchant('C', { withData: false })
  const sC = (await login(C.email)).cookie
  const wrong = []
  wrong.push((await api('POST', '/profile/password', { cookie: sC, body: { current_password: WRONG_PASSWORD, new_password: OTHER_PASSWORD } })).status)
  wrong.push((await api('POST', '/profile/password', { cookie: sC, body: { current_password: WRONG_PASSWORD, new_password: OTHER_PASSWORD } })).status)
  wrong.push((await api('POST', '/profile/email/send', { cookie: sC, body: { current_password: WRONG_PASSWORD, new_email: emailFor('zzz') } })).status)
  wrong.push((await api('POST', '/profile/email/send', { cookie: sC, body: { current_password: WRONG_PASSWORD, new_email: emailFor('zzz') } })).status)
  const wrongDelete = await api('DELETE', '/profile', { cookie: sC, body: { current_password: WRONG_PASSWORD, confirm_business_name: C.name } })
  wrong.push(wrongDelete.status)
  check('wrong current_password -> 401 "Incorrect password." on password, email/send and delete', wrong.every((s) => s === 401) && wrongDelete.body?.error === 'Incorrect password.', wrong.join(','))
  const sixth = await api('POST', '/profile/password', { cookie: sC, body: { current_password: WRONG_PASSWORD, new_password: OTHER_PASSWORD } })
  check('6th attempt -> 429', sixth.status === 429, String(sixth.status))
  const correctWhileLimited = await api('POST', '/profile/password', { cookie: sC, body: { current_password: PASSWORD, new_password: OTHER_PASSWORD } })
  check('limited merchant is blocked even with the right password (429)', correctWhileLimited.status === 429)
  const limitedEmail = await api('POST', '/profile/email/send', { cookie: sC, body: { current_password: PASSWORD, new_email: emailFor('zzz') } })
  check('limited merchant: /email/send is 429 too, with the limiter sentence', limitedEmail.status === 429 && limitedEmail.body?.error === 'Too many attempts. Please try again in 15 minutes.', `${limitedEmail.status} ${limitedEmail.text}`)
  check('limited merchant: /password answers 429 with the same sentence', sixth.body?.error === 'Too many attempts. Please try again in 15 minutes.', sixth.text)
  const limitedDelete = await api('DELETE', '/profile', { cookie: sC, body: { current_password: PASSWORD, confirm_business_name: C.name } })
  check('limited merchant: DELETE /profile is 429 and nothing is deleted', limitedDelete.status === 429 && (await pool.query('SELECT 1 FROM merchants WHERE id = $1', [C.id])).rowCount === 1)
  check('limiter is per merchant: merchant A is not limited', (await api('GET', '/profile', { cookie: sA })).status === 200 &&
    (await api('POST', '/profile/password', { cookie: sA, body: { current_password: WRONG_PASSWORD, new_password: OTHER_PASSWORD } })).status === 401)

  // 4. Password change (A: s1 = this device, s2 = another device).
  let s1 = await loginA()
  let s2 = await loginA()
  const same = await api('POST', '/profile/password', { cookie: s1, body: { current_password: PASSWORD, new_password: PASSWORD } })
  check('password: new equal to current -> 400', same.status === 400)
  const weak = await api('POST', '/profile/password', { cookie: s1, body: { current_password: PASSWORD, new_password: 'short' } })
  check('password: weak new password -> 400 (same rule as sign-up)', weak.status === 400)
  const NEW_PASSWORD = freshPassword()
  const changed = await api('POST', '/profile/password', { cookie: s1, body: { current_password: PASSWORD, new_password: NEW_PASSWORD } })
  check('password change -> 200 and re-issues this device\'s cookie', changed.status === 200 && changed.cookie)
  const loginFlags = cookieFlags((await login(B.email)).setCookie)
  check('re-issued cookie has the same flags as login', cookieFlags(changed.setCookie) === loginFlags, `${cookieFlags(changed.setCookie)} vs ${loginFlags}`)
  check('password change: other-device cookie -> 401', (await api('GET', '/profile', { cookie: s2 })).status === 401)
  check('password change: the old cookie of this device -> 401', (await api('GET', '/profile', { cookie: s1 })).status === 401)
  s1 = changed.cookie
  check('password change: this device\'s new cookie -> 200', (await api('GET', '/profile', { cookie: s1 })).status === 200)
  check('password change: login works with the new password', (await login(A.email, NEW_PASSWORD)).status === 200)
  check('password change: old password no longer logs in', (await login(A.email, PASSWORD)).status === 401)
  check('password_changed_at is set', (await api('GET', '/profile', { cookie: s1 })).body?.password_changed_at)
  const notice = await waitForEmail(A.email, 1)
  check('password change sends a notice to the stored address', notice?.subject.includes('password was changed'))
  check('the notice has no code, password or link', notice && !/\d{6}|https?:\/\//.test(notice.text) && !notice.text.includes(NEW_PASSWORD) && !notice.text.includes(PASSWORD), notice?.text)

  // 5. logout-others
  const o2 = (await login(A.email, NEW_PASSWORD)).cookie
  const out = await api('POST', '/profile/logout-others', { cookie: s1 })
  check('logout-others -> 200 and re-issues this device\'s cookie', out.status === 200 && out.cookie)
  check('logout-others: other device -> 401', (await api('GET', '/profile', { cookie: o2 })).status === 401)
  check('logout-others: old cookie of this device -> 401', (await api('GET', '/profile', { cookie: s1 })).status === 401)
  s1 = out.cookie
  check('logout-others: this device\'s new cookie -> 200', (await api('GET', '/profile', { cookie: s1 })).status === 200)

  // 6. In-session reset by email code: no email in the body, ever.
  const o3 = (await login(A.email, NEW_PASSWORD)).cookie
  const before = devEmails().length
  const resetSend = await api('POST', '/profile/password/reset/send', { cookie: s1, body: { email: emailFor('attacker') } })
  check('reset/send -> 200 with a masked address only', resetSend.status === 200 && resetSend.body?.email_masked && !resetSend.text.includes(A.email), resetSend.text)
  const resetMail = await waitForEmail(A.email, 2)
  check('reset/send: the code goes to the stored email', resetMail?.subject.includes('password reset code') && codeFrom(resetMail))
  check('reset/send: nothing goes to an address from the body', emailsTo(emailFor('attacker')).length === 0 && devEmails().length === before + 1)
  const code = codeFrom(resetMail)
  check('reset/verify: wrong code -> 400', (await api('POST', '/profile/password/reset/verify', { cookie: s1, body: { code: code === '000000' ? '111111' : '000000', new_password: freshPassword() } })).status === 400)
  check('reset/verify: weak password -> 400 and the code is not used up', (await api('POST', '/profile/password/reset/verify', { cookie: s1, body: { code, new_password: 'short' } })).status === 400)
  const RESET_PASSWORD = freshPassword()
  const resetDone = await api('POST', '/profile/password/reset/verify', { cookie: s1, body: { code, new_password: RESET_PASSWORD } })
  check('reset/verify: right code -> 200 and this device keeps a session', resetDone.status === 200 && resetDone.cookie)
  check('reset/verify: other-device cookie -> 401', (await api('GET', '/profile', { cookie: o3 })).status === 401)
  s1 = resetDone.cookie
  check('reset/verify: this device\'s new cookie -> 200', (await api('GET', '/profile', { cookie: s1 })).status === 200)
  check('reset/verify: login works with the new password', (await login(A.email, RESET_PASSWORD)).status === 200)
  check('reset/verify: the code cannot be used twice', (await api('POST', '/profile/password/reset/verify', { cookie: s1, body: { code, new_password: freshPassword() } })).status === 400)
  const bCode = await api('POST', '/profile/password/reset/verify', { cookie: sB, body: { code, new_password: freshPassword() } })
  check('reset/verify: another merchant cannot use A\'s code', bCode.status === 400)

  // 7. Change email.
  const o4 = (await login(A.email, RESET_PASSWORD)).cookie
  const NEW_EMAIL = emailFor('a-new')
  const emails0 = devEmails().length
  const takenRes = await api('POST', '/profile/email/send', { cookie: s1, body: { current_password: RESET_PASSWORD, new_email: B.email.toUpperCase() } })
  await sleep(1200)
  check('email/send: a taken address gets the generic 200', takenRes.status === 200 && takenRes.body?.message === 'If that address can receive mail, a code is on its way.', takenRes.text)
  check('email/send: a taken address sends NO email at all', devEmails().length === emails0 && emailsTo(B.email).length === 0)
  const selfRes = await api('POST', '/profile/email/send', { cookie: s1, body: { current_password: RESET_PASSWORD, new_email: A.email } })
  check('email/send: the current address -> 400', selfRes.status === 400)
  const freeRes = await api('POST', '/profile/email/send', { cookie: s1, body: { current_password: RESET_PASSWORD, new_email: `  ${NEW_EMAIL.toUpperCase()} ` } })
  check('email/send: a free address gets the same response shape as a taken one',
    freeRes.status === 200 && JSON.stringify(Object.keys(freeRes.body).sort()) === JSON.stringify(Object.keys(takenRes.body).sort()) && freeRes.body.message === takenRes.body.message)
  const changeMail = await waitForEmail(NEW_EMAIL, 1)
  check('email/send: the code is sent to the (normalised) new address', changeMail && codeFrom(changeMail))
  const changeCode = codeFrom(changeMail)
  check('email/verify: wrong code -> 400', (await api('POST', '/profile/email/verify', { cookie: s1, body: { code: changeCode === '000000' ? '111111' : '000000' } })).status === 400)
  check('email/verify: another merchant cannot use the code', (await api('POST', '/profile/email/verify', { cookie: sB, body: { code: changeCode } })).status === 400)
  const verified = await api('POST', '/profile/email/verify', { cookie: s1, body: { code: changeCode } })
  check('email/verify -> 200 with a masked address', verified.status === 200 && verified.body?.email_masked && !verified.text.includes(NEW_EMAIL), verified.text)
  check('email/verify: the email was swapped', (await pool.query('SELECT email FROM merchants WHERE id = $1', [A.id])).rows[0].email === NEW_EMAIL)
  check('email/verify: other-device cookie -> 401', (await api('GET', '/profile', { cookie: o4 })).status === 401)
  check('email/verify: the old cookie of this device -> 401', (await api('GET', '/profile', { cookie: s1 })).status === 401)
  s1 = verified.cookie
  check('email/verify: this device\'s new cookie -> 200', (await api('GET', '/profile', { cookie: s1 })).status === 200)
  check('email/verify: login works with the new email, not the old one', (await login(NEW_EMAIL, RESET_PASSWORD)).status === 200 && (await login(A.email, RESET_PASSWORD)).status === 401)
  const oldNotice = (await waitForEmail(A.email, 4))
  check('email/verify: a notice goes to the OLD address with the new one masked',
    oldNotice?.subject.includes('email was changed') && !oldNotice.text.includes(NEW_EMAIL) && /\*\*\*\*/.test(oldNotice.text) &&
    oldNotice.text.includes("If this wasn't you, reset your password and contact support."), oldNotice?.text)
  check('email/verify: the code cannot be reused', (await api('POST', '/profile/email/verify', { cookie: s1, body: { code: changeCode } })).status === 400)
  A.email = NEW_EMAIL

  // Unique-constraint race: the address is registered after the code was sent but before it is used.
  const RACE_EMAIL = emailFor('race')
  await api('POST', '/profile/email/send', { cookie: s1, body: { current_password: RESET_PASSWORD, new_email: RACE_EMAIL } })
  const raceMail = await waitForEmail(RACE_EMAIL, 1)
  await pool.query('INSERT INTO merchants (business_name, email, password_hash) VALUES ($1, $2, $3)', [`Verify race ${RUN}`, RACE_EMAIL, 'x'])
  const race = await api('POST', '/profile/email/verify', { cookie: s1, body: { code: codeFrom(raceMail) } })
  check('email/verify: address taken in the meantime -> 409 with a generic message', race.status === 409 && !race.text.includes(RACE_EMAIL), race.text)
  check('email/verify: a 409 leaves the email and the session unchanged',
    (await pool.query('SELECT email FROM merchants WHERE id = $1', [A.id])).rows[0].email === NEW_EMAIL && (await api('GET', '/profile', { cookie: s1 })).status === 200)

  // Daily cap of 3 codes per new address (rows planted as already sent today).
  const CAP_EMAIL = emailFor('cap')
  for (let i = 0; i < 3; i += 1) {
    await pool.query("INSERT INTO email_otps (email, purpose, merchant_id, code_hash, expires_at, consumed_at, last_sent_at) VALUES ($1, 'change_email', $2, 'x', NOW(), NOW(), NOW() - INTERVAL '1 hour')", [CAP_EMAIL, A.id])
  }
  const capRes = await api('POST', '/profile/email/send', { cookie: s1, body: { current_password: RESET_PASSWORD, new_email: CAP_EMAIL } })
  await sleep(1200)
  check('email/send: the daily cap (3) stops the send, with the same generic 200', capRes.status === 200 && emailsTo(CAP_EMAIL).length === 0)

  // 8. Sign-in log: coarse label only, newest 10, never an IP or the full UA.
  const D = await seedMerchant('D', { withData: false })
  const UAS = [
    ['Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
  ]
  for (const [ua] of UAS) await login(D.email, PASSWORD, ua)
  for (let i = 0; i < 10; i += 1) await login(D.email, PASSWORD)
  await sleep(1000)
  const sD = (await login(D.email)).cookie
  await sleep(500)
  const { rows: dRows } = await pool.query('SELECT COUNT(*)::int n FROM sign_in_log WHERE merchant_id = $1', [D.id])
  check('sign_in_log holds at most 10 rows per merchant after 13 logins', dRows[0].n === 10, String(dRows[0].n))
  const signIns = await api('GET', '/profile/sign-ins', { cookie: sD })
  check('GET sign-ins: 10 rows with only device_label and created_at',
    signIns.status === 200 && signIns.body.length === 10 && signIns.body.every((r) => JSON.stringify(Object.keys(r).sort()) === '["created_at","device_label"]'), signIns.text.slice(0, 200))
  const times = signIns.body.map((r) => new Date(r.created_at).getTime())
  check('GET sign-ins: newest first', times.every((t, i) => i === 0 || times[i - 1] >= t))
  const E = await seedMerchant('E', { withData: false })
  for (const [ua] of UAS) await login(E.email, PASSWORD, ua)
  await sleep(800)
  const sE = (await login(E.email, PASSWORD, 'curl/8.0')).cookie
  await sleep(500)
  const labels = (await api('GET', '/profile/sign-ins', { cookie: sE })).body.map((r) => r.device_label)
  check('device labels are coarse ("Chrome on Android", "Safari on iPhone")', UAS.every(([, label]) => labels.includes(label)), labels.join(' / '))
  const { rows: cols } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'sign_in_log' ORDER BY 1")
  check('sign_in_log has no ip or user-agent column', cols.map((c) => c.column_name).join(',') === 'created_at,device_label,id,merchant_id', cols.map((c) => c.column_name).join(','))
  const { rows: stored } = await pool.query("SELECT 1 FROM sign_in_log WHERE merchant_id = $1 AND (device_label LIKE '%Mozilla%' OR device_label LIKE '%10.%')", [E.id])
  check('no stored label holds a user agent or an address', stored.length === 0)

  // A failing sign-in log write never throws or breaks a login, and logs neither the UA nor an email.
  const errors = []
  const origError = console.error
  console.error = (...args) => errors.push(args.join(' '))
  let threw = false
  try { recordSignIn(2147483000, 'SECRET-UA-STRING') } catch { threw = true }
  await sleep(1500)
  console.error = origError
  check('recordSignIn: a failure does not throw and logs no user agent', !threw && errors.length === 1 && !errors[0].includes('SECRET-UA-STRING') && !errors[0].includes('@'), errors.join('|'))

  // 9. Usage events: names only, no emails in metadata.
  const { rows: events } = await pool.query("SELECT event_type, metadata FROM event_log WHERE merchant_id = $1 AND event_type IN ('password_changed','email_changed','sessions_revoked') ORDER BY id", [A.id])
  const types = events.map((e) => e.event_type)
  check('event_log: password_changed, sessions_revoked and email_changed recorded', ['password_changed', 'sessions_revoked', 'email_changed'].every((t) => types.includes(t)), types.join(','))
  check('event_log: metadata is empty or merchant_id only, never an email', events.every((e) => e.metadata === null || e.metadata === '{}' || /^\{"merchant_id":\d+\}$/.test(e.metadata)))

  // 9b. A failure after the token bump but before COMMIT must send no cookie and change nothing. The failure is real,
  // not injected into the server: a DEFERRED constraint trigger (this merchant only, only when token_version changes)
  // raises when COMMIT runs, i.e. after the bump and the password/email update succeeded.
  const H = await seedMerchant('H', { withData: false })
  await pool.query(`CREATE FUNCTION ${FAIL_FN}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'verify: forced commit failure'; END $$`)
  await pool.query(`CREATE CONSTRAINT TRIGGER ${FAIL_FN} AFTER UPDATE ON merchants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.id = ${H.id} AND NEW.token_version IS DISTINCT FROM OLD.token_version) EXECUTE FUNCTION ${FAIL_FN}()`)
  const stateOf = async () => (await pool.query('SELECT token_version, password_hash, email FROM merchants WHERE id = $1', [H.id])).rows[0]
  const sH = (await login(H.email)).cookie
  const h0 = await stateOf()
  const failedPw = await api('POST', '/profile/password', { cookie: sH, body: { current_password: PASSWORD, new_password: freshPassword() } })
  const h1 = await stateOf()
  check('commit failure on /password: 500 and NO Set-Cookie header', failedPw.status === 500 && failedPw.setCookie.length === 0, `${failedPw.status} ${failedPw.setCookie.length}`)
  check('commit failure on /password: token_version and password unchanged in the DB', h1.token_version === h0.token_version && h1.password_hash === h0.password_hash)
  check('commit failure on /password: the old session and old password still work', (await api('GET', '/profile', { cookie: sH })).status === 200 && (await login(H.email)).status === 200)

  const H_NEW = emailFor('h-new')
  await api('POST', '/profile/email/send', { cookie: sH, body: { current_password: PASSWORD, new_email: H_NEW } })
  const hMail = await waitForEmail(H_NEW, 1)
  const failedEmail = await api('POST', '/profile/email/verify', { cookie: sH, body: { code: codeFrom(hMail) } })
  const h2 = await stateOf()
  check('commit failure on /email/verify: 500 and NO Set-Cookie header', failedEmail.status === 500 && failedEmail.setCookie.length === 0, `${failedEmail.status} ${failedEmail.setCookie.length}`)
  check('commit failure on /email/verify: token_version and email unchanged in the DB', h2.token_version === h0.token_version && h2.email === H.email.toLowerCase())
  await dropFailTrigger()
  const okAfter = await api('POST', '/profile/logout-others', { cookie: sH })
  check('after the trigger is removed the same session rotates normally (cookie set, version bumped by exactly 1)',
    okAfter.status === 200 && okAfter.setCookie.length === 1 && (await stateOf()).token_version === h0.token_version + 1)

  // 10. Delete account: with two merchants seeded, only the target goes.
  const F = await seedMerchant('F')
  const G = await seedMerchant('G')
  await pool.query("INSERT INTO email_otps (email, purpose, code_hash, expires_at, last_sent_at) VALUES ($1, 'reset', 'x', NOW() + INTERVAL '5 minutes', NOW())", [F.email])
  await pool.query("INSERT INTO email_otps (email, purpose, code_hash, expires_at, last_sent_at) VALUES ($1, 'reset', 'x', NOW() + INTERVAL '5 minutes', NOW())", [G.email])
  const sF = (await login(F.email)).cookie
  await sleep(500)
  const beforeF = await rowCounts(F.id, F.email)
  check('delete: fixture has rows in every listed table for the target', LISTED_TABLES.every((t) => beforeF[t] > 0), JSON.stringify(beforeF))
  const sG = (await login(G.email)).cookie
  await sleep(500)
  const beforeG = await rowCounts(G.id, G.email)
  const badName = await api('DELETE', '/profile', { cookie: sF, body: { current_password: PASSWORD, confirm_business_name: 'wrong name' } })
  check('delete: a business name that does not match -> 400, nothing deleted', badName.status === 400 && (await rowCounts(F.id, F.email)).merchants === 1)
  const exactCase = await api('DELETE', '/profile', { cookie: sF, body: { current_password: PASSWORD, confirm_business_name: F.name.toUpperCase() } })
  check('delete: the name match is exact (case-sensitive)', exactCase.status === 400)
  const delOk = await api('DELETE', '/profile', { cookie: sF, body: { current_password: PASSWORD, confirm_business_name: `  ${F.name}  ` } })
  check('delete: right password and name -> 200 and the session cookie is cleared', delOk.status === 200 && delOk.setCookie.some((c) => c.startsWith(`${process.env.SESSION_COOKIE_NAME}=;`)), delOk.text)
  const afterF = await rowCounts(F.id, F.email)
  check('delete: zero rows left for the deleted merchant in every listed table and in merchants',
    Object.values(afterF).every((n) => n === 0), JSON.stringify(afterF))
  const afterG = await rowCounts(G.id, G.email)
  check('delete: the other merchant is fully intact (every table, same counts)', JSON.stringify(afterG) === JSON.stringify(beforeG), `${JSON.stringify(beforeG)} vs ${JSON.stringify(afterG)}`)
  check('delete: the other merchant\'s session still works', (await api('GET', '/profile', { cookie: sG })).status === 200)
  check('delete: the old session is dead and the account cannot log in', (await api('GET', '/profile', { cookie: sF })).status === 401 && (await login(F.email)).status === 401)
  const delMail = await waitForEmail(F.email, 1)
  check('delete: a notice goes to the captured address', delMail?.subject.includes('account was deleted'))
  const { rows: delEvents } = await pool.query("SELECT 1 FROM event_log WHERE event_type = 'account_deleted'")
  check('delete: no account_deleted row is written to event_log', delEvents.length === 0)

  // Guard: the explicit delete list must cover every table with a merchant_id column.
  const { rows: scoped } = await pool.query("SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'merchant_id'")
  const unlisted = scoped.map((r) => r.table_name).filter((t) => !LISTED_TABLES.includes(t))
  check('schema guard: no merchant-scoped table is missing from the delete list', unlisted.length === 0, `unlisted: ${unlisted.join(',')}`)

  // 11. Logs: nothing sensitive outside the dev-only email dump.
  const logLines = serverOutput.split('\n').filter((l) => /security notice|OTP|sign-in log|trackUsage/.test(l) && !l.startsWith('[dev email]'))
  check('server log lines about notices/OTPs hold no email, code or password',
    logLines.every((l) => !/@|\d{6}/.test(l)) && ![PASSWORD, NEW_PASSWORD, RESET_PASSWORD].some((p) => serverOutput.includes(p)), logLines.join('|'))
}

try {
  await run()
} catch (err) {
  record('script ran to completion', false, err.message)
} finally {
  await cleanup().catch(() => {})
  server.kill()
}

const failed = results.filter((r) => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) {
  console.log(`Failed: ${failed.map((r) => r.name).join('; ')}`)
  process.exit(1)
}
process.exit(0)
