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
| React components | PascalCase `.jsx` | `BookingModal.jsx` |
| Utility functions | camelCase `.js` | `conflictCheck.js` |
| Store files | camelCase `.js` | `bookingStore.js` |
| Route files | camelCase `.js` | `bookings.js` |
| DB files | camelCase `.js` | `database.js` |
| Schema files | camelCase `.schema.js` | `booking.schema.js` |

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
- No custom CSS files except `index.css` which contains only Tailwind directives
- Color palette to use consistently:

| Purpose | Tailwind class |
|---|---|
| Sidebar background | `bg-slate-900` |
| Main canvas background | `bg-slate-50` |
| Confirmed booking | `bg-teal-500` / `text-teal-800` |
| Pending advance booking | `bg-amber-400` / `text-amber-800` |
| Conflict / error | `bg-red-100` / `text-red-700` / `border-red-400` |
| Primary action button | `bg-teal-600 hover:bg-teal-700 text-white` |
| Disabled button | `bg-slate-300 text-slate-500 cursor-not-allowed` |
| Card background | `bg-white` |
| Border default | `border border-slate-200` |

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

All global state lives in `src/store/bookingStore.js`. No prop drilling beyond one level.

```js
// bookingStore.js structure
export const useBookingStore = create((set, get) => ({
  bookings: [],
  selectedBooking: null,
  isModalOpen: false,
  isDetailOpen: false,

  setBookings: (bookings) => set({ bookings }),
  addBooking: (booking) => set((state) => ({ bookings: [...state.bookings, booking] })),
  setSelectedBooking: (booking) => set({ selectedBooking: booking, isDetailOpen: true }),
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
  closeDetail: () => set({ isDetailOpen: false, selectedBooking: null }),
}))
```

---

## Validation (zod) — shared shape

Define the booking shape once, conceptually, and mirror it on both sides. Client validates for UX (instant feedback), server validates because it's the only check that actually matters for security.

```js
// schemas/booking.schema.js — same file content on client AND server
import { z } from 'zod'

export const bookingSchema = z.object({
  client_name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  event_type: z.enum(['wedding', 'birthday', 'corporate', 'other']),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  guest_count: z.number().int().positive().max(10000),
  venue: z.string().trim().max(200).optional(),
  advance: z.number().int().nonnegative().max(10000000),
  total: z.number().int().nonnegative().max(10000000),
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
  checkConflict: (date) => request(`/bookings/check-conflict?date=${date}`),
  logChange: (id, note) => request(`/bookings/${id}/log`, { method: 'PATCH', body: JSON.stringify({ note }) }),
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
  - `200` for successful GET
  - `201` for successful POST (resource created)
  - `401` for missing/invalid auth session
  - `409` for conflict detected (booking clash)
  - `400` for validation errors
  - `429` for rate-limited requests
  - `500` for unexpected server errors
- **Validation happens via the zod schema, before any DB call** — use a generic `validate(schema)` middleware so individual routes don't hand-roll checks
- **Auth happens via `requireAuth` middleware** on every route except `/auth/login` — see SECURITY.md for the full model
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
router.post('/', requireAuth, validate(bookingSchema), async (req, res, next) => {
  try {
    const { client_name, phone, event_type, event_date, guest_count, venue, advance, total } = req.body

    const existing = db.prepare('SELECT * FROM bookings WHERE event_date = ?').get(event_date)
    if (existing) {
      return res.status(409).json({ conflict: true, booking: existing })
    }

    const result = db.prepare(
      'INSERT INTO bookings (client_name, phone, event_type, event_date, guest_count, venue, advance, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(client_name, phone, event_type, event_date, guest_count, venue, advance, total)

    const newBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(newBooking)
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

**SQL rule: always use parameterized queries (`?` placeholders) — never string-concatenate user input into SQL.** `better-sqlite3`'s `.prepare()` already does this correctly in every example above; never replace it with template-literal SQL.

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

---

## WhatsApp links

Always use `https://wa.me/91${phone}` format (Indian numbers). Always `encodeURIComponent` the message. Never hardcode a phone number.

---

## Git hygiene

- Commit after each major screen is working
- Commit message format: `feat: add conflict detection UI` / `fix: date picker reset on modal close` / `security: add rate limiting to login`
- `.env` is gitignored — use `.env.example` with placeholder values, **never real secrets**
- `node_modules` is gitignored
- SQLite `.db` file is gitignored — seed runs fresh on every local startup
- **Before every commit, scan for accidentally hardcoded secrets**: search the diff for `password`, `secret`, `key`, `token` — if any of these have a real value next to them instead of `process.env.X`, stop and fix before committing
- If a secret is ever accidentally committed: it must be **rotated** (changed to a new value), not just deleted from a later commit — git history retains it forever otherwise. See SECURITY.md.

---

## Pre-milestone code review checklist

Run through this before marking any PROMPTS.md milestone "done." Takes 5 minutes, catches the majority of vibe-coded issues.

- [ ] Every form input has a corresponding validation rule (client AND server)
- [ ] Every `api.*` call site has a `catch`/error state — no silent failures
- [ ] No `console.log` of sensitive data (phone numbers, session tokens)
- [ ] No hardcoded URLs — `localhost:3001` should only ever come from `import.meta.env.VITE_API_URL`
- [ ] Every protected route has `requireAuth` in its middleware chain
- [ ] Every new dependency added is actually used (no leftover installs bloating the bundle)
- [ ] New component follows the 8-step structure order defined above
- [ ] Tailwind classes match the palette table — no off-palette hex colors introduced ad hoc
- [ ] `BUGS.md` updated if anything was debugged during this milestone
