# ARCHITECTURE.md — EventFlow

## Project overview

EventFlow is a merchant-facing booking management dashboard for small tent and catering businesses in India. It allows a business owner to manage bookings, detect conflicts, track advances, and send WhatsApp communications to clients — all from a single interface.

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
| Database | SQLite via `better-sqlite3` (demo) → Postgres on deploy | SQLite for local dev speed; see DEPLOYMENT.md for why this changes at deploy time |
| API layer | REST (JSON) | Simple, no GraphQL overhead needed |
| WhatsApp | `wa.me` deep links | No API key needed, opens WhatsApp with pre-filled text |
| Auth | Single-merchant password + JWT session cookie | Not multi-tenant yet, but the app cannot be left open on the public internet with real client data and no login |
| Validation | `zod` (shared schema, frontend + backend) | One source of truth for what a valid booking looks like |
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
│   │   │   ├── BookingModal.jsx       # New booking form, conflict detection
│   │   │   ├── BookingDetail.jsx      # Right panel, booking info + actions
│   │   │   ├── ConflictBanner.jsx     # Inline red warning on date clash
│   │   │   ├── LoginScreen.jsx        # Single-merchant password gate
│   │   │   ├── AnalyticsView.jsx      # Business analytics screen (revenue, bookings, peak months)
│   │   │   └── UsageView.jsx          # "Your activity" screen — merchant-facing usage summary
│   │   ├── store/
│   │   │   ├── bookingStore.js        # Zustand store, all booking state
│   │   │   └── authStore.js           # Auth/session state
│   │   ├── schemas/
│   │   │   └── booking.schema.js      # Zod schema — shared shape with backend
│   │   ├── utils/
│   │   │   ├── whatsapp.js            # wa.me link generators
│   │   │   ├── conflictCheck.js       # Date overlap detection logic
│   │   │   ├── api.js                 # Single fetch wrapper, attaches auth header
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
│   │   ├── schema.sql                 # Source of truth table definitions
│   │   └── seed.js                    # Seed realistic bookings — dev/demo only, gated by NODE_ENV
│   ├── routes/
│   │   ├── bookings.js                # Booking CRUD + conflict check
│   │   ├── auth.js                    # Login route, issues JWT cookie
│   │   ├── analytics.js               # GET endpoints for revenue/booking aggregates
│   │   └── usage.js                   # GET endpoint for usage summary (merchant-facing + internal)
│   ├── middleware/
│   │   ├── errorHandler.js            # Global error handler — never leaks stack traces in prod
│   │   ├── requireAuth.js             # Verifies JWT cookie on protected routes
│   │   ├── rateLimiter.js             # Throttles login + booking creation endpoints
│   │   ├── validate.js                # Generic zod-validation middleware
│   │   └── trackUsage.js              # Logs an event_log row on every meaningful action
│   ├── schemas/
│   │   └── booking.schema.js          # Same shape as client schema — keep in sync manually, see CODING_STANDARDS.md
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
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE change_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER REFERENCES bookings(id),
  change_note TEXT    NOT NULL,
  logged_at   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE event_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT    NOT NULL,   -- login | booking_created | booking_viewed | whatsapp_confirmation_sent | whatsapp_reminder_sent | change_logged
  metadata    TEXT,               -- optional JSON string with extra context, e.g. booking_id
  created_at  TEXT    DEFAULT (datetime('now'))
);
```

`event_log` is the single source of truth for both the merchant-facing "Your Activity" view and the internal adoption-proof reporting. One table, two consumers — see Usage tracking section below for the distinction.

---

## API routes

| Method | Route | Auth required | Description |
|---|---|---|---|
| POST | `/api/auth/login` | No | Merchant logs in with password, receives JWT in httpOnly cookie |
| POST | `/api/auth/logout` | Yes | Clears session cookie |
| GET | `/api/auth/me` | Yes | Returns current session validity (for frontend route guard) |
| GET | `/api/bookings` | Yes | Return all bookings (for calendar population) |
| POST | `/api/bookings` | Yes | Create new booking (conflict check happens here too) |
| GET | `/api/bookings/:id` | Yes | Single booking detail + change log |
| PATCH | `/api/bookings/:id/log` | Yes | Append a change log entry |
| GET | `/api/bookings/check-conflict?date=YYYY-MM-DD` | Yes | Returns conflicting booking if any |
| GET | `/api/analytics/summary` | Yes | Revenue this month, bookings this month, peak month, total clients |
| GET | `/api/analytics/monthly` | Yes | Bookings + revenue grouped by month — feeds the chart |
| GET | `/api/usage/me` | Yes | Merchant-facing usage summary — logins this week, bookings created, messages sent |
| GET | `/api/usage/admin` | Yes (+ separate dev-only check, see SECURITY.md) | Full event_log feed — for you/the panel, not shown in the merchant UI |

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
**Audience: both.** Pulled from the new `event_log` table, populated by a lightweight `trackUsage` middleware that fires on key actions (login, booking created, WhatsApp button clicked, change logged).

Two views of the same data:
- **Merchant-facing (`UsageView.jsx` / `/api/usage/me`)**: a friendly, simple "Your Activity" card — "You've logged 12 bookings this month, sent 9 WhatsApp confirmations." This is good UX (shows the tool is alive and useful) and also nudges continued use.
- **Internal/panel-facing (`/api/usage/admin`)**: the raw event feed — every login timestamp, every action, unfiltered. This is your **adoption proof** for the panel: it's the evidence that the merchant is genuinely using the PoC, not just that it exists. Don't expose this route in the merchant-facing UI navigation — it's for you to pull data from directly (via API call, a script, or a simple separate page) when preparing a panel update.

This distinction matters because conflating them tends to produce a dashboard that's either too sparse for the merchant or too cluttered with internal metrics they don't care about. Build two clean views from one shared table instead.

---

## Conflict detection logic

Conflict is defined as: **any two bookings sharing the same `event_date`.**

- Frontend checks optimistically on date picker change (calls `/api/bookings/check-conflict?date=`)
- Backend also validates on POST to prevent race conditions
- If conflict found: return `{ conflict: true, booking: { client_name, event_type } }`
- Frontend renders `<ConflictBanner>` with the clashing booking name, date field turns red, submit button disabled

---

## WhatsApp link generation

No API key. No webhook. Pure deep link.

```js
// utils/whatsapp.js
export const confirmationMessage = (booking) =>
  `https://wa.me/91${booking.phone}?text=${encodeURIComponent(
    `Namaskar ${booking.client_name}! Your booking is confirmed for ${booking.event_date}. Event: ${booking.event_type}, Guests: ${booking.guest_count}. Advance received: ₹${booking.advance}. Thank you! - EventFlow`
  )}`;

export const paymentReminderMessage = (booking) =>
  `https://wa.me/91${booking.phone}?text=${encodeURIComponent(
    `Namaskar ${booking.client_name}! This is a reminder that your event is on ${booking.event_date}. Kindly arrange the remaining balance before the event. Thank you! - EventFlow`
  )}`;
```

Clicking the button opens WhatsApp desktop or mobile with the message pre-filled. Works in a screen recording.

---

## Seeded demo data

10 bookings spread across the current month — mix of weddings, birthdays, corporate events. Statuses varied (confirmed, pending). At least 2 bookings on the same date to demonstrate conflict detection during the demo.

Seed runs automatically on server start if the table is empty.

---

## Key UI decisions

- **Dark sidebar (#0f172a), light main canvas (#f8fafc)** — high contrast, professional feel
- **Calendar event cards**: teal for confirmed, amber for advance pending, red for cancelled
- **Modal slides in from right** — does not replace the calendar view, user always sees context
- **Booking detail panel** — opens as a right drawer on calendar event click
- **No routing** — single page, everything is modals and panels. Faster to build, cleaner demo.

---

## What is explicitly out of scope for v1

- Multi-merchant / multi-business support (single merchant per deployment for now)
- Customer-facing portal
- Payment gateway integration (UPI links are just `wa.me` text, not real payment collection)
- Inventory management
- Native mobile app

Business analytics and usage tracking, originally deferred, are now in v1 scope per panel feedback — see the dedicated section above. These are intentionally deferred — not forgotten. See `ROADMAP.md` for what comes after v1 is validated with the real merchant.

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
