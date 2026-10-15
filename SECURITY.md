# SECURITY.md — EventFlow

## Why this file exists

Every other doc in this project points here for "the exact config" — the cookie flags, the rate limiter thresholds, the `requireAuth` pattern, the audit checklist. This is that file. Treat it the same way as `CODING_STANDARDS.md`: if a Cursor output doesn't match what's defined here, reject it and re-prompt rather than patching around it.

This file was written after the fact — `PROMPTS.md`, `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `BUGS.md`, and `DATA_PRIVACY.md` were all already referencing it before it existed. Everything below was reverse-engineered to match those references exactly, so nothing here should contradict a prompt you've already run. One exception is called out explicitly below (`/api/usage/admin`'s dev-only check) — that was genuinely undefined anywhere else, so a reasonable default is proposed, not extracted.

---

## Threat model for v1 — be explicit about what this defends against

EventFlow is a **multi-merchant product** with a deliberately simple auth model: per-merchant email + password accounts (self-service sign-up), a signed session cookie that carries the merchant id, and strict per-merchant data isolation (see "Tenant isolation"). This section exists so nobody mistakes a simple login for an insecure one.

**In scope — this file defends against:**
- An unauthenticated stranger on the internet reaching `/api/bookings` and reading real client names/phone numbers
- Brute-forcing the single login password
- A secret (JWT signing key, password hash) leaking into git history or a log file
- A malformed or malicious request reaching the database unvalidated
- A server error leaking internal details (stack traces, file paths, query text) to the client in production
- SQL injection via booking form fields or inventory fields
- **One merchant reaching another merchant's data** (reading, changing or deleting their bookings, inventory, expenses, change log, settings or usage), whether by guessing ids, by sending a `merchant_id`, or through a list or aggregate endpoint. This is a Critical bug (BUGS.md severity table). See "Tenant isolation" below.

**Explicitly out of scope for v1** — see the "Not in v1's threat model" section at the bottom for the full list and why.

---

## Auth model overview

- **One account per merchant, identified by email.** `merchants.email` (lowercased, unique) and `merchants.password_hash` (bcrypt, cost 10); the login identifies the merchant, not a person. Merchants create their own account at `POST /api/auth/signup`. There is no password reset or email verification yet.
- Password is never stored in plaintext, and is capped at 72 bytes (bcrypt ignores the rest). `MERCHANT_PASSWORD_HASH` no longer exists. A merchant row with no `password_hash` cannot log in.
- Login answers an unknown email and a wrong password identically (`401 "Incorrect email or password."`) and runs `bcrypt.compare` against a dummy hash for an unknown email so timing does not reveal registered emails. Sign-up does reveal an existing email (409): accepted, BUGS #073.
- On successful login, the server issues a JWT in an **httpOnly cookie** — not returned in the response body, not stored in `localStorage`, not accessible to client-side JS at all. This is the single biggest XSS mitigation in the whole app: even if malicious JS somehow ran in the merchant's browser, it cannot read the session token.
- The JWT carries only `{ merchant_id }` plus issued-at/expiry: no personal data, nothing worth protecting if decoded. The cookie's `httpOnly` flag is what actually matters, not the token's contents. `merchant_id` is trusted only because the token is signed with `JWT_SECRET`; it is never taken from the request.
- Every **business** route requires a valid session. No "just for testing" bypasses left in committed code. The only intentional unauthenticated routes are `POST /api/auth/signup`, `POST /api/auth/login` and `GET /api/health` (liveness only — returns `{ status: 'ok' }`, no data). This includes inventory, settings, reports, records, and usage routes — see the Route auth matrix below, and don't assume a route is covered just because it "feels internal."

---

## Generating secrets (one-time local setup)

Do this once per environment (local, and again separately for each deploy target — never reuse a dev secret in production).

**`JWT_SECRET`** — long random string:
```bash
openssl rand -base64 32
```
Paste the output directly into `JWT_SECRET` in `.env`. Never reuse this value between dev and prod.

**Merchant passwords** are not an env var any more (`MERCHANT_PASSWORD_HASH` was removed). Each merchant sets their own at sign-up and only the bcrypt hash is stored in `merchants.password_hash`. Never paste a real merchant password into a file, a commit or a chat.

**Demo logins (dev only).** `db/seedMerchants.js` publishes two fictional demo merchants and one demo password, and `db/seed.js` gives them credentials on dev databases only (`seed()` is a no-op in production, and only fills merchants that have no credentials yet). These are deliberately public, so never point a dev database at production data and never reuse the demo password anywhere real.

**`ADMIN_ACCESS_KEY`** (see the `/api/usage/admin` section below) — same pattern:
```bash
openssl rand -base64 24
```

---

## Session cookie configuration — exact

```js
const isProd = process.env.NODE_ENV === 'production'

res.cookie(process.env.SESSION_COOKIE_NAME, token, {
  httpOnly: true,
  secure: isProd, // NEVER hardcode true — breaks login on local http://localhost
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, in milliseconds
})
```

**Same-origin via Vercel proxy (production):** The browser never talks to the Render API directly. the root `vercel.json` rewrites `/api/*` to the Render backend, and `VITE_API_URL=/api` (in `client/.env.production`) makes all frontend `fetch` calls same-origin on the Vercel domain. The session cookie is therefore first-party — no cross-site cookie rules apply. This is more reliable than `SameSite=None` on mobile browsers (iOS Safari ITP, privacy-hardened Android browsers) that block third-party/cross-site cookies even when `SameSite=None; Secure` is set correctly; see `BUGS.md` #024.

**Local development:** Vite on `localhost:5173` and Express on `localhost:3001` differ only by port, which browsers treat as same-site, so `sameSite: 'lax'` works there too with `VITE_API_URL=http://localhost:3001/api`.

Why each flag matters:
- `httpOnly: true` — client-side JS cannot read this cookie, even via `document.cookie`. Core XSS mitigation.
- `secure: isProd` — cookie only sent over HTTPS in production. **Must be conditional, not always `true`** — see `BUGS.md`'s "Auth cookie not persisting" gotcha: hardcoding `true` silently blocks the cookie from being set at all on local `http://localhost`, and the failure mode looks like "login works but you're immediately logged out," which is confusing to debug.
- `sameSite: 'lax'` — correct in both environments because API requests are same-origin from the browser's perspective (Vercel proxy in prod, localhost same-site in dev). `'lax'` is spec-reliable across desktop and mobile; do not use `'none'`.
- 7-day expiry — long enough that a single merchant isn't re-logging-in constantly, short enough that a stale session doesn't live forever if the device is lost.

Cookie name comes from `process.env.SESSION_COOKIE_NAME` (set to `eventflow_session` per `ARCHITECTURE.md`'s `.env.example`) — never hardcode the literal string in more than one place.

---

## `requireAuth` middleware — exact pattern

```js
// middleware/requireAuth.js (the shape that matters; see the file for the full text)
import jwt from 'jsonwebtoken'
import { pool } from '../db/database.js'

export const requireAuth = async (req, res, next) => {
  const token = req.cookies[process.env.SESSION_COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'You must be logged in to do that.' })

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' })
  }

  // Tokens issued before merchants existed carry no merchant_id: force a fresh login.
  const merchantId = payload?.merchant_id
  if (!Number.isInteger(merchantId) || merchantId <= 0) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' })
  }

  try {
    const { rows } = await pool.query('SELECT 1 FROM merchants WHERE id = $1', [merchantId])
    if (rows.length === 0) return res.status(401).json({ error: 'Your session has expired. Please log in again.' })
  } catch (err) {
    return next(err)
  }

  req.merchantId = merchantId // only ever from the signed token
  next()
}
```

Rules:
- Always `401` for authentication failures, never `403`. A request for another merchant's data is not an authorization error: it returns the same 404 as a missing id (see "Tenant isolation").
- The two failure messages above ("must be logged in" vs "session has expired"; an invalid signature, a missing `merchant_id` and an unknown merchant all use the second one) are the only two cases — don't add more granular messages (e.g. "invalid token signature") that could hint at *why* verification failed. There's nothing to gain from that detail and no reason to expose JWT internals to a client.
- Never log the token value itself, even in dev-only debug logging.

---

## Sign-up and login routes — exact pattern

```js
// routes/auth.js (the shape that matters; see the file for the full text)
const BCRYPT_COST = 10
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST) // compared against when the email is unknown

router.post('/signup', signupRateLimiter, validate(signupSchema), async (req, res, next) => {
  // 1. 409 if lower(email) already exists   2. bcrypt.hash(password, 10)
  // 3. INSERT INTO merchants (business_name, email, password_hash) ... RETURNING id, business_name
  //    (a 23505 from the unique index, i.e. a race, is also a 409)
  // 4. issueSession(res, merchant.id)  5. 201 { authenticated: true, merchant: { business_name } }
})

router.post('/login', loginRateLimiter, validate(loginSchema), trackUsage('login'), async (req, res, next) => {
  // SELECT id, business_name, password_hash FROM merchants WHERE lower(email) = $1
  const isValid = await bcrypt.compare(password, merchant?.password_hash ?? DUMMY_HASH)
  if (!merchant?.password_hash || !isValid) {
    return res.status(401).json({ error: 'Incorrect email or password.' }) // never say which one was wrong
  }
  res.locals.merchantId = merchant.id // requireAuth has not run; trackUsage reads it from here
  issueSession(res, merchant.id)
  res.status(200).json({ authenticated: true, merchant: { business_name: merchant.business_name } })
})

// issueSession: jwt.sign({ merchant_id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' }) and the
// session cookie exactly as configured in "Session cookie configuration" above (flags unchanged).

router.post('/logout', requireAuth, ...)  // clears the cookie
router.get('/me', requireAuth, ...)       // { authenticated: true, merchant: { business_name } }
```

Schemas (`schemas/merchant.schema.js`, mirrored on the client): sign-up needs `business_name` 2-100 chars, `email` valid and at most 255 (trimmed, lowercased), `password` 8 characters minimum and at most 72 bytes. Login only requires a valid email and a non-empty password, so it never leaks the password policy. Confirm-password exists only in the sign-up form.

Always `bcrypt.compare` — never a plain `===` string comparison. The token carries `merchant_id` only; the merchant is never read from the request.

## Rate limiting — exact config

```js
// middleware/rateLimiter.js
import rateLimit from 'express-rate-limit'

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many sign-up attempts. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const bookingCreateRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})
```

**Why `skipSuccessfulRequests: true` on login:** the limit exists to stop password guessing, and a guess that works has already succeeded, so counting successful logins adds no protection and only locks real merchants out (five logins in 15 minutes, for example while testing or switching devices, produced a production 429 with the correct password). With the flag, a request counts only if the response status is 400 or above: wrong credentials (401), a malformed body (400) and any other failure all use a slot, while 200s never do. Five failures per 15 minutes per IP still block the sixth attempt with a 429, even if that attempt has the right password. It does not change who is keyed: the bucket is still `req.ip`, which depends on `trust proxy` = 4 (BUGS #040). `signupRateLimiter` deliberately keeps counting every request: an account creation is not a retry of something that failed. Verified by `verify-login-rate-limit-message.mjs` and `verify-auth-http.mjs`.

`signupRateLimiter` (1 hour window, 10 attempts, same shape as `loginRateLimiter`) goes on `POST /api/auth/signup` only, ahead of `validate`. `loginRateLimiter` goes on `POST /api/auth/login` only. `bookingCreateRateLimiter` goes on `POST /api/bookings` only, and it must run **before** `validate(bookingSchema)` so invalid bodies still consume a slot. The limit is high enough that a real merchant double-clicking submit never hits it, and low enough to blunt a scripted abuse attempt. Per `BUGS.md`: confirm this is actually wired into the route, not just defined and imported nowhere — that exact gap is a known gotcha to check before every deploy.

Inventory and booking-edit routes are **not** separately rate limited — they're low-volume, manually-triggered actions for a single merchant, and adding limiters there would be solving a problem that doesn't exist at this scale. Don't add them speculatively.

---

## Proxy-only origin lock (`x-proxy-secret`) — production

The Render API must only be reachable through our Vercel proxy (BUGS #056). Without this, a direct request to the Render URL has one fewer hop than `trust proxy` = 4 expects, so a forged `X-Forwarded-For` could become `req.ip` and evade the rate limiters.

- **Env var:** `PROXY_SHARED_SECRET`, same value in the Render and Vercel dashboards. Server-side only: it must **never** start with `VITE_` (those are baked into the public JS bundle) and its value never goes in any file in the repo. Required at boot **only when `NODE_ENV === 'production'`**; local dev does not need it.
- **Vercel side:** the root `vercel.json` (the only Vercel config: the project's Root Directory is the repo root, so a `client/vercel.json` would never be read) has a `routes` entry for `/api/(.*)` with `continue: true` and a `request.headers` transform that sets `x-proxy-secret` from `$PROXY_SHARED_SECRET` (read through the transform's `env` allowlist, so no literal value is in the file). The same file holds the `/api` rewrite to Render, the SPA fallback and the security headers. All six headers enforce, including `Content-Security-Policy`; it first ran as `Content-Security-Policy-Report-Only` and was switched to enforcing on 2026-10-13 after the live console showed zero violations (BUGS #053, #057). If the Vercel variable is missing, the header becomes the literal text `$PROXY_SHARED_SECRET` and the API answers 403 (fails closed).
- **Server side:** `server/middleware/requireProxySecret.js`, mounted in `server/index.js` right after `trust proxy` and before helmet and everything else, **production only**. It compares `x-proxy-secret` with `crypto.timingSafeEqual` (a length mismatch returns false without throwing). Missing or wrong header: `403 { "error": "Not found." }`, no other detail, the header value is never logged.
- **Exempt:** `GET /api/health` only (Render's health check).
- **`PROXY_LOCK_MODE`** (Render, production only): `report` or `enforce`. Unset or any other value (including `REPORT`) means `enforce` (fail closed). In `report` mode the same `timingSafeEqual` check runs but every request continues, and exactly one line is logged per request: `proxy_lock check=pass|fail path=<req.path>`. The header value, its length and other headers are never logged. The health exemption is the same in both modes.
- **Staged rollout:**
  1. Set `PROXY_SHARED_SECRET` in Render and Vercel and `PROXY_LOCK_MODE=report` in Render, then deploy.
  2. Confirm in Render's logs that real app traffic logs `check=pass` and that a direct request to the Render URL logs `check=fail`.
  3. Set `PROXY_LOCK_MODE=enforce` in Render (an env change and restart; no code deploy).
  4. Run the post-deploy checklist in BUGS #056.
- **Status:** production has run in `enforce` mode since the rollout was verified on 2026-10-13 (BUGS #056): the direct Render URL returns 403 and all app traffic through Vercel passes. Keep `PROXY_LOCK_MODE=enforce` set on Render.
- **Rollback:** switching mode is an env change on Render, so rolling back to `report` needs no code deploy.
- **Rotating the secret:** change it in Render and Vercel, then redeploy both. Requests fail with 403 between the two changes.

## Route auth matrix

Cross-check against this table any time a new route is added — every business row needs `requireAuth` checked. Only sign-up, login and health are intentionally unauthenticated.

**Production only:** every route in this table, `GET /api/health` excepted, also requires a valid `x-proxy-secret` header (see the proxy-only origin lock section above). Requests without it get `403 { "error": "Not found." }` before any other middleware runs.

| Route | `requireAuth`? | Rate limited? |
|---|---|---|
| `GET /api/health` | No — intentional liveness; returns `{ status: 'ok' }` only, no data | No |
| Any other `/api/*` path | No — catch-all mounted after every route, returns `404 { error: 'Not found.' }` and no data (in production the proxy-secret check still runs first) | No |
| `POST /api/auth/signup` | No | Yes — `signupRateLimiter` |
| `POST /api/auth/login` | No | Yes — `loginRateLimiter` |
| `POST /api/auth/logout` | Yes | No |
| `GET /api/auth/me` | Yes | No |
| `GET /api/bookings` | Yes | No |
| `GET /api/bookings/check-conflict` | Yes | No |
| `GET /api/bookings/pending-balances` | Yes | No |
| `GET /api/bookings/:id` | Yes | No |
| `POST /api/bookings` | Yes | Yes — `bookingCreateRateLimiter` |
| `PATCH /api/bookings/:id/log` | Yes | No |
| `POST /api/bookings/:id/expenses` | Yes | No |
| `DELETE /api/bookings/:id/expenses/:expenseId` | Yes | No |
| `PATCH /api/bookings/:id/status` | Yes | No |
| `DELETE /api/bookings/:id` | Yes | No |
| `PATCH /api/bookings/:id` | Yes | No |
| `GET /api/inventory` | Yes | No |
| `POST /api/inventory/check-availability` | Yes | No |
| `POST /api/inventory` | Yes | No |
| `PATCH /api/inventory/:id/price` | Yes | No |
| `PATCH /api/inventory/:id` | Yes | No |
| `POST /api/inventory/:id/damage` | Yes | No |
| `DELETE /api/inventory/:id` | Yes | No |
| `GET /api/analytics/summary` | Yes | No |
| `GET /api/analytics/monthly` | Yes | No |
| `POST /api/usage/log-client-action` | Yes | No |
| `GET /api/usage/me` | Yes | No |
| `GET /api/usage/admin` | Yes + `requireAdminKey` (below) | No |
| `GET /api/settings` | Yes | No |
| `PATCH /api/settings` | Yes | No |
| `GET /api/reports/range` | Yes | No |
| `GET /api/records` | Yes | No |

---

## `/api/usage/admin` — the "separate dev-only check"

**Note: this section is a proposed default, not something extracted from an existing file.** `ARCHITECTURE.md` references "a separate dev-only check, see SECURITY.md" but no other doc defines what that check actually is. This is one reasonable way to do it for a single-merchant app with no separate developer account; adjust if you had something else in mind.

Since there's no multi-user system to grant a "developer" role, the simplest correct approach is a second shared secret — known only to you, never the merchant, and never referenced from any client-side code (it must never be called from `UsageView.jsx`, which only ever hits `/api/usage/me`).

```js
// middleware/requireAdminKey.js
import { timingSafeEqual } from 'crypto'

const adminKeysMatch = (provided, expected) => {
  if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) {
    return false
  }
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}

export const requireAdminKey = (req, res, next) => {
  if (!adminKeysMatch(req.headers['x-admin-key'], process.env.ADMIN_ACCESS_KEY)) {
    return res.status(401).json({ error: 'Not authorized.' })
  }
  next()
}
```

```js
// routes/usage.js
router.get('/admin', requireAuth, requireAdminKey, async (req, res, next) => {
  // ...
})
```

You'd call this with the key set as a header — via Postman, `curl`, or a small script, never from the deployed frontend:
```bash
curl -H "x-admin-key: YOUR_KEY" https://your-api-url/api/usage/admin
```

Add `ADMIN_ACCESS_KEY` to `server/.env` and `server/.env.example` (placeholder only in the latter) alongside the other env vars listed in `ARCHITECTURE.md`.

---

## Error handling — never leak internals

Exact pattern (mirrors `CODING_STANDARDS.md`, repeated here because it's a security control, not just a style rule):

```js
// middleware/errorHandler.js
export const errorHandler = (err, req, res, next) => {
  console.error(err) // server-side log always has full detail

  const isProd = process.env.NODE_ENV === 'production'
  res.status(err.status || 500).json({
    error: isProd ? 'Something went wrong. Please try again.' : err.message,
  })
}
```

This must be the **last** middleware mounted in `index.js`, after every route. Test it deliberately before every deploy by throwing an intentional error and confirming the production response body contains no stack trace, no file path, and no raw `err.message`.

---

## Input validation — server is the only check that matters

Client-side `zod` validation (`CODING_STANDARDS.md`) is UX only — instant feedback, nothing more. It can be bypassed entirely by anyone hitting the API directly (Postman, curl, browser devtools). The server-side `validate(schema)` middleware is what actually protects the database. This applies equally to the new inventory schemas (`inventory.schema.js`) — an item name or quantity coming from the client is no more trustworthy than a booking field.

**Known gotcha** (from `BUGS.md`): the most common way this silently breaks is `validate(schema)` being added to a route's middleware chain but placed *after* the route handler instead of before it. Express runs middleware in array order — always:

```js
router.post('/', requireAuth, validate(bookingSchema), async (req, res, next) => { ... })
```

never:

```js
router.post('/', requireAuth, async (req, res, next) => { ... }, validate(bookingSchema))
```

---

## SQL injection prevention

Every query uses `pg`'s parameterized `pool.query()` / `client.query()` with `$1`, `$2`, … placeholders. No exceptions, no string concatenation or template literals with variables in SQL — including aggregate queries for analytics, dynamic WHERE builders in records (values still bound; sort fragments constrained to fixed allowlists), and the per-date inventory availability calculation. Multi-table writes use a client from `pool.connect()` with `BEGIN` / `COMMIT` / `ROLLBACK`, not ad-hoc partial writes. See `CODING_STANDARDS.md` for the exact pattern; this file just states it's a hard security requirement, not a style preference.

---

## Tenant isolation

Multi-merchant data is isolated in two layers; the database layer exists so a route bug cannot silently cross tenants.

- **Database (migration 002):** every business table has `merchant_id NOT NULL REFERENCES merchants(id)`. Child rows are tied to their parent's merchant by composite foreign keys (`(booking_id, merchant_id)` and `(item_id, merchant_id)`), so inserting a row that points at another merchant's booking or item fails with `23503`. Names are unique per merchant, settings are keyed by `(merchant_id, key)`.
- **Session:** the login or sign-up JWT is `{ merchant_id }` (HS256). `requireAuth` verifies it with `algorithms: ['HS256']`, requires an integer `merchant_id` that exists in `merchants` (a token without one, or for a merchant that no longer exists, gets 401 "Your session has expired. Please log in again.", which also forces everyone to re-login once after this change) and sets `req.merchantId`. **A merchant id is never read from the body or params** (the single exception is the documented `?merchant_id=` filter on the admin feed, which already requires the admin key); zod strips unknown keys, so a `merchant_id` in a request body is ignored.
- **Routes:** every SELECT/UPDATE/DELETE on a business table binds `merchant_id = req.merchantId`, every INSERT sets it explicitly (including `trackUsage`, which takes it from `req.merchantId` or, on login, `res.locals.merchantId`). Aggregates are scoped too (`COUNT(DISTINCT phone)`, availability sums, usage/me incl. last-active, analytics, reports, records, settings).
- **The 404 rule:** an id that belongs to another merchant returns exactly what a nonexistent id returns (same status, same message: `Booking not found.`, `Inventory item not found.` / `Item not found.`, `Expense not found.`; `check-availability` keeps its 400 "Inventory item N not found."). Never 403, never a different message, so ids cannot be probed. Unparsable or out-of-range ids take the same path.
- **Booking inventory lines** must reference the merchant's own items, otherwise 400 "One or more inventory items are invalid."; a composite-FK violation (pg `23503`) is mapped to the same 400, never a 500.
- **Responses never include `merchant_id`:** routes use explicit column lists (no `SELECT *`), except the admin feed below.
- **`GET /api/usage/admin`** is the one cross-merchant read: it needs a session AND `ADMIN_ACCESS_KEY`, includes `merchant_id` per row and accepts an optional `?merchant_id=` filter.
- **Proof:** `npm run verify:isolation -- --confirm-host=<dev host>` (dev databases only, production refused) attacks every route with the other merchant's ids in both directions, compares every list and aggregate with a per-merchant SQL oracle and checks row counts and checksums did not change. Run it before every deploy (TESTING.md).
- **Temporary defaults:** `merchant_id` had a temporary `DEFAULT 1` while the routes were unscoped. Migration `004_drop_merchant_defaults` removes it, so any query that forgets `merchant_id` fails with a NOT NULL error instead of silently writing to merchant 1. Production ships in two pushes (see DEPLOYMENT.md).

## Production database guard

Local dev, seeds and verify scripts must never touch the production database (BUGS #058). The production Neon host is kept in exactly one place, `server/config/productionHosts.js` (`PRODUCTION_DB_HOSTS`; a hostname, not a secret). Matching ignores case and the `-pooler` suffix, and also checks a `?host=` override in `DATABASE_URL` and `PGHOST`.

- **`server/db/database.js`** (the only place the pg pool is created, so the server and every script go through it): if `NODE_ENV !== 'production'` and the database host is the production host, it prints "Local dev is pointed at the PRODUCTION database. Point DATABASE_URL at a dev branch." and exits 1. It never prints the URL.
- **`server/scripts/lib/confirmDatabaseHost.mjs`** (destructive scripts, with `--confirm-host=<host>`): refuses the production host outright unless `--i-really-mean-production` is also passed. A production run therefore needs three deliberate things: `NODE_ENV=production`, `--confirm-host=<host>` and `--i-really-mean-production`. The only script meant to run against production is `wipe-for-handoff.mjs`.
- **`server/scripts/lib/refuseProductionDatabase.mjs`** (every verify and seed script, imported right after `dotenv/config`): refuses the production host with no override at all, in any `NODE_ENV`. New verify or seed scripts must import it.
- **Dev database:** the local `DATABASE_URL` points at the Neon "dev" branch (schema only; startup seeds fictional data when `inventory_items` is empty). Do not point it at a branch copied from production: a copy has a different host, so this guard would not catch it, but it holds real client data.
- **Changing the production host** (new Neon project or endpoint): update `PRODUCTION_DB_HOSTS` in the same change.

## Secrets management & git hygiene

- `.env` is gitignored in both `client/` and `server/`. `.env.example` ships with placeholder values only — never a real secret, ever, even temporarily.
- Before every commit, scan the diff for `password`, `secret`, `key`, `token` with a real value next to them instead of `process.env.X`. Stop and fix before committing if found.
- **If a secret is ever accidentally committed, it must be rotated** (changed to a new value) — not just removed in a later commit. Git history retains the old value forever otherwise. Rotating means: generate a new `JWT_SECRET`/`MERCHANT_PASSWORD_HASH`/`ADMIN_ACCESS_KEY`, update it everywhere it's deployed, and treat the old value as permanently compromised.
- Per `BUGS.md`: if `JWT_SECRET` or `MERCHANT_PASSWORD_HASH` ever appears in a `console.log` during debugging, search the whole codebase for that log line and remove it before the *next* commit — not just before deploy.
- Per `DATA_PRIVACY.md`: never paste real merchant secrets, or real client data, into Claude, Cursor, ChatGPT, or any AI tool — including this conversation.

---

## CORS configuration

```js
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true, // required for the httpOnly auth cookie to be sent cross-origin
}))
```

Must be mounted **before** routes in `index.js`. `credentials: true` is required because the session lives in a cookie, not a header.

In production the browser only hits the Vercel frontend origin; Vercel proxies `/api/*` to Render server-to-server, so the merchant's browser is not making cross-origin requests to Render. CORS on Render remains defense in depth: `CORS_ORIGIN` should still be the exact deployed frontend URL — never `*` once real client data is in scope (a wildcard origin combined with `credentials: true` is invalid per the CORS spec anyway). Direct calls to the Render URL (e.g. Postman, curl) are a separate path and do not affect the merchant's browser session.

---

## HTTPS / transport security at deploy

- Vercel and Render both provision HTTPS automatically on their default domains — no extra config needed for the typical deploy path described in `ARCHITECTURE.md`/`DEPLOYMENT.md`.
- After deploy, confirm in a real browser (not just `curl`) that there are no mixed-content warnings and the padlock icon shows a valid cert.
- The `secure: true` cookie flag (active automatically once `NODE_ENV=production`) depends entirely on the connection actually being HTTPS — if you ever deploy somewhere that doesn't terminate TLS for you, login will silently fail in the same way as the local-`secure:true` gotcha above.

---

## Security audit checklist — run before every `[MILESTONE]` and again before deploy

This is the checklist `PROMPTS.md`'s Prompt 12 refers to. Run through all of it, not just the items that feel relevant to whatever you just built.

- [ ] Every business route has `requireAuth` in its middleware chain — including analytics, usage, inventory, settings, reports, records, expenses, and booking-edit/`status`/`delete` routes. Only `POST /api/auth/signup`, `POST /api/auth/login` and `GET /api/health` are exempt (health must return no data)
- [ ] `errorHandler.js` never returns `err.message` or a stack trace when `NODE_ENV === 'production'` — verified by deliberately throwing an error and checking the response
- [ ] No `console.log` anywhere includes `req.body`, a password, a token, or a full booking object (phone numbers count as sensitive here too)
- [ ] Every SQL query uses parameterized `$n` placeholders via `pg` — no string concatenation, anywhere, including the inventory availability aggregate queries
- [ ] `.env` is confirmed not tracked by git (`git status` should not list it); `.env.example` contains only placeholders
- [ ] `npm audit` run in both `/client` and `/server`; any High/Critical findings fixed, not just noted
- [ ] `loginRateLimiter` is actually applied to the login route, not just defined and imported nowhere
- [ ] `event_log.metadata` never contains `client_name` or `phone` — spot-check a few real rows, not just the schema (per `DATA_PRIVACY.md`)
- [ ] Logged-out session can't read booking OR inventory data even by guessing API URLs (`/api/bookings`, `/api/analytics/summary`, `/api/usage/admin`, `/api/inventory` all return `401`)
- [ ] `BUGS.md` updated with anything found during this pass, severity rated honestly — a "minor" auth gap is still High by default per that file's own rule

**Pre-deploy additions** (on top of all of the above, run against the live URL — not localhost):
- [ ] Cookie `secure` flag is actually working in the deployed environment — log in on the live URL and confirm the session persists across a refresh
- [ ] HTTPS active with no browser security warnings
- [ ] `CORS_ORIGIN` set to the real deployed frontend URL, not `localhost`
- [ ] A logged-out session genuinely cannot see any booking or inventory data on the live URL, not just locally

---

## What's NOT in v1's threat model — and why that's a deliberate choice, not an oversight

- **No multi-factor authentication.** Single merchant, single password, low-stakes POC scope. Self-service password reset and any auth upgrades are deferred to v1.5 per `ROADMAP.md` — don't build them early.
- **No defense against the merchant's own device being compromised** (keylogger, shoulder-surfing, shared device). That's a physical/device-security problem for the merchant, not something this app's auth layer can solve — flag it in the plain-language conversation described in `DATA_PRIVACY.md`, don't try to engineer around it.
- **No protection against the developer themselves.** You have direct database access during build and via the hosting dashboards. `DATA_PRIVACY.md` covers the transparency obligation that comes with that access — this file is about external threats, not insider trust, which is a different problem with a different (non-technical) solution at this scale.
- **No DDoS protection beyond basic rate limiting.** `loginRateLimiter` and `bookingCreateRateLimiter` stop scripted brute-forcing and accidental abuse; they are not a substitute for platform-level protection (e.g. Cloudflare) at real scale. Not worth building further for a single-merchant POC.
- **Email verification, password reset and social/phone login.** Accounts are email + password with self-service sign-up and no email check, so anyone can register any address. Firebase auth/onboarding (ROADMAP Prompt 26) would replace or extend this. Billing/subscriptions remain out of scope (ROADMAP.md).
- **No race-condition-proof inventory locking.** Like the existing date-conflict check, the inventory availability check is select-then-decide, not atomic. For a single merchant typing manually this is a low-probability, low-stakes bug — see `BUGS.md`.

---

## Related documents

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Tech stack, route list, env var names |
| `CODING_STANDARDS.md` | General code conventions, error handler and validation patterns in full |
| `BUGS.md` | Known security-relevant gotchas, bug severity definitions |
| `DATA_PRIVACY.md` | DPDP Act context, what data is collected and why, developer-access transparency |
| `TESTING.md` | Manual test steps that verify the controls in this file actually work |
| `PROMPTS.md` | Prompt 2 (auth build) and Prompt 12 (hardening pass) both implement this file directly |
