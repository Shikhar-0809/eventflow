# ARCHITECTURE.md — EventFlow

## Project overview

EventFlow is a merchant-facing booking management dashboard for small tent and catering businesses in India. It allows a business owner to manage bookings, detect conflicts, track inventory, track advances, and send WhatsApp communications to clients — all from a single interface.

**Business persona:** Bala Ji Tent House. This is the merchant-facing name shown in the Sidebar, document title, and WhatsApp message sign-off — the tool itself is still called EventFlow internally.

**Status: building toward a real, deployed product.** Real merchant data (client names, phone numbers) will be entered. This is no longer throwaway demo code — every file should be written as if it ships. That means: input validation, error handling, basic auth, environment-based config, and no secrets in code.

Scope is still deliberately small (single merchant, no customer portal, no payment gateway) — but the code quality bar is "product," not "prototype."

---

## Tech stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React 18 + Vite | Fast dev server, hot reload, component model |
| Styling | Tailwind CSS v3 | Utility-first, fast to iterate, no CSS files |
| Calendar UI | `@fullcalendar/react` | Production-grade calendar, event rendering built-in |
| State management | Zustand | Lightweight, no boilerplate, easy to reason about |
| Backend | Node.js + Express | Minimal setup, familiar |
| Database | SQLite via `better-sqlite3` (demo) → Postgres on deploy | SQLite for local dev speed; see DEPLOYMENT.md for why this changes at deploy time. Postgres migration (Prompt 15) is deliberately deferred — current build runs on SQLite. |
| API layer | REST (JSON) | Simple, no GraphQL overhead needed |
| WhatsApp | `wa.me` deep links | No API key needed, opens WhatsApp with pre-filled text |
| Auth | Single-merchant password + JWT session cookie | Not multi-tenant yet, but the app cannot be left open on the public internet with real client data and no login |
| Validation | `zod` (shared schema, frontend + backend) | One source of truth for what a valid booking — and a valid inventory item — looks like |
| Charts | `recharts` | Lightweight, composable, good fit for a handful of simple charts — no need for a heavier charting lib at this scale |
| Secrets | `.env` (local) / platform env vars (deploy) | Never committed, see SECURITY.md |

### Why SQLite changes at deploy time
Render/Railway/Vercel free tiers use **ephemeral filesystems** — anything written to disk (including a SQLite `.db` file) can be wiped on every redeploy or restart. This is the single most common way people lose "production" data on free hosting. See `DEPLOYMENT.md` for the Postgres migration path (Neon/Supabase free tier — both give a persistent Postgres DB at no cost).

---

## Folder structure

```
eventflow/
├── client/                        # React frontend (Vite)
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx            # Left nav, quick stats
│   │   │   ├── CalendarView.jsx       # FullCalendar wrapper, main hero
│   │   │   ├── BookingModal.jsx       # Booking form — handles BOTH create and edit mode, conflict + inventory checks
│   │   │   ├── BookingDetail.jsx      # Right panel, booking info + actions + inventory used + Edit button
│   │   │   ├── ConflictBanner.jsx     # Inline alert on date clash (non-blocking)
│   │   │   ├── InventoryWarningBanner.jsx  # Inline alert on inventory shortfall (non-blocking, triggers confirm step on submit)
│   │   │   ├── ConfirmDialog.jsx      # Generic reusable "are you sure?" confirm/cancel dialog — used for inventory override
│   │   │   ├── LoginScreen.jsx        # Single-merchant password gate
│   │   │   ├── AnalyticsView.jsx      # Business analytics screen (revenue, bookings, peak months)
│   │   │   ├── UsageView.jsx          # "Your activity" screen — merchant-facing usage summary
│   │   │   ├── InventoryView.jsx      # Inventory dashboard — available/in-use/damaged per item
│   │   │   ├── InventoryItemCard.jsx  # Single item card (name, total, in-use-today, available)
│   │   │   ├── AddInventoryItemModal.jsx   # Add a new item type / edit total quantity owned
│   │   │   └── DamagedItemsPanel.jsx  # Damaged/repair-needed section — mark damaged, mark repaired
│   │   ├── store/
│   │   │   ├── bookingStore.js        # Zustand store, all booking state
│   │   │   ├── authStore.js           # Auth/session state
│   │   │   └── inventoryStore.js      # Zustand store, all inventory item state
│   │   ├── schemas/
│   │   │   ├── booking.schema.js      # Zod schema — shared shape with backend; includes optional inventory array
│   │   │   └── inventory.schema.js    # Zod schema — shared shape with backend, for inventory items and damage adjustments
│   │   ├── utils/
│   │   │   ├── whatsapp.js            # wa.me link generators — signed as "Bala Ji Tent House"
│   │   │   ├── conflictCheck.js       # Date overlap detection logic
│   │   │   ├── api.js                 # Single fetch wrapper, attaches auth header
│   │   │   ├── formatCurrency.js      # ₹ formatting helper, Indian numbering
│   │   │   └── sanitize.js            # Strip/escape input before render or send
│   │   ├── hooks/
│   │   │   └── useBookings.js         # Fetch + cache bookings from API
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css                  # Tailwind directives only
│   ├── .env.example                   # VITE_API_URL=...
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── server/                        # Express backend
│   ├── db/
│   │   ├── database.js                # DB connection (SQLite local / Postgres prod)
│   │   ├── schema.sql                 # Source of truth table definitions — includes inventory_items, booking_inventory, inventory_damage_log
│   │   └── seed.js                    # Seed realistic bookings + starter inventory — dev/demo only, gated by NODE_ENV
│   ├── routes/
│   │   ├── bookings.js                # Booking CRUD (create + edit) + conflict check
│   │   ├── auth.js                    # Login route, issues JWT cookie
│   │   ├── analytics.js               # GET endpoints for revenue/booking aggregates
│   │   ├── usage.js                   # GET endpoint for usage summary (merchant-facing + internal)
│   │   └── inventory.js               # Inventory CRUD, damage/repair adjustments, per-date availability check
│   ├── middleware/
│   │   ├── errorHandler.js            # Global error handler — never leaks stack traces in prod
│   │   ├── requireAuth.js             # Verifies JWT cookie on protected routes
│   │   ├── rateLimiter.js             # Throttles login + booking creation endpoints
│   │   ├── validate.js                # Generic zod-validation middleware
│   │   └── trackUsage.js              # Logs an event_log row on every meaningful action
│   ├── schemas/
│   │   ├── booking.schema.js          # Same shape as client schema — keep in sync manually, see CODING_STANDARDS.md
│   │   └── inventory.schema.js        # Same shape as client schema, server source of truth
│   ├── .env.example                   # JWT_SECRET, DATABASE_URL, MERCHANT_PASSWORD_HASH, NODE_ENV, CORS_ORIGIN
│   └── index.js                       # Express app entry point
│
├── .gitignore                     # node_modules, .env, *.db, dist/
├── package.json                   # Root package with workspaces
├── README.md
├── ARCHITECTURE.md
├── CODING_STANDARDS.md
├── PROMPTS.md
├── BUGS.md
├── SECURITY.md
├── DEPLOYMENT.md
├── DATA_PRIVACY.md
├── TESTING.md
├── RUNBOOK.md
└── ROADMAP.md
```

---

## Data model

### Bookings table (SQLite)

```sql
CREATE TABLE bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  event_type  TEXT    NOT NULL,   -- wedding | birthday | corporate | other
  event_date  TEXT    NOT NULL,   -- ISO date string YYYY-MM-DD
  guest_count INTEGER NOT NULL,
  venue       TEXT,
  advance     INTEGER DEFAULT 0,  -- amount in INR
  total       INTEGER DEFAULT 0,
  status      TEXT    DEFAULT 'confirmed', -- confirmed | pending | cancelled
  notes       TEXT,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))   -- set on every edit, see Prompt 18
);

CREATE TABLE change_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER REFERENCES bookings(id),
  change_note TEXT    NOT NULL,
  logged_at   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE event_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT    NOT NULL,   -- login | booking_created | booking_edited | booking_viewed | whatsapp_confirmation_sent | whatsapp_reminder_sent | change_logged
  metadata    TEXT,               -- optional JSON string with extra context, e.g. booking_id
  created_at  TEXT    DEFAULT (datetime('now'))
);
```

### Inventory tables (new)

```sql
CREATE TABLE inventory_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE,   -- e.g. "Plastic Chairs", "Round Tables", "3-Seater Sofas", "Shamiana Tent (20x30)"
  total_quantity   INTEGER NOT NULL DEFAULT 0,   -- total ever owned — does not change when items are marked damaged
  damaged_quantity INTEGER NOT NULL DEFAULT 0,   -- currently out of service, see inventory_damage_log for history
  created_at       TEXT    DEFAULT (datetime('now'))
);

-- "Available right now" is a computed value, not a column:
--   usable   = total_quantity - damaged_quantity
--   in_use_today = SUM(booking_inventory.quantity) for bookings on today's event_date, status != 'cancelled'
--   available = usable - in_use_today

CREATE TABLE booking_inventory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER NOT NULL REFERENCES bookings(id),
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE inventory_damage_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  change      INTEGER NOT NULL,   -- positive = marked damaged, negative = marked repaired/back in service
  note        TEXT,               -- optional free text, e.g. "torn in transit"
  logged_at   TEXT DEFAULT (datetime('now'))
);
```

`event_log` is the single source of truth for both the merchant-facing "Your Activity" view and the internal adoption-proof reporting. One table, two consumers — see Usage tracking section below for the distinction.

`inventory_damage_log` mirrors `change_log`'s pattern (an append-only audit trail) rather than just mutating `damaged_quantity` silently — useful both for debugging ("why does this say 12 damaged?") and because it's the kind of thing a merchant might ask about later.

---

## API routes

| Method | Route | Auth required | Description |
|---|---|---|---|
| POST | `/api/auth/login` | No | Merchant logs in with password, receives JWT in httpOnly cookie |
| POST | `/api/auth/logout` | Yes | Clears session cookie |
| GET | `/api/auth/me` | Yes | Returns current session validity (for frontend route guard) |
| GET | `/api/bookings` | Yes | Return all bookings (for calendar population) |
| POST | `/api/bookings` | Yes | Create new booking (conflict + inventory checks happen here too — alert only, never blocks) |
| GET | `/api/bookings/:id` | Yes | Single booking detail + change log + inventory attached |
| PATCH | `/api/bookings/:id` | Yes | **Edit an existing booking** (new) — same validation as create; conflict/inventory checks exclude the booking's own existing rows |
| PATCH | `/api/bookings/:id/log` | Yes | Append a change log entry |
| GET | `/api/bookings/check-conflict?date=YYYY-MM-DD&excludeId=` | Yes | Returns conflicting booking if any. `excludeId` optional, used when editing so a booking doesn't flag itself |
| GET | `/api/analytics/summary` | Yes | Revenue this month, bookings this month, peak month, total clients |
| GET | `/api/analytics/monthly` | Yes | Bookings + revenue grouped by month — feeds the chart |
| GET | `/api/usage/me` | Yes | Merchant-facing usage summary — logins this week, bookings created, messages sent |
| GET | `/api/usage/admin` | Yes (+ separate dev-only check, see SECURITY.md) | Full event_log feed — for you/the panel, not shown in the merchant UI |
| GET | `/api/inventory` | Yes | All inventory items with computed `usable`, `in_use_today`, `available`, `damaged_quantity` |
| POST | `/api/inventory` | Yes | Add a new inventory item type `{ name, total_quantity }` |
| PATCH | `/api/inventory/:id` | Yes | Update an item's `total_quantity` (e.g. bought more chairs) |
| POST | `/api/inventory/:id/damage` | Yes | `{ change: +N or -N, note }` — mark N units damaged (positive) or repaired (negative). Clamped so `damaged_quantity` never goes below 0 or above `total_quantity`. Writes a row to `inventory_damage_log` |
| POST | `/api/inventory/check-availability` | Yes | `{ date, items: [{ item_id, quantity }], excludeBookingId? }` → `{ sufficient: boolean, shortfalls: [{ item_id, name, requested, available }] }`. `excludeBookingId` used when editing a booking so its own existing inventory rows for that date aren't double-counted against itself |

All routes except login are behind `requireAuth` middleware. See SECURITY.md for the auth model in full.

---

## Environment variables

**Server (`server/.env`)** — never committed, see `.env.example` for placeholder keys:

```
NODE_ENV=development
PORT=3001
DATABASE_URL=             # empty in dev (uses local SQLite file), set in prod (Postgres connection string)
JWT_SECRET=                # long random string, generate with: openssl rand -base64 32
MERCHANT_PASSWORD_HASH=    # bcrypt hash, never the plaintext password
CORS_ORIGIN=http://localhost:5173
SESSION_COOKIE_NAME=eventflow_session
```

**Client (`client/.env`)**:

```
VITE_API_URL=http://localhost:3001/api
```

Full setup instructions for generating these values are in SECURITY.md.

---

## Analytics vs. Usage tracking — two different things, don't conflate them

These were both requested by the panel but they answer different questions and have different audiences. Keep them architecturally separate even though they share the UI pattern (a dashboard with cards/charts).

### Business analytics — "How is the merchant's business doing"
**Audience: the merchant.** Pulled entirely from the `bookings` table.
- Revenue this month vs last month
- Total bookings this month
- Peak booking month (last 6 months)
- Total unique clients
- Simple bar/line chart: bookings per month

This answers the merchant's own question — the one named in the very first brainstorm ("zero business visibility").

### Usage analytics — "Is the merchant actually using EventFlow, and how"
**Audience: both.** Pulled from the `event_log` table, populated by a lightweight `trackUsage` middleware that fires on key actions (login, booking created, booking edited, WhatsApp button clicked, change logged).

Two views of the same data:
- **Merchant-facing (`UsageView.jsx` / `/api/usage/me`)**: a friendly, simple "Your Activity" card — "You've logged 12 bookings this month, sent 9 WhatsApp confirmations." This is good UX (shows the tool is alive and useful) and also nudges continued use.
- **Internal/panel-facing (`/api/usage/admin`)**: the raw event feed — every login timestamp, every action, unfiltered. This is your **adoption proof** for the panel. Don't expose this route in the merchant-facing UI navigation.

This distinction matters because conflating them tends to produce a dashboard that's either too sparse for the merchant or too cluttered with internal metrics they don't care about. Build two clean views from one shared table instead.

---

## Conflict detection logic

Conflict is defined as: **any two bookings sharing the same `event_date`.**

This is **alert-only, never blocking.** Two bookings on the same date may be entirely fine for this merchant to take on — the app's job is to make sure they notice, not to decide for them.

- Frontend checks optimistically on date picker change (calls `/api/bookings/check-conflict?date=`)
- Backend also validates on POST/PATCH, to surface the same alert even if the frontend missed a race condition
- If conflict found: return `{ conflict: true, booking: { client_name, event_type } }`
- Frontend renders `<ConflictBanner>` with the clashing booking's name. The date field gets a red border as a visual flag. **The submit button stays enabled** — the merchant can confirm the booking immediately, no extra confirmation step needed for a date clash specifically (see Inventory availability logic below for why inventory shortfalls get a stricter pattern)
- When editing a booking, the conflict check passes `excludeId` so a booking never flags a clash against its own pre-existing record

---

## Inventory availability logic

Availability is **per event date**, computed the same way the date-clash conflict check already works — sum what's already committed to *other* bookings on that exact date, not across the merchant's whole future calendar. This deliberately avoids needing real deploy/return tracking (see `ROADMAP.md` v2): physically, items come back after each event, so a chair shortage on June 25 says nothing about chair availability on June 30.

For a given item and date:
```
usable        = total_quantity - damaged_quantity
committed     = SUM(booking_inventory.quantity)
                 across bookings sharing this event_date,
                 status != 'cancelled',
                 excluding the booking currently being edited (if any)
available     = usable - committed
shortfall     = requested_quantity - available   (if > 0, insufficient)
```

UX, deliberately **stricter than the date-clash alert** because a physical shortage is a more concrete operational problem:
1. While filling the booking form, as the merchant enters quantities needed per item, the frontend calls `/api/inventory/check-availability` and shows an inline `<InventoryWarningBanner>` for any item that's short, with the requested vs. available counts
2. On submit, if a shortfall still exists, the app does **not** submit immediately — it shows a `<ConfirmDialog>` ("You don't have enough Plastic Chairs for this date — need 150, only 100 available. Confirm this booking anyway?") and only calls the create/edit API if the merchant explicitly confirms
3. If the merchant cancels the dialog, they stay on the form to adjust quantities or the date
4. The backend re-checks availability on POST/PATCH regardless (same race-condition-is-advisory-only posture as the date-conflict check — acceptable for a single merchant typing manually, see `BUGS.md`)

The Inventory dashboard itself (`InventoryView.jsx`) shows `in_use_today` using **today's date**, not the date of any particular booking being created — it's read as "what's out of the warehouse right now."

---

## WhatsApp link generation

No API key. No webhook. Pure deep link. Messages are signed as **Bala Ji Tent House**, not EventFlow — the message is on the merchant's behalf.

```js
// utils/whatsapp.js
export const confirmationMessage = (booking) =>
  `https://wa.me/91${booking.phone}?text=${encodeURIComponent(
    `Namaskar ${booking.client_name}! Your booking is confirmed for ${booking.event_date}. Event: ${booking.event_type}, Guests: ${booking.guest_count}. Advance received: ₹${booking.advance}. Thank you! - Bala Ji Tent House`
  )}`;

export const paymentReminderMessage = (booking) =>
  `https://wa.me/91${booking.phone}?text=${encodeURIComponent(
    `Namaskar ${booking.client_name}! This is a reminder that your event is on ${booking.event_date}. Kindly arrange the remaining balance before the event. Thank you! - Bala Ji Tent House`
  )}`;
```

Clicking the button opens WhatsApp desktop or mobile with the message pre-filled. Works in a screen recording.

---

## Seeded demo data

10 bookings spread across the current month — mix of weddings, birthdays, corporate events. Statuses varied (confirmed, pending). At least 2 bookings on the same date to demonstrate conflict detection during the demo.

A starter inventory set is seeded alongside bookings: Plastic Chairs, Round Tables, Shamiana Tents, Sofas, Generators, Decorative Lights — realistic quantities, with a couple of bookings pre-attached to inventory and at least one item with a small damaged count so the Damaged section isn't empty on first load.

Seed runs automatically on server start if the table is empty.

---

## Key UI decisions

- **Dark sidebar (#0f172a), light main canvas (#f8fafc)** — high contrast, professional feel
- **Sidebar business name: "Bala Ji Tent House"**, tent icon, white bold text
- **Calendar event cards**: teal for confirmed, amber for advance pending, red for cancelled
- **Modal slides in from right** — does not replace the calendar view, user always sees context
- **`BookingModal` is shared between create and edit** — same form, different title/submit label/initial values, to avoid duplicating the validation and inventory-check logic in two places
- **Booking detail panel** — opens as a right drawer on calendar event click; includes an "Edit" button that opens `BookingModal` in edit mode pre-filled with that booking's data
- **Inventory dashboard** — reachable from the Sidebar (previously a greyed-out placeholder, now active), cards per item type, separate Damaged/Repair Needed section below the main grid
- **No routing** — single page, everything is modals and panels. Faster to build, cleaner demo.

---

## What is explicitly out of scope for v1

- Multi-merchant / multi-business support (single merchant per deployment for now)
- Customer-facing portal
- Payment gateway integration (UPI links are just `wa.me` text, not real payment collection)
- True deploy/return tracking for inventory (availability is computed per event date instead — see Inventory availability logic above and `ROADMAP.md` v2)
- Native mobile app

Business analytics, usage tracking, and inventory tracking, originally deferred, are now in v1 scope per panel feedback and a direct merchant request — see the dedicated sections above. See `ROADMAP.md` for what's still deferred and why.

## Related documents

| File | Purpose |
|---|---|
| `CODING_STANDARDS.md` | Naming, structure, style conventions |
| `PROMPTS.md` | Sequenced Cursor build prompts |
| `BUGS.md` | Bug tracker + prevention checklist |
| `SECURITY.md` | Auth model, input validation, audit checklist per milestone |
| `DEPLOYMENT.md` | How and where this gets deployed, with config per platform |
| `DATA_PRIVACY.md` | How real client data (names, phone numbers) is handled — DPDP Act context |
| `TESTING.md` | What gets tested before each milestone ships |
| `RUNBOOK.md` | What to do when something breaks in production |
| `ROADMAP.md` | What's deferred from v1 and why |
