# CODING_STANDARDS.md — EventFlow

## Purpose

This file keeps generated code (Cursor, Claude Code) consistent across all files in the project, and keeps it at **product quality** — not demo/vibe-coded quality. Real merchant data flows through this app. Every prompt should reference this file, and `CLAUDE.md` holds the hard rules (it wins if the two ever disagree). If an output violates anything below, reject it and re-prompt rather than patching around it. The code is the source of truth for the examples here; where an example and the code differ, the code wins.

## What "product, not vibe-coded" means concretely

- Every user input is validated before it touches the database — never trust the frontend
- Every API response the frontend depends on is checked for failure, not just the happy path
- No secrets, passwords, or API keys ever appear in a `.jsx`, `.js` file, or git history — only in `.env`
- Every error a merchant could see is a clear, human sentence — never a raw stack trace or `undefined is not a function`
- Every list rendered from user-controlled data is safe against injection (React escapes by default — but anything using `dangerouslySetInnerHTML` is banned outright)
- No silent failures — if a WhatsApp link can't generate or a save fails, the merchant sees a message, not a frozen button
- Alerts inform, they don't block by default — conflict and inventory warnings are surfaced clearly, but the merchant makes the final call unless there's a genuine data-integrity reason to stop them (see `ARCHITECTURE.md`'s Conflict detection and Inventory availability sections)

---

## General rules

- Use **functional components only** — no class components
- Use **named exports** for all components, default export only in `main.jsx` and `App.jsx`
- Use **async/await** — never `.then()` chains
- Use **const** by default — never `var`, only `let` when reassignment is necessary
- No commented-out code in final files — delete it, don't comment it
- No `console.log` left in code that reaches `main`/production branch — use a `debug()` helper gated by `NODE_ENV !== 'production'` if logging is needed
- No `any`-shaped escape hatches — if using TypeScript later, no `any`; in plain JS, validate shape with zod at the boundary instead

---

## File naming

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase `.jsx` | `BookingPage.jsx`, `InventoryItemCard.jsx` |
| Utility functions | camelCase `.js` | `excelExporter.js`, `reportPrinter.js` |
| Store files | camelCase `.js` | `bookingStore.js`, `inventoryStore.js`, `settingsStore.js` |
| Route files | camelCase `.js` | `bookings.js`, `inventory.js` |
| DB files | camelCase `.js` | `database.js` |
| Server services and utils | camelCase `.js` | `services/bookingPricing.js`, `utils/ids.js` |
| Migrations | `NNN_snake_case.sql` | `005_merchant_accounts.sql` (see "Database migrations") |
| Verify / maintenance scripts | `verify-*.mjs`, kebab-case `.mjs` | `scripts/verify-analytics.mjs` |
| Schema files | camelCase `.schema.js` | `booking.schema.js`, `inventory.schema.js` |

---

## Component structure

Every component follows this order — no exceptions:

```jsx
// 1. Imports (external libraries first, then internal)
import { useState } from 'react'
import { useBookingStore } from '../store/bookingStore'

// 2. Component definition
export const BookingModal = ({ isOpen, onClose }) => {

  // 3. State declarations
  const [clientName, setClientName] = useState('')

  // 4. Store/context hooks
  const { addBooking } = useBookingStore()

  // 5. Derived values / computed
  const isFormValid = clientName.length > 0

  // 6. Effect hooks
  useEffect(() => {
    // ...
  }, [])

  // 7. Handler functions
  const handleSubmit = async () => {
    // ...
  }

  // 8. Render
  return (
    <div>...</div>
  )
}
```

---

## Tailwind usage

- Use Tailwind utility classes exclusively — no inline `style={{}}` unless absolutely necessary (e.g. dynamic pixel values from JS)
- No custom CSS files except `index.css`, which contains **Tailwind directives + FullCalendar overrides + keyframes only**
- Color palette to use consistently:

| Purpose | Tailwind class |
|---|---|
| Sidebar background | `bg-slate-900` |
| Main canvas background | `bg-slate-50` |
| Confirmed booking | `bg-teal-500` / `text-teal-800` |
| Pending advance booking | `bg-amber-400` / `text-amber-800` |
| Completed booking | `bg-indigo-500` / `text-indigo-700` / calendar hex `#6366f1` |
| Conflict / error | `bg-red-100` / `text-red-700` / `border-red-400` |
| Primary action button | `bg-teal-600 hover:bg-teal-700 text-white` |
| WhatsApp CTA | `bg-green-600 hover:bg-green-700 text-white` |
| Profit / success / target met | `text-emerald-500` / `text-emerald-600` / `text-emerald-700` / `bg-emerald-500` / `bg-emerald-600` |
| Modal / overlay backdrop | `bg-black/40` or `bg-black/50` |
| Disabled button | `bg-slate-300 text-slate-500 cursor-not-allowed` |
| Card background | `bg-white` |
| Border default | `border border-slate-200` |
| Inventory: available | `bg-emerald-50` / `text-emerald-700` |
| Inventory: in use (today) | `bg-amber-50` / `text-amber-700` |
| Inventory: damaged / repair needed | `bg-red-50` / `text-red-700` / `border-red-200` |
| Inventory shortfall warning (in booking form) | `bg-amber-50` / `border-amber-300` / `text-amber-800` — distinct from the red `ConflictBanner` so the two alert types are visually distinguishable at a glance |

- Use `rounded-xl` for cards and modals, `rounded-lg` for buttons and inputs
- Use `shadow-sm` for cards, `shadow-lg` for modals and drawers
- Transitions: always add `transition-all duration-200` to interactive elements

---

## Currency formatting

Every rupee amount displayed anywhere in the app uses Indian numbering (lakhs/crores comma placement), via one shared helper:

```js
// src/utils/formatCurrency.js
export const formatCurrency = (amount) =>
  `₹${Number(amount).toLocaleString('en-IN')}`
// formatCurrency(120000) → "₹1,20,000"
```

Never hand-roll `toLocaleString('en-US')` or manual comma insertion — always this helper, imported wherever a ₹ amount is rendered (BookingDetail, AnalyticsView, Sidebar stats, UsageView if relevant).

---

## Chart conventions (recharts)

- Primary data series color: `#0d9488` (teal-600) — matches the rest of the palette
- Secondary series (if a chart needs two): `#d97706` (amber-600)
- Axis text: `#64748b` (slate-500), font-size 12
- Grid lines: `#e2e8f0` (slate-200), light, only horizontal (`<CartesianGrid vertical={false} />`)
- Always wrap charts in a `<ResponsiveContainer>` — never a fixed pixel width, the layout must adapt to the card it sits in
- Tooltips: white background, slate-200 border, rounded-lg — override recharts' default tooltip styling to match the rest of the UI rather than leaving its default look
- Empty/insufficient-data state: never render an empty or broken-looking chart — show a centered message instead (see Prompt 10 in PROMPTS.md for the exact copy)

---

## State management (Zustand)

Each concern has its own store in `src/store/`: `bookingStore.js` (bookings and the booking UI state), `inventoryStore.js`, `settingsStore.js` (monthly revenue target), `profileStore.js` (the merchant's profile), `authStore.js` (session, business name). Don't conflate stores just because several feed into one form. No prop drilling beyond one level. All cached merchant data is dropped on every session change (`clearMerchantData` in `authStore.js`), so a second merchant on the same browser never sees the first one's data; a new store that caches merchant data must be reset there.

```js
// bookingStore.js (abridged; see the file for the full panel and modal state)
export const useBookingStore = create((set, get) => ({
  bookings: [],
  bookingsLoaded: false,   // true once the full list is in `bookings`: an empty list after load means "no bookings"
  analyticsVersion: 0,     // bumped by addBooking / updateBooking / removeBooking, which run only after the API call succeeded
  selectedBooking: null,
  isModalOpen: false,
  modalMode: 'create',     // 'create' | 'edit'
  isDetailOpen: false,
  activeView: 'calendar',

  setBookings: (bookings) => set({ bookings, bookingsLoaded: true }),
  addBooking: (booking) =>
    set((state) => ({ bookings: [...state.bookings, booking], analyticsVersion: state.analyticsVersion + 1 })),
  updateBooking: (booking) =>
    set((state) => ({
      bookings: state.bookings.map((row) => (row.id === booking.id ? booking : row)),
      selectedBooking: state.selectedBooking?.id === booking.id ? booking : state.selectedBooking,
      analyticsVersion: state.analyticsVersion + 1,
    })),
  removeBooking: (id) =>
    set((state) => ({
      bookings: state.bookings.filter((row) => Number(row.id) !== Number(id)),
      analyticsVersion: state.analyticsVersion + 1,
    })),
  // ...openModal / forceCloseModal / requestCloseModal (guarded close), setSelectedBooking, setActiveView
}))
```

**Refetching server-computed numbers.** Anything that shows a number the server computes (the Sidebar revenue bar and pending-balance badge, the Analytics screen) subscribes to `analyticsVersion` and refetches when it changes; it keeps the last good value if the refetch fails and never blocks the booking action (`Sidebar.jsx`, `AnalyticsView.jsx`, BUGS #097). Bump it only through the three actions above, after the API call has succeeded, never optimistically. Do not recompute from `bookings` before `bookingsLoaded` is true: the store starts as `[]` and would overwrite fetched values with zeros (BUGS #098).

```js
// inventoryStore.js
export const useInventoryStore = create((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  upsertItem: (item) => set((state) => {
    const exists = state.items.some((i) => i.id === item.id)
    return { items: exists ? state.items.map((i) => (i.id === item.id ? item : i)) : [...state.items, item] }
  }),
  removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
}))
```

---

## Validation (zod) — shared shape

Define the booking shape once, conceptually, and mirror it on both sides. Client validates for UX (instant feedback), server validates because it's the only check that actually matters for security. The two files **mirror** each other; they are not byte-identical (for example the client booking schema adds a cross-field "advance cannot exceed total" check, the server's password length check uses `Buffer` where the client uses `TextEncoder`, and the server inventory schema has the `unit_price` rules the client validates in its modal), so compare behaviour, not text.

```js
// schemas/booking.schema.js (server shown; the client mirrors it)
import { z } from 'zod'

// line_total, subtotal, grand_total and (when lines exist) total are accepted but ignored: the server computes them (BUGS #062).
export const bookingInventoryLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().int().positive().max(10000),
  unit_price: z.number().int().nonnegative().max(10000000).optional(),   // per-line override
  line_total: z.number().int().nonnegative().optional(),
})

export const bookingSchema = z.object({
  client_name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  event_type: z.enum(['wedding', 'birthday', 'corporate', 'other']),
  event_type_custom: z.string().trim().max(50).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  guest_count: z.number().int().positive().max(10000),
  venue: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  advance: z.number().int().nonnegative().max(10000000),
  total: z.number().int().nonnegative().max(10000000),
  subtotal: z.number().int().nonnegative().optional(),
  discount: z.number().int().nonnegative().max(10000000).optional(),
  grand_total: z.number().int().nonnegative().optional(),
  inventory: z.array(bookingInventoryLineSchema).max(50).optional(),
})
```

```js
// schemas/inventory.schema.js (server shown)
import { z } from 'zod'

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(2, 'Item name is too short').max(100),
  total_quantity: z.number().int().nonnegative().max(100000),
  unit_price: z.number().int().nonnegative().max(10000000).optional().default(0),
})

export const inventoryPriceUpdateSchema = z.object({
  unit_price: z.number().int().nonnegative().max(10000000),
})

export const inventoryQuantityUpdateSchema = z.object({
  total_quantity: z.number().int().nonnegative().max(100000),
})

export const inventoryDamageAdjustSchema = z.object({
  change: z.number().int().refine((n) => n !== 0, 'Change cannot be zero'), // positive = mark damaged, negative = mark repaired
  note: z.string().trim().max(300).optional(),
})

export const availabilityCheckSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().int().nonnegative().max(10000),
  })),
  excludeBookingId: z.number().int().positive().optional(),
})
```

Account schemas (`merchant.schema.js`: sign-up, login, OTP, reset, profile) follow the same rule. The password rules are in `passwordField` (8+ characters, at most 72 bytes); login deliberately does not re-check strength.

Rule: **the server schema is the source of truth.** If client and server schema ever drift, server wins and client gets updated to match — never the reverse.

---

## API calls (frontend)

All API calls go through a single `src/utils/api.js` utility — never call `fetch` directly from components. The wrapper handles credentials, error shape and the conflict/retry fields in one place.

```js
// src/utils/api.js (abridged)
const BASE = import.meta.env.VITE_API_URL   // http://localhost:3001/api in dev, /api in production

class ApiError extends Error {
  constructor(message, status, conflictBooking = null, retryAfter = null) {
    super(message)
    this.status = status                      // 0 means the server could not be reached
    this.conflictBooking = conflictBooking
    this.retryAfter = retryAfter              // seconds, on a resend that came too soon
  }
}

const request = async (path, options = {}) => {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',                 // sends the httpOnly session cookie
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new ApiError('Something went wrong. Please try again.', 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // a readable { error } from the server, else a generic sentence (a distinct one for 429)
    throw new ApiError(/* body.error or fallback */, res.status, body?.conflict ? body.booking : null, /* body.retryAfter */)
  }
  return body                                  // a non-object body is also an ApiError
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getBookings: () => request('/bookings'),
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  updateBooking: (id, data) => request(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateBookingStatus: (id, status) => /* PATCH /bookings/:id/status */,
  getAnalyticsSummary: () => request('/analytics/summary'),
  // ... one entry per route (sign-up/OTP, profile via profileRequest, inventory, reports, records, usage, settings)
}
```

`profileRequest` wraps the profile routes: a 401 normally means the session is gone, but three routes also answer 401 for a wrong current password, so those check `/auth/me` before the error is called a session expiry (`err.sessionExpired`).

**Every component that calls `api.*` must handle the rejected promise** — minimum requirement is a visible error state, not a silent console error. Pattern:

```jsx
const [error, setError] = useState(null)
const [isLoading, setIsLoading] = useState(false)

const handleSubmit = async () => {
  setIsLoading(true)
  setError(null)
  try {
    await api.createBooking(formData)
    onClose()
  } catch (err) {
    setError(err.message)
  } finally {
    setIsLoading(false)
  }
}
```

---

## Backend (Express) rules

**Multi-merchant (every route).** Every SELECT/UPDATE/DELETE on a business table binds `merchant_id = $n` to `req.merchantId` (set by `requireAuth` from the signed token, never from the body, query or params); every INSERT sets `merchant_id` explicitly. A lookup by id that does not belong to the merchant returns the same 404 as a missing one. Return explicit column lists, never `SELECT *`, so `merchant_id` does not leak. Any new script that deletes or rewrites tenant data needs `--merchant-id=<n>` (see `scripts/lib/merchantArg.mjs`) as well as `--confirm-host`.

- All routes return JSON — no exceptions
- All route handlers are `async` — wrap in try/catch, or use an async error-catching wrapper so errors reach `errorHandler.js` automatically
- HTTP status codes must be correct:
  - `200` for successful GET/PATCH
  - `201` for successful POST (resource created)
  - `401` for missing/invalid auth session
  - `400` for validation errors
  - `429` for rate-limited requests
  - `500` for unexpected server errors
- **Date clashes and inventory shortfalls are never error statuses.** Both are detected on the server and returned as informational flags on an otherwise successful response — same pattern for both:
  - Date clash on POST `/bookings` → `201` with optional `conflict: { detected: true, booking: { id, client_name, event_type } }` on the created booking body (field omitted when no clash)
  - Date clash on PATCH `/bookings/:id` → `200` with the same optional `conflict` shape
  - Inventory shortfall on POST `/inventory/check-availability` → `200` with `{ sufficient: true }` or `{ sufficient: false, shortfalls: [...] }` — never a 409 or other error status for either case
- **Validation happens via the zod schema, before any DB call** — use a generic `validate(schema)` middleware so individual routes don't hand-roll checks
- **Auth happens via `requireAuth` middleware** on every business route, applied once with `router.use(requireAuth)` at the top of each business router — see SECURITY.md for the full model. The only unauthenticated routes are `GET /api/health`, `POST /api/auth/login` and the public sign-up and password-reset routes (all rate limited and validated; none reveals whether an email has an account, except sign-up's accepted 409, BUGS #073)
- No business logic in `index.js` — only middleware setup and route mounting
- **Derived money values are computed on the server** (`services/bookingPricing.js`): never trust a client-sent `total`, `subtotal`, `grand_total` or `line_total` when lines exist
- **"Not cancelled" means `ACTIVE_BOOKING_SQL` / `isActiveBooking`** from `services/bookingStatus.js` for anything that counts money, bookings or clients (analytics, reports). Do not hand-write the predicate again (BUGS #096)
- **Sessions and credentials:** `bumpTokenVersion(client, merchantId)` (`services/session.js`) is the only way a logged-in route bumps `merchants.token_version`: bump inside the transaction and call `issueSession` only after COMMIT; never touch `res` inside a transaction. `sign_in_log` and every log line hold no IP address or full user agent
- **Deleting an account** (`DELETE /api/profile`) lists every merchant-scoped table by hand, children before parents: add any new table with a `merchant_id` column there in the same commit
- **Never send raw error messages or stack traces to the client in production.** `errorHandler.js` must check `NODE_ENV` and return a generic message in prod, full detail only in dev

```js
// middleware/validate.js — generic validation middleware
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message })
  }
  req.body = result.data // sanitized/coerced data going forward
  next()
}

// Route handler pattern — requireAuth already applied by router.use(requireAuth); validation via the chain
// Import pool from '../db/database.js'. (Simplified: the real POST /bookings prices the booking and runs in a transaction.)
router.post('/', validate(bookingSchema), async (req, res, next) => {
  try {
    const { client_name, phone, event_type, event_date, guest_count, venue, advance, total } = req.body

    const clashResult = await pool.query(
      `SELECT id, client_name, event_type FROM bookings
       WHERE merchant_id = $1 AND event_date = $2 AND status != 'cancelled'
       LIMIT 1`,
      [req.merchantId, event_date],
    )
    const clash = clashResult.rows[0]

    const insertResult = await pool.query(
      `INSERT INTO bookings (merchant_id, client_name, phone, event_type, event_date, guest_count, venue, advance, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, client_name, phone, event_type, event_date, guest_count, venue, advance, total, status`,
      [req.merchantId, client_name, phone, event_type, event_date, guest_count, venue, advance, total],
    )
    const newBooking = insertResult.rows[0]

    const body = clash
      ? {
          ...newBooking,
          conflict: {
            detected: true,
            booking: {
              id: clash.id,
              client_name: clash.client_name,
              event_type: clash.event_type,
            },
          },
        }
      : newBooking
    res.status(201).json(body)
  } catch (err) {
    next(err) // goes to errorHandler.js — never res.status(500).json({ error: err.message }) directly, that can leak internals
  }
})
```

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

**SQL rule: always use parameterized queries (`$1`, `$2`, … placeholders) — never string-concatenate user input into SQL.** `pg`'s `pool.query(sql, params)` / `client.query(sql, params)` already does this correctly in every example above; never replace it with template-literal SQL.

**Multi-table writes (booking + booking_inventory, or item + damage log) must run inside a transaction.** Checkout a client from the pool and use `BEGIN` / `COMMIT` / `ROLLBACK` (this is how `routes/bookings.js`, `routes/inventory.js` and `routes/profile.js` do it; there is no wrapper helper):

```js
const client = await pool.connect()
try {
  await client.query('BEGIN')
  // … multiple client.query(..., [$1, $2]) writes …
  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  client.release()   // always, so a failed request cannot leak a connection
}
```

Use this whenever a single logical action touches more than one table, so a booking is never created with half its inventory rows missing if something fails partway through.

---

## Repository and npm setup

The repo is two npm projects, not one workspace tree (BUGS #092):

- **Root `package.json`:** `workspaces` is `["client"]` only, plus `concurrently` for the `dev` script (`npm run dev` runs the client on 5173 and `npm --prefix server run dev` on 3001). Its lockfile feeds Vercel (client + concurrently).
- **`server/`:** a standalone project with its own `package.json` and `package-lock.json`. Render builds it on its own (Root Directory `server`, `npm ci --omit=dev`), so `server/package-lock.json` must stay in sync with `server/package.json`, and devDependencies (Playwright) never ship.
- **Local setup is two installs:** `npm ci` at the repo root, then `npm ci` inside `server/`. After changing a server dependency, regenerate `server/package-lock.json` (a root Dependabot update does not touch it).
- **Vercel** builds with the root `vercel.json` (`cd client && npm install && npm run build`); see DEPLOYMENT.md.
- A new dependency needs a reason and is asked about first (CLAUDE.md).

---

## Database migrations

The schema's source of truth is `server/db/migrations/`. Never run ad-hoc `ALTER`s (`schema.sql` no longer exists).

- One numbered file per change: `NNN_short_name.sql` (three digits, lowercase; no two files share a number). Files run in order, once each.
- **Never edit a migration that has been applied anywhere.** Fix forward with a new file. There are no down migrations; take a restore-point branch before deploying one.
- Do not write `BEGIN` / `COMMIT` / `ROLLBACK` in a file: the runner wraps each file in its own transaction and holds an advisory lock. (`BEGIN` inside a `DO $$ ... $$` block is fine.) No `CREATE INDEX CONCURRENTLY`.
- Find constraints by what they link (catalog lookup in a `DO` block) when their auto-generated names might differ between databases; give new constraints explicit names.
- A new tenant-owned table needs `merchant_id` and composite foreign keys to its parents (see ARCHITECTURE.md, Data model).
- Migrations and the runner print migration ids only, never row data; error output uses the message, not the Postgres `detail` (it can contain values).
- Run them with `npm run migrate -- --confirm-host=<host>`; the server also runs them on boot, so a deploy migrates production. A release that ships a migration the new code and the old schema depend on goes out in two pushes (DEPLOYMENT.md).
- Queries use `pg` placeholders (`$1`, `$2`, ...), never `?` (that was the SQLite era).

## Seed data rules

Seed data is for dev databases only: `seed()` does nothing when `NODE_ENV === 'production'`, and seed scripts import `scripts/lib/refuseProductionDatabase.mjs`. Every seed row sets `merchant_id` explicitly.

- Minimum 10 bookings in the seed
- Spread across current month — not all clustered in one week
- Mix of event types: at least 4 weddings, 2 birthdays, 2 corporate, 2 other
- Mix of statuses: 7 confirmed, 2 pending, 1 cancelled
- At least 1 date with two bookings already seeded — used to demonstrate conflict detection
- All phone numbers: use `9876543210` pattern with last digits varied
- All advance amounts between ₹5,000 and ₹25,000
- All total amounts between ₹25,000 and ₹1,50,000
- A starter inventory set: at minimum Plastic Chairs, Round Tables, Shamiana Tents, Sofas — realistic owned quantities for a small/mid tent business (e.g. 300 chairs, 40 tables, 4 tents, 10 sofas)
- At least one item with a nonzero `damaged_quantity` and a matching `inventory_damage_log` row, so the Damaged section isn't empty on first load
- At least one or two seeded bookings should have `booking_inventory` rows attached, so `InventoryView` shows a nonzero "in use" count without needing to create a booking manually first

---

## WhatsApp links

Always use `https://wa.me/91${phone}` format (Indian numbers). Always `encodeURIComponent` the message. Never hardcode a phone number. Messages sign off with the **merchant's own business name** (`businessName` from `authStore`, passed into the helpers in `utils/whatsapp.js`), not "EventFlow" and not a hardcoded name. The merchant's own number comes from their profile (`whatsapp_phone`), never an env var. See `ARCHITECTURE.md`'s WhatsApp link generation section.

---

## Git hygiene

- Commit after each major screen is working
- One logical change per commit. Commit message format: `feat: add conflict detection UI` / `fix: date picker reset on modal close` / `security: add rate limiting to login` / `docs:` / `chore:` / `test:`. Never push without asking, never rewrite history (CLAUDE.md)
- `.env` is gitignored — use `.env.example` with placeholder values, **never real secrets**
- `node_modules` is gitignored
- Local DB artifacts (e.g. leftover `*.db` files) are gitignored — the app uses Postgres via `DATABASE_URL`; seed runs on server start when not production
- **Before every commit, scan for accidentally hardcoded secrets**: search the diff for `password`, `secret`, `key`, `token` — if any of these have a real value next to them instead of `process.env.X`, stop and fix before committing
- If a secret is ever accidentally committed: it must be **rotated** (changed to a new value), not just deleted from a later commit — git history retains it forever otherwise. See SECURITY.md.

---

## Pre-milestone code review checklist

Run through this before marking any PROMPTS.md milestone "done." Takes 5 minutes, catches the majority of vibe-coded issues.

- [ ] Every form input has a corresponding validation rule (client AND server)
- [ ] Every `api.*` call site has a `catch`/error state — no silent failures
- [ ] No `console.log` of sensitive data (phone numbers, session tokens)
- [ ] No hardcoded URLs — `localhost:3001` should only ever come from `import.meta.env.VITE_API_URL`
- [ ] Every protected route is behind `requireAuth` (`router.use(requireAuth)` in its router) and every query is scoped to `req.merchantId` — including inventory routes; `npm run verify:isolation -- --confirm-host=<dev host>` passes
- [ ] Every new dependency added is actually used (no leftover installs bloating the bundle)
- [ ] New component follows the 8-step structure order defined above
- [ ] Tailwind classes match the palette table — no off-palette hex colors introduced ad hoc
- [ ] Any multi-table write (booking + inventory rows, item + damage log) uses `pool.connect()` + `BEGIN` / `COMMIT` / `ROLLBACK`
- [ ] `BUGS.md` updated if anything was debugged during this milestone
