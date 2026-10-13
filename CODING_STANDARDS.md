# CODING_STANDARDS.md — EventFlow

## Purpose

This file keeps Cursor-generated code consistent across all files in the project, and keeps it at **product quality** — not demo/vibe-coded quality. Real merchant data flows through this app. Every prompt should reference this file. If a Cursor output violates anything below, reject it and re-prompt rather than patching around it.

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

All global booking state lives in `src/store/bookingStore.js`. All inventory state lives in a separate `src/store/inventoryStore.js` — don't conflate the two stores just because both feed into the booking form. No prop drilling beyond one level.

```js
// bookingStore.js structure
export const useBookingStore = create((set, get) => ({
  bookings: [],
  selectedBooking: null,
  isModalOpen: false,
  modalMode: 'create',        // 'create' | 'edit' — drives BookingPage's title/submit label/API call
  isDetailOpen: false,

  setBookings: (bookings) => set({ bookings }),
  addBooking: (booking) => set((state) => ({ bookings: [...state.bookings, booking] })),
  updateBooking: (booking) => set((state) => ({
    bookings: state.bookings.map((b) => (b.id === booking.id ? booking : b)),
  })),
  setSelectedBooking: (booking) => set({ selectedBooking: booking, isDetailOpen: true }),
  openModal: (mode = 'create') => set({ isModalOpen: true, modalMode: mode }),
  closeModal: () => set({ isModalOpen: false, modalMode: 'create' }),
  closeDetail: () => set({ isDetailOpen: false, selectedBooking: null }),
}))
```

```js
// inventoryStore.js structure
export const useInventoryStore = create((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  upsertItem: (item) => set((state) => {
    const exists = state.items.some((i) => i.id === item.id)
    return {
      items: exists
        ? state.items.map((i) => (i.id === item.id ? item : i))
        : [...state.items, item],
    }
  }),
}))
```

---

## Validation (zod) — shared shape

Define the booking shape once, conceptually, and mirror it on both sides. Client validates for UX (instant feedback), server validates because it's the only check that actually matters for security.

```js
// schemas/booking.schema.js — same file content on client AND server
import { z } from 'zod'

export const bookingInventoryLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().int().positive().max(10000),
})

export const bookingSchema = z.object({
  client_name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  event_type: z.enum(['wedding', 'birthday', 'corporate', 'other']),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  guest_count: z.number().int().positive().max(10000),
  venue: z.string().trim().max(200).optional(),
  advance: z.number().int().nonnegative().max(10000000),
  total: z.number().int().nonnegative().max(10000000),
  inventory: z.array(bookingInventoryLineSchema).max(50).optional(),
})
```

```js
// schemas/inventory.schema.js — same file content on client AND server
import { z } from 'zod'

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(2, 'Item name is too short').max(100),
  total_quantity: z.number().int().nonnegative().max(100000),
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
    quantity: z.number().int().positive().max(10000),
  })),
  excludeBookingId: z.number().int().positive().optional(),
})
```

Rule: **the server schema is the source of truth.** If client and server schema ever drift, server wins and client gets updated to match — never the reverse.

---

## API calls (frontend)

All API calls go through a single `api.js` utility — never call `fetch` directly from components. The wrapper handles auth headers, error shape, and timeouts in one place.

```js
// src/utils/api.js
const BASE = import.meta.env.VITE_API_URL

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const request = async (path, options = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include', // sends the httpOnly session cookie
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || 'Something went wrong. Please try again.', res.status)
  }

  return res.json()
}

export const api = {
  login: (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  getBookings: () => request('/bookings'),
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  updateBooking: (id, data) => request(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  checkConflict: (date, excludeId) => request(`/bookings/check-conflict?date=${date}${excludeId ? `&excludeId=${excludeId}` : ''}`),
  logChange: (id, note) => request(`/bookings/${id}/log`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  getInventory: () => request('/inventory'),
  addInventoryItem: (data) => request('/inventory', { method: 'POST', body: JSON.stringify(data) }),
  updateInventoryQuantity: (id, data) => request(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adjustInventoryDamage: (id, data) => request(`/inventory/${id}/damage`, { method: 'POST', body: JSON.stringify(data) }),
  checkInventoryAvailability: (data) => request('/inventory/check-availability', { method: 'POST', body: JSON.stringify(data) }),
}
```

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
- **Auth happens via `requireAuth` middleware** on every business route — see SECURITY.md for the full model (only `/auth/login` and `/health` are intentionally unauthenticated)
- No business logic in `index.js` — only middleware setup and route mounting
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

// Route handler pattern — validation + auth already applied via middleware chain
// Import pool from '../db/database.js'
router.post('/', requireAuth, validate(bookingSchema), async (req, res, next) => {
  try {
    const { client_name, phone, event_type, event_date, guest_count, venue, advance, total } = req.body

    const clashResult = await pool.query(
      `SELECT id, client_name, event_type FROM bookings
       WHERE event_date = $1 AND status != 'cancelled'
       LIMIT 1`,
      [event_date],
    )
    const clash = clashResult.rows[0]

    const insertResult = await pool.query(
      `INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [client_name, phone, event_type, event_date, guest_count, venue, advance, total],
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

**Multi-table writes (booking + booking_inventory, or item + damage log) must run inside a transaction.** Checkout a client from the pool and use `BEGIN` / `COMMIT` / `ROLLBACK`:

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
  client.release()
}
```

Use this whenever a single logical action touches more than one table, so a booking is never created with half its inventory rows missing if something fails partway through.

---

## Seed data rules

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

Always use `https://wa.me/91${phone}` format (Indian numbers). Always `encodeURIComponent` the message. Never hardcode a phone number. Messages sign off as **"Bala Ji Tent House"**, not "EventFlow" — see `ARCHITECTURE.md`'s WhatsApp link generation section for the exact templates.

---

## Git hygiene

- Commit after each major screen is working
- Commit message format: `feat: add conflict detection UI` / `fix: date picker reset on modal close` / `security: add rate limiting to login`
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
- [ ] Every protected route has `requireAuth` in its middleware chain — including inventory routes
- [ ] Every new dependency added is actually used (no leftover installs bloating the bundle)
- [ ] New component follows the 8-step structure order defined above
- [ ] Tailwind classes match the palette table — no off-palette hex colors introduced ad hoc
- [ ] Any multi-table write (booking + inventory rows, item + damage log) uses `pool.connect()` + `BEGIN` / `COMMIT` / `ROLLBACK`
- [ ] `BUGS.md` updated if anything was debugged during this milestone
