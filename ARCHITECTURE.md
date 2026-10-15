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
| Styling | Tailwind CSS v3 | Utility-first, fast to iterate; FullCalendar overrides live in `index.css` |
| Calendar UI | `@fullcalendar/react` | Production-grade calendar, event rendering built-in |
| State management | Zustand | Lightweight, no boilerplate, easy to reason about |
| Backend | Node.js + Express | Minimal setup, familiar |
| Database | Postgres via `pg` | Persistent DB for deploy (ephemeral filesystems wipe SQLite). Local and prod both use Postgres via `DATABASE_URL`. |
| API layer | REST (JSON) | Simple, no GraphQL overhead needed |
| WhatsApp | `wa.me` deep links | No API key needed, opens WhatsApp with pre-filled text |
| Auth | Per-merchant email + password (bcrypt), self-service sign-up, JWT session cookie `{ merchant_id }` | The app cannot be left open on the public internet with real client data and no login; each merchant only ever reaches their own rows |
| Validation | `zod` (shared schema, frontend + backend) | One source of truth for what a valid booking — and a valid inventory item — looks like |
| Charts | `recharts` | Lightweight, composable, good fit for a handful of simple charts — no need for a heavier charting lib at this scale |
| Records export | SheetJS (`xlsx`) | Client-side `.xlsx` export from the Records screen |
| Printable reports / PDF | Printable HTML window + jsPDF + html2canvas loaded via CDN | Date-range report from Analytics; PDF download without bundling those libs |
| Secrets | `.env` (local) / platform env vars (deploy) | Never committed, see SECURITY.md |

### Why Postgres (not SQLite on disk)
Render/Railway/Vercel free tiers use **ephemeral filesystems** — anything written to disk (including a SQLite `.db` file) can be wiped on every redeploy or restart. EventFlow therefore uses **Postgres via `pg`** everywhere (`DATABASE_URL`). See `DEPLOYMENT.md` for Neon/Supabase + Render + Vercel topology.

### Production `/api` proxy (Vercel → Render)
In production the browser uses same-origin `/api` (`client/.env.production`: `VITE_API_URL=/api`). Vercel rewrites `/api/:path*` to the Render API host so the session cookie stays first-party. See SECURITY.md and DEPLOYMENT.md.

**Request path (production):** browser -> Vercel (root `vercel.json`: a `routes` transform sets `x-proxy-secret` from the `PROXY_SHARED_SECRET` env var, then the `/api/:path*` rewrite proxies to Render) -> Cloudflare -> Render load balancer -> Express. Express has `trust proxy` = 4 and, in production, `requireProxySecret` rejects any request without the right `x-proxy-secret` (403) except `GET /api/health`. Direct requests to the Render URL are therefore refused.

---

## Folder structure

```
eventflow/
├── client/                        # React frontend (Vite)
│   ├── index.html                 # HTML shell; title "EventFlow — Bala Ji Tent House"
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   ├── .env.example               # VITE_API_URL, VITE_MERCHANT_PHONE
│   ├── .env.production            # VITE_API_URL=/api
│   └── src/
│       ├── App.jsx                # Auth gate, view switcher, mobile shell
│       ├── main.jsx
│       ├── index.css              # Tailwind directives + FullCalendar overrides + keyframes
│       ├── components/
│       │   ├── AddInventoryItemModal.jsx
│       │   ├── AnalyticsView.jsx          # Charts, target, date-range report
│       │   ├── BookingDetail.jsx          # Booking overlay: WhatsApp, expenses, status, delete
│       │   ├── BookingPage.jsx            # Create/edit booking form
│       │   ├── CalendarView.jsx           # FullCalendar + search + morning briefing
│       │   ├── ConfirmDialog.jsx
│       │   ├── ConflictBanner.jsx         # Inline alert on date clash (non-blocking)
│       │   ├── DamagedItemsPanel.jsx
│       │   ├── InventoryItemCard.jsx
│       │   ├── InventoryView.jsx
│       │   ├── InventoryWarningBanner.jsx # Inline alert on shortfall; confirm step on submit
│       │   ├── LoginScreen.jsx            # Email + password login, link to sign-up
│       │   ├── PendingBalancesView.jsx
│       │   ├── RecordsView.jsx            # Filterable records + Excel export
│       │   ├── SignupScreen.jsx           # Business name, email, password, confirm; validates on blur
│       │   ├── PasswordInput.jsx          # Password field with show/hide toggle (login, sign-up)
│       │   ├── PrivacyPolicyPage.jsx      # Public policy at /privacy, rendered by App.jsx before the auth gate
│       │   ├── NotFoundPage.jsx           # Any path other than / and /privacy (rendered by App.jsx before the auth gate)
│       │   ├── ScreenBoundary.jsx         # Suspense + error boundary for lazy screens (Loading..., "Couldn't load this screen")
│       │   ├── Sidebar.jsx
│       │   └── UsageView.jsx
│       ├── schemas/
│       │   ├── booking.schema.js
│       │   ├── inventory.schema.js
│       │   └── merchant.schema.js         # signupSchema, loginSchema (mirror of the server file)
│       ├── store/
│       │   ├── authStore.js
│       │   ├── bookingStore.js
│       │   ├── inventoryStore.js
│       │   └── settingsStore.js           # Monthly revenue target
│       └── utils/
│           ├── api.js
│           ├── dateHelpers.js
│           ├── excelExporter.js           # SheetJS .xlsx export
│           ├── formatCurrency.js
│           ├── formatRelativeTime.js
│           ├── reportPrinter.js           # Printable HTML report (+ PDF via CDN)
│           ├── sanitize.js
│           └── whatsapp.js                # wa.me links — signed as "Bala Ji Tent House"
│
├── server/                        # Express backend
│   ├── index.js                   # Express entry: CORS, mounts, initDb+seed, listen
│   ├── package.json
│   ├── .env.example               # JWT_SECRET, DATABASE_URL, ADMIN_ACCESS_KEY, PROXY_SHARED_SECRET, …
│   ├── db/
│   │   ├── database.js            # pg Pool + production-database guard; initDb() runs the migrations
│   │   ├── migrate.js             # Migration runner: advisory lock, one transaction per file, ids-only output
│   │   ├── migrations/            # SCHEMA SOURCE OF TRUTH: 001_baseline.sql, 002_multi_merchant.sql, ...
│   │   ├── seed.js                # Dev seed orchestrator (production-gated, per merchant)
│   │   ├── seedMerchants.js       # Merchant ids used by the dev seeds
│   │   ├── devMerchantSeed.js     # Dev-only second demo merchant "Shree Ganesh Caterers" (Raipur caterer: 6 months of bookings, equipment, damage, expenses)
│   │   ├── demoActivitySeed.js    # Dev-only: keeps a week of "My Activity" events fresh for each demo merchant (refreshes daily on boot)
│   │   ├── demoSeed.js
│   │   ├── demoAnalyticsSeed.js
│   │   └── analyticsHistorySeed.js
│   ├── middleware/
│   │   ├── errorHandler.js        # Never returns stack traces or err.message in production
│   │   ├── rateLimiter.js
│   │   ├── requireAuth.js
│   │   ├── requireAdminKey.js
│   │   ├── trackUsage.js
│   │   └── validate.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── bookings.js
│   │   ├── inventory.js
│   │   ├── analytics.js
│   │   ├── usage.js
│   │   ├── settings.js            # merchant_settings get/patch
│   │   ├── reports.js             # Date-range report
│   │   └── records.js             # Filtered booking records
│   ├── schemas/
│   │   ├── booking.schema.js
│   │   ├── inventory.schema.js
│   │   ├── merchant.schema.js     # signupSchema, loginSchema
│   │   ├── records.schema.js
│   │   └── settings.schema.js
│   └── scripts/                   # Verify/cleanup/wipe helpers
│       └── lib/                   # Shared verify helpers
│
├── .gitignore
├── package.json                   # Root package with workspaces
├── vercel.json                    # The ONLY Vercel config (project root = repo root): build, /api rewrite to Render, SPA fallback, security headers, x-proxy-secret transform
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

**The schema lives in `server/db/migrations/`** (numbered SQL files, each applied once, in order). `initDb()` calls `runMigrations()` (`server/db/migrate.js`) on every boot; applied ids are recorded in `schema_migrations (id, applied_at)`. The runner takes a transaction-scoped advisory lock (safe through Neon's pooled endpoint), runs each file in its own transaction, and throws on failure so the server refuses to start on a half-migrated database. A database that already has the `bookings` table but no `schema_migrations` adopts `001_baseline` without running it, after checking it really is at the baseline: required columns, `ON DELETE CASCADE` on the booking foreign keys, and the CHECK constraints (`booking_inventory_quantity_check`, `booking_expenses_amount_check`, `bookings_status_check`). A missing CHECK that a later migration repairs (today only `bookings_status_check`, repaired by `003`) is reported as known drift and allowed; anything else missing is refused and the server does not start. Run it by hand with `npm run migrate -- --confirm-host=<host>` from `server/` (no seeds; prints migration ids only; production also needs `NODE_ENV=production` and `--i-really-mean-production`). Rules for writing migrations are in `CODING_STANDARDS.md`. Connection: `pg.Pool` with `connectionString: process.env.DATABASE_URL`; SSL when `NODE_ENV === 'production'`.

**Multi-merchant.** `merchants` (`id`, `business_name`, `owner_name`, `whatsapp_phone`, `city`, `created_at`, plus `email` and `password_hash` from migration `005_merchant_accounts`) is the tenant table. `email` is stored lowercased and is unique case-insensitively (`merchants_email_lower_key` on `lower(email)`); both credential columns are nullable, and a merchant with no `password_hash` cannot log in. Merchant 1 is Bala Ji Tent House (all pre-existing data); in production it has no credentials until the owner sets them (BUGS #068). Dev seeds give merchants 1 (Bala Ji Tent House) and 2 (Shree Ganesh Caterers) demo logins (`db/seedMerchants.js`, never run in production). The two have deliberately different data: merchant 1 is a tent house with chairs, tables, tents and sofas and venues across many cities; merchant 2 is a Raipur caterer with burners, degchi, chafing dishes and buffet counters, plus six months of history, a date clash, damaged stock and expenses. `scripts/delete-test-merchant.mjs` removes a throwaway merchant and its rows (`--confirm-host`, `--merchant-id`, `--expect-name`; it refuses merchant 1 and the demo merchants). Every business table (`bookings`, `change_log`, `booking_inventory`, `inventory_items`, `inventory_damage_log`, `booking_expenses`, `event_log`, `merchant_settings`) has `merchant_id INTEGER NOT NULL REFERENCES merchants(id)`. Child rows are tied to their parent's merchant at the database level by composite foreign keys, so a cross-merchant link is impossible: `(booking_id, merchant_id) → bookings (id, merchant_id)` on `change_log`, `booking_expenses` and `booking_inventory` (`ON DELETE CASCADE`), and `(item_id, merchant_id) → inventory_items (id, merchant_id)` on `booking_inventory` and `inventory_damage_log`. `inventory_items` is unique on `(merchant_id, name)`; `merchant_settings` has `PRIMARY KEY (merchant_id, key)`. Every route scopes its queries to `req.merchantId` (from the JWT); the temporary `DEFAULT 1` is removed by migration `004_drop_merchant_defaults`. `GET /api/usage/admin` is the one cross-merchant read (admin key) and takes an optional `?merchant_id=` filter. See SECURITY.md, "Tenant isolation". The column listings below predate `merchant_id`; read them as having one more column.

### `bookings`

```sql
CREATE TABLE bookings (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_name       TEXT    NOT NULL,
  phone             TEXT    NOT NULL,
  event_type        TEXT    NOT NULL,   -- wedding | birthday | corporate | other
  event_type_custom TEXT,               -- label when event_type = 'other'
  event_date        TEXT    NOT NULL,   -- ISO date string YYYY-MM-DD
  guest_count       INTEGER NOT NULL,
  venue             TEXT,
  advance           INTEGER DEFAULT 0,  -- amount in INR
  total             INTEGER DEFAULT 0,
  subtotal          INTEGER NOT NULL DEFAULT 0,
  discount          INTEGER NOT NULL DEFAULT 0,
  grand_total       INTEGER NOT NULL DEFAULT 0,
  status            TEXT    DEFAULT 'confirmed',
                    -- CHECK IN ('confirmed','pending','cancelled','completed')
  notes             TEXT,
  created_at        TEXT    DEFAULT NOW(),
  updated_at        TEXT    DEFAULT NOW()
);
```

### `change_log`

```sql
CREATE TABLE change_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id  INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  change_note TEXT    NOT NULL,
  logged_at   TEXT    DEFAULT NOW()
);
```

### `event_log`

```sql
CREATE TABLE event_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  TEXT    NOT NULL,
              -- login | booking_created | booking_edited | booking_viewed |
              -- whatsapp_confirmation_sent | whatsapp_reminder_sent | change_logged | …
  metadata    TEXT,   -- optional JSON string; booking_id only — never client_name or phone
  created_at  TEXT    DEFAULT NOW()
);
```

`event_log` is the single source of truth for both the merchant-facing "Your Activity" view and the internal adoption-proof reporting. One table, two consumers — see Usage tracking section below for the distinction. **Never store PII in `metadata`** — see DATA_PRIVACY.md.

### Inventory tables

```sql
CREATE TABLE inventory_items (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT    NOT NULL UNIQUE,
  total_quantity   INTEGER NOT NULL DEFAULT 0,
  damaged_quantity INTEGER NOT NULL DEFAULT 0,
  unit_price       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    DEFAULT NOW()
);

-- "Available right now" is a computed value, not a column:
--   usable   = total_quantity - damaged_quantity
--   in_use_today = SUM(booking_inventory.quantity) for bookings on today's event_date, status != 'cancelled'
--   available = usable - in_use_today

CREATE TABLE booking_inventory (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  INTEGER NOT NULL DEFAULT 0,
  line_total  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE inventory_damage_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  change      INTEGER NOT NULL,   -- positive = marked damaged, negative = marked repaired
  note        TEXT,
  logged_at   TEXT DEFAULT NOW()
);
```

### `merchant_settings`

```sql
CREATE TABLE merchant_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Used for keys such as `monthly_revenue_target`.

### `booking_expenses`

```sql
CREATE TABLE booking_expenses (
  id          SERIAL PRIMARY KEY,
  booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

`inventory_damage_log` mirrors `change_log`'s pattern (an append-only audit trail) rather than just mutating `damaged_quantity` silently — useful both for debugging and because it's the kind of thing a merchant might ask about later.

---

## API routes

Global: `Cache-Control: no-store` on `/api/*`. ETag disabled. Errors → `errorHandler` → `{ error }`.

| Method | Route | Auth required | Description |
|---|---|---|---|
| GET | `/api/health` | **No** (intentional; returns `{ status: 'ok' }` only — no data) | Liveness check |
| POST | `/api/auth/signup` | No | `{ business_name, email, password }` (zod). Creates the merchant (bcrypt cost 10), logs them in (same cookie as login), `201 { authenticated, merchant: { business_name } }`. `409` if the email exists. Rate limited by `signupRateLimiter` |
| POST | `/api/auth/login` | No | `{ email, password }`. Looks the merchant up by email, `bcrypt.compare`, receives a JWT `{ merchant_id }` in an httpOnly cookie. `401 "Incorrect email or password."` for an unknown email and a wrong password alike. Every other route resolves `req.merchantId` from the token |
| POST | `/api/auth/logout` | Yes | Clears session cookie |
| GET | `/api/auth/me` | Yes | Session validity for the frontend route guard, plus `merchant: { business_name }` for the Sidebar |
| GET | `/api/bookings` | Yes | Return all bookings (for calendar population) |
| GET | `/api/bookings/check-conflict?date=YYYY-MM-DD&excludeId=` | Yes | Returns conflicting booking if any. `excludeId` optional when editing |
| GET | `/api/bookings/pending-balances` | Yes | Outstanding balances (confirmed/pending, balance > 0, upcoming) |
| GET | `/api/bookings/:id` | Yes | Single booking + change_log + inventory + expenses |
| POST | `/api/bookings` | Yes | Create booking (conflict + inventory checks are alert-only, never block) |
| PATCH | `/api/bookings/:id` | Yes | Edit booking — same validation as create; conflict/inventory checks exclude own rows |
| PATCH | `/api/bookings/:id/log` | Yes | Append a change log entry |
| POST | `/api/bookings/:id/expenses` | Yes | Add a per-booking expense |
| DELETE | `/api/bookings/:id/expenses/:expenseId` | Yes | Delete an expense |
| PATCH | `/api/bookings/:id/status` | Yes | Update status (`confirmed` \| `pending` \| `cancelled` \| `completed`) |
| DELETE | `/api/bookings/:id` | Yes | Delete booking (CASCADE cleans children) |
| GET | `/api/inventory` | Yes | All items with computed `usable`, `in_use_today`, `available`, `damaged_quantity` |
| POST | `/api/inventory` | Yes | Add inventory item |
| PATCH | `/api/inventory/:id` | Yes | Update `total_quantity` |
| PATCH | `/api/inventory/:id/price` | Yes | Update item `unit_price` |
| POST | `/api/inventory/:id/damage` | Yes | Mark damaged (+) or repaired (−). Clamped so `damaged_quantity` never goes below 0 or above `total_quantity`. Writes `inventory_damage_log` |
| DELETE | `/api/inventory/:id` | Yes | Delete item (and related rows) |
| POST | `/api/inventory/check-availability` | Yes | Per-date shortfall check; advisory only |
| GET | `/api/analytics/summary` | Yes | Revenue this month, bookings this month, peak month, total clients |
| GET | `/api/analytics/monthly` | Yes | Bookings + revenue by month — feeds the chart |
| POST | `/api/usage/log-client-action` | Yes | Log client-side actions (e.g. WhatsApp clicks) into `event_log` |
| GET | `/api/usage/me` | Yes | Merchant-facing weekly usage summary |
| GET | `/api/usage/admin` | Yes + `requireAdminKey` | Full event_log feed — not shown in merchant UI |
| GET | `/api/settings` | Yes | Read `merchant_settings` (e.g. monthly revenue target) |
| PATCH | `/api/settings` | Yes | Update settings (validated) |
| GET | `/api/reports/range` | Yes | Date-range report summary + bookings |
| GET | `/api/records` | Yes | Filtered booking records for the Records screen / Excel export |

All **business** routes require `requireAuth`. The only intentional unauthenticated routes are `POST /api/auth/signup`, `POST /api/auth/login` and `GET /api/health` (no data). See SECURITY.md for the full auth matrix.

---

## Environment variables

**Server (`server/.env`)** — never committed, see `.env.example` for placeholder keys:

```
NODE_ENV=development
PORT=3001
DATABASE_URL=              # Postgres connection string (required — app uses pg Pool)
JWT_SECRET=                # long random string, generate with: openssl rand -base64 32
CORS_ORIGIN=http://localhost:5173
SESSION_COOKIE_NAME=eventflow_session
ADMIN_ACCESS_KEY=          # for GET /api/usage/admin (x-admin-key header)
PROXY_SHARED_SECRET=       # production only; also set as a server-side (non-VITE_) Vercel env var
```

Required at boot: `JWT_SECRET`, `SESSION_COOKIE_NAME` (plus `PROXY_SHARED_SECRET` in production). `MERCHANT_PASSWORD_HASH` no longer exists: logins are per merchant, in the `merchants` table.

**Client (`client/.env`)**:

```
VITE_API_URL=http://localhost:3001/api
VITE_MERCHANT_PHONE=       # merchant WhatsApp number for self-summary / reminder links
```

In production (`client/.env.production`): `VITE_API_URL=/api` (same-origin; Vercel proxies to Render).

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
- Monthly revenue target (`merchant_settings`) and date-range printable report

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
- If conflict found: return `{ conflict: true, booking: { client_name, event_type } }` (or the informational `conflict: { detected, booking }` shape on create/edit responses)
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

No API key. No webhook. Pure deep link. Messages are signed as **Bala Ji Tent House**, not EventFlow — the message is on the merchant's behalf. Merchant phone for self-summary links comes from `VITE_MERCHANT_PHONE` (env), not a hardcoded literal.

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

A starter inventory set is seeded alongside bookings: Plastic Chairs, Round Tables, Shamiana Tents, Sofas — realistic quantities, with a couple of bookings pre-attached to inventory and at least one item with a small damaged count so the Damaged section isn't empty on first load. Additional analytics history and Meerut-heavy demo rows come from `analyticsHistorySeed.js` / `demoAnalyticsSeed.js` when not in production.

Seed runs automatically on server start if the table is empty — **gated by `NODE_ENV !== 'production'`**.

---

## Key UI decisions

- **Dark sidebar (#0f172a), light main canvas (#f8fafc)** — high contrast, professional feel
- **Sidebar business name: "Bala Ji Tent House"**, tent icon, white bold text
- **Calendar event cards**: teal for confirmed, amber for pending, red for cancelled, indigo for completed
- **`BookingPage` is shared between create and edit** — same form, different title/submit label/initial values
- **Booking detail** — opens as a fixed overlay modal (not an in-main drawer) on calendar event click; WhatsApp, expenses/profit, status (including complete/cancel), change log, delete
- **Sidebar views**: Calendar, Inventory, Pending Balances, Records, Analytics, My Activity
- **Records** — filterable list + SheetJS Excel export (`excelExporter.js`)
- **Analytics** — charts, monthly revenue target, date-range report via `reportPrinter.js` (print + PDF via jsPDF/html2canvas CDN)
- **Inventory dashboard** — cards per item type, low-stock alerts, Damaged/Repair Needed section
- **No client-side router** — single page; views switch via Zustand `activeView`, overlays/modals for forms and detail

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
