# ARCHITECTURE.md — EventFlow

## Project overview

EventFlow is a merchant-facing booking management dashboard for small tent and catering businesses in India. It allows a business owner to manage bookings, detect conflicts, track inventory, track advances, and send WhatsApp communications to clients — all from a single interface.

**Multi-merchant.** Any tent or catering business can sign up (email + password, with an emailed code) and gets its own isolated data. The merchant-facing name is that merchant's own `business_name`: it appears in the Sidebar, the tab title, the calendar greeting, WhatsApp message sign-offs, the Excel export and the printed report (`client/src/App.jsx`, `client/src/utils/whatsapp.js`). The tool itself is called EventFlow. *Previously: a single hardcoded persona, "Bala Ji Tent House"; that business is now merchant 1, the original merchant, whose data predates multi-merchant support.*

**Status: deployed, with real merchant data in production** (frontend on Vercel, API on Render, Postgres on Neon). Every change ships to a real business, so every file is written as if it ships: input validation, error handling, auth, environment-based config, and no secrets in code. `CLAUDE.md` holds the working rules.

Scope is still deliberately small (no customer portal, no payment gateway, no billing) and the code quality bar is "product," not "prototype." *Previously: "single merchant per deployment"; see the Scope decisions log in `ROADMAP.md`.*

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
| Auth | Per-merchant email + password (bcrypt), self-service sign-up with an emailed 6-digit code, JWT session cookie `{ merchant_id, tv }` | The app cannot be left open on the public internet with real client data and no login; each merchant only ever reaches their own rows (SECURITY.md) |
| Email | Brevo transactional HTTP API (`server/services/email.js`) | Sign-up, password-reset and change-email codes, plus security notice emails. `EMAIL_DEV_LOG=true` logs instead of sending (never in production) |
| HTTP hardening | `helmet`, `express-rate-limit`, `cors`, proxy-secret check | See SECURITY.md |
| Validation | `zod` (shared schema, frontend + backend) | One source of truth for what a valid booking — and a valid inventory item — looks like |
| Charts | `recharts` | Lightweight, composable, good fit for a handful of simple charts — no need for a heavier charting lib at this scale |
| Records export | SheetJS (`xlsx`) | Client-side `.xlsx` export from the Records screen |
| Printable reports / PDF | Printable HTML window + `jspdf` + `html2canvas` (npm dependencies, loaded with dynamic `import()` only when a PDF is requested) | Date-range report from Analytics; see "Report PDF pipeline" below. *Previously loaded from a CDN; the production CSP is `script-src 'self'`, so they are bundled.* |
| Secrets | `.env` (local) / platform env vars (deploy) | Never committed, see SECURITY.md |
| Schema | Numbered SQL migrations (`server/db/migrations/`), run by `server/db/migrate.js` on boot | See "Data model" |

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
│   ├── index.html                 # HTML shell; static title "EventFlow — Bookings and inventory for tent and catering businesses" (App.jsx sets the live tab title per screen and merchant)
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   ├── .env.example               # VITE_API_URL
│   ├── .env.production            # VITE_API_URL=/api
│   └── src/
│       ├── Root.jsx               # Route decision above the app: public screens, or the lazy-loaded App at /app
│       ├── App.jsx                # The logged-in app only (/app): checkAuth, view switcher, mobile shell
│       ├── main.jsx               # Installs link interception, renders Root
│       ├── index.css              # Tailwind directives + FullCalendar overrides + keyframes
│       ├── components/
│       │   ├── AddInventoryItemModal.jsx
│       │   ├── AnalyticsView.jsx          # Charts, target, date-range report
│       │   ├── BookingDetail.jsx          # Booking overlay: WhatsApp, expenses, status, delete
│       │   ├── BookingPage.jsx            # Create/edit booking form
│       │   ├── CalendarView.jsx           # FullCalendar + search + morning briefing
│       │   ├── ConfirmDialog.jsx
│       │   ├── ModalDialog.jsx            # Shared native <dialog> frame of every overlay (showModal, Tab wrap, Escape / backdrop unless busy, focus return)
│       │   ├── ConflictBanner.jsx         # Inline alert on date clash (non-blocking)
│       │   ├── AuthCard.jsx, EmailStep.jsx, OtpInput.jsx, OtpVerifyStep.jsx, ResendOtpButton.jsx, SetPasswordForm.jsx
│       │   │                              # Shared parts of the sign-up and forgot-password flows (email -> code -> password)
│       │   ├── ForgotPasswordScreen.jsx   # Forgot-password flow (three steps), reached from the login screen
│       │   ├── DamagedItemsPanel.jsx
│       │   ├── InventoryItemCard.jsx
│       │   ├── InventoryView.jsx
│       │   ├── InventoryWarningBanner.jsx # Inline alert on shortfall; confirm step on submit
│       │   ├── LoginScreen.jsx            # Email + password login, link to sign-up
│       │   ├── PendingBalancesView.jsx
│       │   ├── ProfileView.jsx            # Profile screen: loads /api/profile, composes the sections below, owns the toast and the change-email modal
│       │   ├── profile/                   # Profile screen parts (all use the shared profileUi.jsx: Card, ActionButton, Toast, ProfileModal)
│       │   │   ├── AccountSection.jsx         # masked email, member since, password last changed, "Change email"
│       │   │   ├── BusinessSection.jsx        # inline edit of business name + WhatsApp number, live sign-off preview
│       │   │   ├── SummarySection.jsx         # four stat tiles
│       │   │   ├── SecuritySection.jsx        # hosts the three blocks below plus log-out-other-devices
│       │   │   ├── ChangePasswordPanel.jsx    # current + new password (SetPasswordForm), confirm step
│       │   │   ├── ForgotInProfilePanel.jsx   # code to the stored address -> OtpVerifyStep -> new password
│       │   │   ├── SignInsList.jsx            # last 10 sign-ins (device label + time), newest marked "Most recent"
│       │   │   ├── ChangeEmailModal.jsx       # two steps: new email + password, then the code
│       │   │   ├── DangerZone.jsx             # delete account (password + exact business name)
│       │   │   └── profileUi.jsx
│       │   ├── RecordsView.jsx            # Filterable records + Excel export
│       │   ├── SignupScreen.jsx           # Business name, email, password, confirm; validates on blur
│       │   ├── PasswordInput.jsx          # Password field with show/hide toggle (login, sign-up)
│       │   ├── PrivacyPolicyPage.jsx      # Public policy at /privacy, rendered by Root.jsx (no API call)
│       │   ├── NotFoundPage.jsx           # Any path that is not a known route (rendered by Root.jsx)
│       │   ├── ScreenBoundary.jsx         # Suspense + error boundary for lazy screens (Loading..., "Couldn't load this screen")
│       │   ├── Sidebar.jsx
│       │   └── UsageView.jsx
│       ├── schemas/
│       │   ├── booking.schema.js
│       │   ├── inventory.schema.js
│       │   └── merchant.schema.js         # signupSchema, loginSchema, profileBusinessSchema (mirror of the server file)
│       ├── store/
│       │   ├── authStore.js
│       │   ├── bookingStore.js
│       │   ├── inventoryStore.js
│       │   ├── profileStore.js            # The merchant's own profile (incl. whatsapp_phone); fetched once after login, reset on every session change
│       │   └── settingsStore.js           # Monthly revenue target
│       └── utils/
│           ├── api.js
│           ├── dateHelpers.js
│           ├── excelExporter.js           # SheetJS .xlsx export
│           ├── formatCurrency.js
│           ├── merchantTime.js            # The merchant's business calendar on the client (same Asia/Kolkata rules as the server)
│           ├── formatRelativeTime.js
│           ├── router.js                  # Path switch: matchRoute, navigate (pushState), useLocation, safeNext, link interception
│           ├── signedInHint.js            # localStorage "ef:signedIn" UI hint (set on login / me, cleared on logout / 401 / deletion)
│           ├── profileErrors.js           # handleProfileError: 401 -> login, anything else -> a human sentence
│           ├── reportPrinter.js           # Printable HTML report + PDF download (jspdf/html2canvas, bundled); see "Report PDF pipeline"
│           ├── sanitize.js
│           └── whatsapp.js                # wa.me links — signed with the merchant's business name; self-summary goes to profile.whatsapp_phone
│
├── server/                        # Express backend
│   ├── index.js                   # Express entry: trust proxy, proxy-secret check (production), helmet, CORS, mounts, initDb+seed, listen
│   ├── package.json               # Standalone npm project with its own lockfile (not a workspace, BUGS #092)
│   ├── .env.example               # Placeholder keys only (names listed under "Environment variables")
│   ├── config/
│   │   └── productionHosts.js     # The one place the production database host is listed; isProductionDbHost / touchesProductionDb
│   ├── db/
│   │   ├── database.js            # pg Pool + production-database guard; initDb() runs the migrations
│   │   ├── migrate.js             # Migration runner: advisory lock, one transaction per file, ids-only output
│   │   ├── migrations/            # SCHEMA SOURCE OF TRUTH: 001_baseline ... 007_merchant_profile (see "Data model")
│   │   ├── rollback/              # 004_down.sql: manual undo for 004, never run by the runner (RUNBOOK.md)
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
│   │   ├── requireAuth.js         # Verifies the session JWT + token_version, sets req.merchantId
│   │   ├── requireAdminKey.js     # x-admin-key check for /api/usage/admin
│   │   ├── requireProxySecret.js  # Production only: x-proxy-secret must match (403 otherwise)
│   │   ├── trackUsage.js          # Writes event_log rows after a successful response
│   │   └── validate.js            # zod body validation
│   ├── services/
│   │   ├── bookingPricing.js      # Server-side booking prices and totals (BUGS #062)
│   │   ├── bookingStatus.js       # The shared "active booking" rule (cancelled excluded), BUGS #096
│   │   ├── merchantTime.js        # The merchant's business calendar (Asia/Kolkata): today / month / week ranges, BUGS #100
│   │   ├── email.js               # Brevo send + the email bodies
│   │   ├── otp.js                 # Email codes (HMAC-hashed), cooldowns, daily caps, action tokens
│   │   ├── session.js             # issueSession / clearSession / bumpTokenVersion
│   │   └── signInLog.js           # recordSignIn: coarse device label, newest 10 per merchant
│   ├── utils/
│   │   └── deviceLabel.js, ids.js (parseId), maskEmail.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── profile.js             # /api/profile: business details, sign-ins, password, email change, delete account
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
│   └── scripts/                   # verify-*.mjs checks, seed/cleanup/wipe helpers, migrate.mjs
│       └── lib/                   # Shared helpers: host guards (confirmDatabaseHost, refuseProductionDatabase, guardFirst), merchantArg, verify session/auth, devOtp
│
├── .gitignore
├── package.json                   # Root package: workspaces = client only; `dev` runs client + server (concurrently). server/ is standalone (BUGS #092)
├── vercel.json                    # The ONLY Vercel config (project root = repo root): build, /api rewrite to Render, SPA fallback, security headers, x-proxy-secret transform
├── README.md
├── CLAUDE.md                      # Working rules for Claude Code in this repo
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
(`HANDOFF.md`, `RELEASE_CHECKLIST.md`, `STATE_REPORT.md` and `PROMPTS_22-26.md` also sit at the root; they are working notes, not specifications.)

---

## Data model

**The schema lives in `server/db/migrations/`** (numbered SQL files, each applied once, in order). `initDb()` calls `runMigrations()` (`server/db/migrate.js`) on every boot; applied ids are recorded in `schema_migrations (id, applied_at)`. The runner takes a transaction-scoped advisory lock (safe through Neon's pooled endpoint), runs each file in its own transaction, and throws on failure so the server refuses to start on a half-migrated database. A database that already has the `bookings` table but no `schema_migrations` adopts `001_baseline` without running it, after checking it really is at the baseline: required columns, `ON DELETE CASCADE` on the booking foreign keys, and the CHECK constraints (`booking_inventory_quantity_check`, `booking_expenses_amount_check`, `bookings_status_check`). A missing CHECK that a later migration repairs (today only `bookings_status_check`, repaired by `003`) is reported as known drift and allowed; anything else missing is refused and the server does not start. Run it by hand with `npm run migrate -- --confirm-host=<host>` from `server/` (no seeds; prints migration ids only; production also needs `NODE_ENV=production` and `--i-really-mean-production`). Rules for writing migrations are in `CODING_STANDARDS.md`. Connection: `pg.Pool` in `server/db/database.js` with `connectionString: process.env.DATABASE_URL`; in production `ssl: { rejectUnauthorized: true }`, otherwise no SSL. *Previously: SQLite (`better-sqlite3`) with `?` placeholders and a single `schema.sql`; both are gone.*

| Migration | What it does |
|---|---|
| `001_baseline` | The original single-merchant schema (`bookings`, `change_log`, `event_log`, `inventory_items`, `booking_inventory`, `inventory_damage_log`, `merchant_settings`, `booking_expenses`) |
| `002_multi_merchant` | Adds `merchants` and `merchant_id` to every business table, per-merchant uniqueness, composite foreign keys, indexes. Merchant 1 ("Bala Ji Tent House") takes all existing rows |
| `003_bookings_status_check` | Adds `bookings_status_check` where an older database lacked it |
| `004_drop_merchant_defaults` | Removes the temporary `DEFAULT 1` on `merchant_id` (a forgotten `merchant_id` now fails loudly). Manual undo: `db/rollback/004_down.sql` |
| `005_merchant_accounts` | `merchants.email`, `merchants.password_hash`, unique index on `lower(email)` |
| `006_email_otps` | `email_otps` table; `merchants.token_version`, `merchants.password_changed_at` |
| `007_merchant_profile` | `merchants.whatsapp_phone` CHECK (`^[6-9][0-9]{9}$`); `sign_in_log`; `email_otps.purpose` also allows `reset_password` |

**Multi-merchant.** `merchants` is the tenant table: `id`, `business_name`, `owner_name`, `whatsapp_phone`, `city`, `created_at`, `email`, `password_hash`, `token_version` (default 0), `password_changed_at`. `email` is stored lowercased and is unique case-insensitively (`merchants_email_lower_key` on `lower(email)`); `email` and `password_hash` are nullable, and a merchant with no `password_hash` cannot log in. Self-service sign-up fills `business_name`, `email` and `password_hash` only; `owner_name` and `city` stay empty, and `whatsapp_phone` is set later on the Profile screen. Merchant 1 is Bala Ji Tent House (all pre-existing data); in production the owner set its credentials (BUGS #068) and its login email is a placeholder (BUGS #074). Dev seeds give merchants 1 and 2 (Shree Ganesh Caterers) demo logins (`db/seedMerchants.js`, never run in production): merchant 1 is a tent house with chairs, tables, tents and sofas and venues across many cities; merchant 2 is a Raipur caterer with burners, degchi, chafing dishes and buffet counters, plus six months of history, a date clash, damaged stock and expenses. `scripts/delete-test-merchant.mjs` removes a throwaway merchant and its rows (`--confirm-host`, `--merchant-id`, `--expect-name`; it refuses merchant 1 and the demo merchants).

Every business table (`bookings`, `change_log`, `booking_inventory`, `inventory_items`, `inventory_damage_log`, `booking_expenses`, `event_log`, `merchant_settings`) has `merchant_id INTEGER NOT NULL REFERENCES merchants(id)`. So do `sign_in_log` (`NOT NULL`, same reference) and `email_otps` (nullable: sign-up and reset rows have no merchant yet; `ON DELETE CASCADE`). Child rows are tied to their parent's merchant at the database level by composite foreign keys, so a cross-merchant link is impossible: `(booking_id, merchant_id) → bookings (id, merchant_id)` on `change_log`, `booking_expenses` and `booking_inventory` (`ON DELETE CASCADE`), and `(item_id, merchant_id) → inventory_items (id, merchant_id)` on `booking_inventory` and `inventory_damage_log`. `bookings` and `inventory_items` carry `UNIQUE (id, merchant_id)` for that purpose; `inventory_items` is also unique on `(merchant_id, name)`; `merchant_settings` has `PRIMARY KEY (merchant_id, key)`. Every route scopes its queries to `req.merchantId` (from the signed session token); see SECURITY.md, "Tenant isolation". `GET /api/usage/admin` is the one cross-merchant read (session + admin key) and takes an optional `?merchant_id=` filter. Deleting an account removes every merchant-scoped table by hand in FK-safe order (`DELETE /api/profile`, `server/routes/profile.js`); a new table with a `merchant_id` column must be added there in the same commit (`scripts/verify-profile-api.mjs` fails if one is missing).

Columns below are the current shape (all tables above also have `merchant_id`, not repeated). Dates are stored as text (`YYYY-MM-DD` for `event_date`, the rest are timestamps written by `DEFAULT NOW()` or ISO strings), as in the baseline.

### `bookings`

```sql
id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
client_name TEXT NOT NULL, phone TEXT NOT NULL,
event_type TEXT NOT NULL,            -- wedding | birthday | corporate | other
event_type_custom TEXT,              -- label when event_type = 'other'
event_date TEXT NOT NULL,            -- YYYY-MM-DD
guest_count INTEGER NOT NULL, venue TEXT,
advance INTEGER DEFAULT 0, total INTEGER DEFAULT 0,          -- INR
subtotal INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0, grand_total INTEGER NOT NULL DEFAULT 0,
status TEXT DEFAULT 'confirmed',     -- bookings_status_check: confirmed | pending | cancelled | completed (column is nullable)
notes TEXT, created_at TEXT DEFAULT NOW(), updated_at TEXT DEFAULT NOW()
```

`total` is what the merchant is owed and what revenue sums; with inventory lines it equals `grand_total` (see "Booking pricing"). Index `(merchant_id, event_date)`.

### `change_log`, `booking_expenses`, `booking_inventory`
- `change_log (id, booking_id, change_note TEXT NOT NULL, logged_at)`: append-only notes per booking.
- `booking_expenses (id SERIAL, booking_id, label TEXT, amount INTEGER CHECK (amount > 0), created_at TIMESTAMPTZ)`.
- `booking_inventory (id, booking_id, item_id, quantity INTEGER CHECK (quantity > 0), unit_price, line_total)`: the lines of a booking; `unit_price` is the price actually used (an override or the item's rate at the time).

### Inventory: `inventory_items`, `inventory_damage_log`
- `inventory_items (id, name, total_quantity, damaged_quantity, unit_price, created_at)`.
- `inventory_damage_log (id, item_id, change INTEGER, note, logged_at)`: `change` positive = marked damaged, negative = marked repaired. An append-only audit trail rather than silently mutating `damaged_quantity`.
- "Available" is computed, not stored: `usable = total_quantity - damaged_quantity`; `in_use_today` = quantity on today's non-cancelled bookings; `available = usable - in_use_today` (see "Inventory availability logic").

### `event_log`
`event_log (id, event_type TEXT NOT NULL, metadata TEXT, created_at)`. It is the single source of truth for both the merchant-facing "My Activity" view and the internal adoption reporting (see "Analytics vs. Usage tracking"). `metadata` is `{"booking_id": n}` or null, **never client names or phones** (`server/middleware/trackUsage.js` strips everything else; see DATA_PRIVACY.md).

### `merchant_settings`
`merchant_settings (merchant_id, key, value, PRIMARY KEY (merchant_id, key))`. The only key today is `monthly_revenue_target` (`server/routes/settings.js`).

### Account tables
- `email_otps (id, email, purpose, merchant_id, code_hash, attempts, expires_at, consumed_at, last_sent_at, created_at)`: emailed codes. `purpose` is `signup`, `reset`, `change_email` or `reset_password` (`email_otps_purpose_check`). Only an HMAC of the code is stored (`server/services/otp.js`). Rows older than 24 hours are deleted on boot.
- `sign_in_log (id, merchant_id, device_label, created_at)`: the newest 10 sign-ins per merchant with a coarse label such as "Chrome on Android". It never stores an IP address or the user agent. Index `(merchant_id, created_at DESC)`.
- `schema_migrations (id, applied_at)`: created and used by the runner.

---

## API routes

Global: `Cache-Control: no-store` on `/api/*`. ETag disabled. Errors → `errorHandler` → `{ error }`. Any other `/api/*` path returns `404 { error: 'Not found.' }`. In production every route except `GET /api/health` also needs the `x-proxy-secret` header (403 otherwise; SECURITY.md). Routers are mounted in `server/index.js`: `/api/auth`, `/api/bookings`, `/api/inventory`, `/api/analytics`, `/api/usage`, `/api/settings`, `/api/reports`, `/api/records`, `/api/profile`; each router except `auth` starts with `router.use(requireAuth)`.

| Method | Route | Auth required | Description |
|---|---|---|---|
| GET | `/api/health` | **No** (intentional; returns `{ status: 'ok' }` only — no data) | Liveness check |
| POST | `/api/auth/signup/send-otp`, `/signup/resend-otp` | No | `{ email }`. `409` if the email has an account; else emails a 6-digit code. `200 { sent, cooldownSeconds }`; `429 { error, retryAfter }` inside the 60 s cooldown |
| POST | `/api/auth/signup/verify-otp` | No | `{ email, code }` returns `{ verificationToken }` (15 min, purpose `signup`); `400 "Code is invalid or expired."` |
| POST | `/api/auth/signup` | No | `{ verificationToken, business_name, password }` (zod). Email comes from the token. Creates the merchant (bcrypt cost 10), logs them in (cookie JWT `{ merchant_id, tv }`), `201 { authenticated, merchant: { business_name } }`. `409` if the email exists; `401` if the verification token is invalid or expired. Rate limited by `signupRateLimiter` |
| POST | `/api/auth/forgot/send-otp`, `/forgot/resend-otp` | No | `{ email }`. Always `200` with the same body whether or not an account exists |
| POST | `/api/auth/forgot/verify-otp` | No | `{ email, code }` returns `{ resetToken }` (purpose `reset`) |
| POST | `/api/auth/forgot/reset` | No | `{ resetToken, newPassword }`. Transaction: `token_version` must still equal the token's `tv` (else `400`), then new hash, `password_changed_at`, `token_version + 1` (ends all sessions). No auto-login; `200 { reset: true }` |
| POST | `/api/auth/login` | No | `{ email, password }`. Looks the merchant up by email, `bcrypt.compare`, receives a JWT `{ merchant_id }` in an httpOnly cookie. `401 "Incorrect email or password."` for an unknown email and a wrong password alike. Every other route resolves `req.merchantId` from the token |
| POST | `/api/auth/logout` | Yes | Clears session cookie |
| GET | `/api/auth/me` | Yes | Session validity for the frontend route guard, plus `merchant: { business_name }` for the Sidebar |
| GET | `/api/bookings` | Yes | Return all bookings (for calendar population) |
| GET | `/api/bookings/check-conflict?date=YYYY-MM-DD&excludeId=` | Yes | Returns conflicting booking if any. `excludeId` optional when editing |
| GET | `/api/bookings/pending-balances` | Yes | Outstanding balances (confirmed/pending, balance > 0, upcoming) |
| GET | `/api/bookings/:id` | Yes | Single booking + change_log + inventory + expenses |
| POST | `/api/bookings` | Yes | Create booking (conflict + inventory checks are alert-only, never block). The server prices it (BUGS #062): with lines, `line_total`, `subtotal`, `grand_total` and `total` are computed from quantity x `unit_price` (the sent override, else the item's stored rate) and `discount`, and client-sent values for them are ignored. 400 for `advance` over total, amounts over 10,000,000, a repeated item, or a foreign item |
| PATCH | `/api/bookings/:id` | Yes | Edit booking — same validation and server-side pricing as create; conflict/inventory checks exclude own rows. Omitting `inventory` keeps the stored lines and re-prices them at their stored prices |
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
| GET | `/api/analytics/summary` | Yes | `revenueThisMonth`, `bookingsThisMonth`, `peakMonth` (last 6 months), `totalClients` (distinct phones). Cancelled bookings are excluded from all four (BUGS #096) |
| GET | `/api/analytics/monthly` | Yes | The last 6 months, `{ month, bookings, revenue }` each, cancelled excluded; feeds the chart |
| POST | `/api/usage/log-client-action` | Yes | Log client-side actions (e.g. WhatsApp clicks) into `event_log` |
| GET | `/api/usage/me?weekOffset=` | Yes | Merchant-facing weekly usage summary for the calling merchant |
| GET | `/api/usage/admin?merchant_id=&page=&limit=` | Yes + `requireAdminKey` | Cross-merchant `event_log` feed (includes `merchant_id`), paged — not shown in merchant UI |
| GET | `/api/settings` | Yes | Read `merchant_settings` (e.g. monthly revenue target) |
| PATCH | `/api/settings` | Yes | Update settings (validated) |
| GET | `/api/reports/range?from=&to=` | Yes | Date-range report: per-booking rows (cancelled included, flagged by `status`) plus a `summary` that counts only non-cancelled bookings. Range limited to 366 days |
| GET | `/api/records` | Yes | Filtered booking records for the Records screen / Excel export |
| GET | `/api/profile` | Yes | Masked email, member since, password changed at, business name and WhatsApp phone, summary counts (bookings, upcoming, inventory items, clients) |
| PATCH | `/api/profile/business` | Yes | `{ business_name, whatsapp_phone? }` |
| GET | `/api/profile/sign-ins` | Yes | Last 10 `{ device_label, created_at }` |
| POST | `/api/profile/password` | Yes | `{ current_password, new_password }`; ends other sessions |
| POST | `/api/profile/password/reset/send`, `/password/reset/verify` | Yes | Reset by email code (stored address only); `verify` takes `{ code, new_password }` |
| POST | `/api/profile/logout-others` | Yes | Ends every other session, keeps this one |
| POST | `/api/profile/email/send`, `/email/verify` | Yes | Change login email: `{ current_password, new_email }` then `{ code }`; the pending address lives in the `email_otps` row |
| DELETE | `/api/profile` | Yes | `{ current_password, confirm_business_name }`; deletes the account and all its data in one transaction |

All **business** routes require `requireAuth`. The only intentional unauthenticated routes are `GET /api/health` (no data), `POST /api/auth/login` and the public sign-up and password-reset routes (`POST /api/auth/signup`, `/signup/send-otp`, `/signup/resend-otp`, `/signup/verify-otp`, `/forgot/send-otp`, `/forgot/resend-otp`, `/forgot/verify-otp`, `/forgot/reset`); those are rate limited and validated. See SECURITY.md for the full auth matrix and the rate limiters.

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
BREVO_API_KEY=            # email codes (Brevo); required for sign-up and password reset
EMAIL_FROM=                # verified Brevo sender address
EMAIL_FROM_NAME=EventFlow  # required to send (sendEmail throws without it)
EMAIL_DEV_LOG=false        # true logs codes instead of sending; ignored when NODE_ENV=production
OTP_HMAC_SECRET=          # hashes emailed codes; openssl rand -base64 32
APP_URL=                  # optional, shown in emails
PROXY_LOCK_MODE=           # production only: 'report' relaxes the proxy-secret check for a staged rollout; anything else enforces
```

Also read by code: `PGHOST` (only by the production-host guard in `server/config/productionHosts.js`, which checks every host `pg` could connect to). Test-only, honoured only when `NODE_ENV` is `development` or `test`: `MERCHANT_NOW_OVERRIDE` (pins "now" for `verify:timezone`; the server warns loudly at boot if it is set). Script-only variables (verify scripts): `ISOLATION_PORT`, `PRICING_PORT`, `ANALYTICS_PORT`, `RATELIMIT_PORT`, `TIMEZONE_PORT`, `REPORT_PDF_DIR`, `VERIFY_FRONTEND_URL`.

Required at boot: `JWT_SECRET`, `SESSION_COOKIE_NAME` (plus `PROXY_SHARED_SECRET` in production). `BREVO_API_KEY`, `EMAIL_FROM` and `OTP_HMAC_SECRET` are not required to boot (production logs one warning if missing) but sign-up and password reset fail without them; `EMAIL_FROM_NAME` is also needed to send, yet is not in that boot warning (`server/index.js` vs `server/services/email.js`). `MERCHANT_PASSWORD_HASH` no longer exists: logins are per merchant, in the `merchants` table.

**Client (`client/.env`)**:

```
VITE_API_URL=http://localhost:3001/api
```

In production (`client/.env.production`): `VITE_API_URL=/api` (same-origin; Vercel proxies to Render).

Full setup instructions for generating these values are in SECURITY.md.

---

## Analytics vs. Usage tracking — two different things, don't conflate them

These answer different questions and have different audiences. Keep them architecturally separate even though they share the UI pattern (a dashboard with cards/charts).

### Business analytics — "How is the merchant's business doing"
**Audience: the merchant.** Pulled entirely from the `bookings` table, always scoped to the merchant (`server/routes/analytics.js`).
- `revenueThisMonth` and `bookingsThisMonth`: non-cancelled bookings whose `event_date` falls in the current month
- `peakMonth`: the month with the most bookings in the last 6 months (ties go to the later month)
- `totalClients`: distinct phone numbers with at least one non-cancelled booking
- `monthly`: bookings and revenue for each of the last 6 months (zero-filled), the data behind the bar chart
- The Sidebar's revenue-target bar reads `summary.revenueThisMonth` against the merchant's `monthly_revenue_target` (`merchant_settings`)
- The date-range printable report is a separate endpoint (`/api/reports/range`) with the same cancelled rule

**The active-booking rule.** A cancelled booking stays in the records but is never revenue, never a booked event and never a client. The rule lives in one place, `server/services/bookingStatus.js`: `ACTIVE_BOOKING_SQL` (`status IS DISTINCT FROM 'cancelled'`) for SQL and `isActiveBooking` for rows in memory. Analytics uses the SQL fragment, the report uses the function, so they cannot drift (BUGS #096). `status` is nullable, and a NULL status counts as active, matching the client filters (`Sidebar.jsx`, `CalendarView.jsx`). The conflict and inventory queries still write `status != 'cancelled'`, which differs only for NULL-status rows, and the API cannot create those (the column defaults to `'confirmed'`).

**Keeping the numbers fresh in the UI.** The Sidebar and Analytics screen fetch the server-computed numbers when they mount. `bookingStore.analyticsVersion` is bumped by `addBooking`, `updateBooking` and `removeBooking` (called only after the API call succeeded), and the Sidebar (revenue bar, pending-balance badge) and an open Analytics screen refetch when it changes; a failed refetch keeps the last good numbers (BUGS #097). `bookingStore.bookingsLoaded` says whether the store's list has been loaded, so an empty list after load is real (BUGS #098).

### Usage analytics — "Is the merchant actually using EventFlow, and how"
**Audience: both.** Pulled from the `event_log` table, populated by the `trackUsage` middleware (`server/middleware/trackUsage.js`), which writes one row after a successful (2xx) response. Event types in the code today: `login`, `signup_verified`, `password_reset`, `password_changed`, `sessions_revoked`, `email_changed`, `booking_viewed`, `booking_created`, `booking_edited`, `booking_status_updated`, `change_logged`, plus `whatsapp_confirmation_sent` and `whatsapp_reminder_sent` from `POST /api/usage/log-client-action`. Metadata is a booking id or nothing.

Two views of the same data:
- **Merchant-facing (`UsageView.jsx` / `GET /api/usage/me`)**: a friendly weekly "My Activity" card for the calling merchant (logins, bookings created and edited, WhatsApp messages sent, days active, last active).
- **Internal (`GET /api/usage/admin`)**: the raw cross-merchant event feed (session + `x-admin-key`), your adoption proof. It is never called from the merchant UI.

Two clean views from one shared table, rather than one dashboard that is too sparse for the merchant or too cluttered with internal metrics.

---

## Conflict detection logic

Conflict is defined as: **any two bookings sharing the same `event_date`.**

This is **alert-only, never blocking.** Two bookings on the same date may be entirely fine for this merchant to take on — the app's job is to make sure they notice, not to decide for them.

- Only **non-cancelled** bookings of the same merchant count (`findDateConflict` in `server/routes/bookings.js`)
- Frontend checks optimistically on date picker change (calls `/api/bookings/check-conflict?date=`)
- Backend also validates on POST/PATCH, to surface the same alert even if the frontend missed a race condition
- If conflict found: return `{ conflict: true, booking: { client_name, event_type } }` (or the informational `conflict: { detected, booking }` shape on create/edit responses)
- Frontend renders `<ConflictBanner>` with the clashing booking's name. The date field gets a red border as a visual flag. **The submit button stays enabled** — the merchant can confirm the booking immediately, no extra confirmation step needed for a date clash specifically (see Inventory availability logic below for why inventory shortfalls get a stricter pattern)
- When editing a booking, the conflict check passes `excludeId` so a booking never flags a clash against its own pre-existing record

---

## Booking pricing (server-side)

The server, not the browser, decides every derived amount (`server/services/bookingPricing.js`, BUGS #062), inside the same transaction that saves the booking:

- **With inventory lines:** `unit_price` is the value the client sent for that line (a per-line override, even 0), else the item's stored rate; `line_total = quantity × unit_price`; `subtotal` is the sum of line totals; `grand_total = max(0, subtotal − discount)`; `total = grand_total`. Any `line_total`, `subtotal`, `grand_total` or `total` the client sent is ignored.
- **With no lines:** the merchant's typed `total` is kept and `grand_total` equals it.
- **Rejected with a 400 and a readable message:** `advance` over the total (once the booking has a price), any amount over 10,000,000, the same item on two lines, and an item that is not the merchant's own (the same message for a foreign and a nonexistent item).
- A `PATCH` that omits `inventory` keeps the stored lines and their stored prices and re-derives the totals from them.

Proof: `npm run verify:pricing -- --confirm-host=<dev host>` (TESTING.md).

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
4. The backend re-checks availability on POST/PATCH regardless (same race-condition-is-advisory-only posture as the date-conflict check — acceptable for a small merchant typing manually, see `BUGS.md`)

The Inventory dashboard itself (`InventoryView.jsx`) shows `in_use_today` using **today's date**, not the date of any particular booking being created — it's read as "what's out of the warehouse right now." `GET /api/inventory` also returns `booked_this_month` and `availability_ratio` per item (`server/routes/inventory.js`), which feed the low-availability hint (threshold 20%).

**Dates and time zones (BUGS #100).** "Today", "this month" and "this week" are the merchant's calendar in `Asia/Kolkata`, from one helper: `server/services/merchantTime.js` (`MERCHANT_TZ`, `todayISO`, `monthRange`, `lastMonths`, `weekRange`, `startOfDayInstant`, each taking an injectable `now`) and its client twin `client/src/utils/merchantTime.js`. The code does not depend on the time zone of the Render service, the Neon session or the browser; the resulting dates are passed to SQL as `$n` parameters, and no `CURRENT_DATE`, `NOW()::date` or server-local `Date` math is used for business days. Two kinds of values are handled differently: a **calendar date** (`bookings.event_date`, text `YYYY-MM-DD`) is compared with the ISO date strings the helper returns (analytics, inventory `in_use_today` and `booked_this_month`, pending balances, the profile's upcoming count); a **timestamp** (`event_log.created_at`) is compared with the UTC instants of the IST midnights that bound the week (`weekRange`), and "days active" buckets timestamps into IST days with `AT TIME ZONE` (`routes/usage.js`). Instants that are not business days (OTP expiry, `updated_at`, session times) stay `NOW()` / `new Date()`. For tests only, `MERCHANT_NOW_OVERRIDE` (an ISO instant) pins "now", and only when `NODE_ENV` is exactly `development` or `test` (an allowlist: unset, misspelled or `production` never pins it); the server logs a loud warning at boot whenever the variable is set at all, saying whether it is honoured or ignored (`nowOverrideWarning`, `server/index.js`). Proof: `npm run verify:timezone` (TESTING.md). Still on local time by design: dev seed scripts, which build dates relative to the developer's machine.

---

## WhatsApp link generation

No API key. No webhook. Pure deep link. Messages are signed with the **merchant's own business name** (`merchants.business_name`, passed in from `authStore.businessName`), not EventFlow — the message is on the merchant's behalf. *Previously a hardcoded "Bala Ji Tent House".* The merchant's own number for the "Send to My WhatsApp" summary is `whatsapp_phone` from their profile (set on the Profile screen, held in `profileStore`), never an env var; with no number the button is disabled and links to Profile. Client-facing links use the booking's phone.

The shape (see `client/src/utils/whatsapp.js` for the real wording; it sanitizes and length-limits every value it inserts):

```js
// utils/whatsapp.js
confirmationMessage(booking, businessName)      // https://wa.me/91<client phone>?text=<encoded message>, signed with businessName
paymentReminderMessage(booking, businessName)   // same, for the balance reminder
selfSummaryMessage(booking, businessName, merchantPhone)   // "Send to My WhatsApp": goes to the merchant's own number
```

Clicking the button opens WhatsApp desktop or mobile with the message pre-filled. Works in a screen recording.

---

## Seeded demo data

Dev databases only. `seed()` (`server/db/seed.js`) returns immediately when `NODE_ENV === 'production'`, so the demo data can never reach a real merchant. On a dev database it fills merchant 1 with a month of bookings (mixed event types and statuses, at least one date with two bookings to show conflict detection), a starter inventory (Plastic Chairs, Round Tables, Shamiana Tents, Sofas, with a damaged item and bookings pre-attached to stock), analytics history and a week of recent activity, adds the second demo merchant (`devMerchantSeed.js`), and gives both demo logins that only dev databases have (SECURITY.md). Bookings are seeded only when merchant 1 has none; the other seeds are idempotent. Rules for writing seed data are in `CODING_STANDARDS.md`.

---

## Report PDF pipeline

Analytics > Export Report opens a new window with the printable report (`openReportWindow` in `client/src/utils/reportPrinter.js`), built from `GET /api/reports/range`. Two actions there:

- **Print** uses the browser's own print. The CSS `page-break-inside: avoid` on `.booking-card` applies here only.
- **Download PDF** (`downloadReportPdf`): dynamic `import()` of `jspdf` and `html2canvas` (npm dependencies, bundled), one `html2canvas` call on `#report-body` (scale 2, so the canvas is 1520 px wide), one PNG data URL, one `addImage` per page using jsPDF's `'FAST'` option so the image is compressed and stored once (BUGS #091). The page cuts come from `planPdfPages`: the nominal cut is every A4 page height, but when it would land inside a booking card the page ends just above that card, the rest of that page is covered with a white rectangle (the one image continues below the cut) and the next page starts at that card. A card taller than a page is cut at page height. CSS cannot do this, because the PDF is a slice of one canvas, not a laid-out document (BUGS #095). In dev builds the layout is exposed as `window.__reportPdfLayout` for `scripts/verify-report-pdf.mjs`; it is absent from the production bundle.
- **Known limit:** a long report makes a canvas above iOS Safari's area limit (16,777,216 px), which fails there (BUGS #094, open: mobile PDF is deferred).

---

## Key UI decisions

- **Dark sidebar (#0f172a), light main canvas (#f8fafc)** — high contrast, professional feel
- **Sidebar business name: the signed-in merchant's `business_name`**, tent icon, white bold text; the tab title is `<screen> — <business name>` (`App.jsx`)
- **Calendar event cards**: teal for confirmed, amber for pending, red for cancelled, indigo for completed
- **`BookingPage` is shared between create and edit** — same form, different title/submit label/initial values
- **Booking detail** — opens as a fixed overlay modal (not an in-main drawer) on calendar event click; WhatsApp, expenses/profit, status (including complete/cancel), change log, delete
- **Sidebar views**: Calendar, Inventory, Pending Balances, Records, Analytics, My Activity, Profile
- **Records** — filterable list + SheetJS Excel export (`excelExporter.js`)
- **Analytics** — charts, monthly revenue target, date-range report via `reportPrinter.js` (print + PDF, see above)
- **Inventory dashboard** — cards per item type, low-stock alerts, Damaged/Repair Needed section
- **Profile** — business name and WhatsApp number, masked email, change password / email, sign-in list, log out other devices, delete account (`ProfileView.jsx`, `components/profile/`)
- **No client-side router library.** `client/src/utils/router.js` is a small path switch (`history.pushState`, one `popstate` listener, and a document click handler that turns same-origin links to known paths into in-place navigation), and `client/src/Root.jsx` (rendered by `main.jsx`) picks the screen **above** `App`, so there are no full page reloads between routes and Zustand state (such as `loginNotice`) survives navigation. Routes (a trailing slash is fine, `vercel.json` already sends every non-`/api` path to `index.html`):
  - `/app`: the logged-in app. `Root` lazy-loads `App.jsx`, which runs `checkAuth()` (skipped when the store already knows the session, e.g. right after login); with no session it goes to `/login?next=/app`. This is the only route that calls the API on load.
  - `/login`, `/signup`, `/forgot-password`: the auth screens as real URLs; they call the API only on submit. After login or sign-up, the app goes to `?next=` only if it starts with `/` and not `//` (or `/\`), and is not itself an auth screen; otherwise `/app` (`safeNext`).
  - `/privacy`: the public policy, no API call; its "Back to sign in" link goes to `/login`.
  - `/`: the public landing page (`LandingPage.jsx`, lazy-loaded, no API calls). Its buttons read the `ef:signedIn` hint: "Open dashboard" to `/app` when set, otherwise "Log in" and "Create free account".
  - anything else: the 404 page.
  Logout, expired sessions and account deletion `navigate('/login', { replace: true })` from `authStore`, so the existing notices ("Your account has been deleted.", the password-reset banner) still show. Because FullCalendar, recharts, jsPDF, html2canvas and xlsx are only reachable from `App.jsx`, the public routes never download them. The `ef:signedIn` hint (`signedInHint.js`, DIRECTIONS.md 3.3) is read only by the landing page. Inside the app, views switch via Zustand `activeView`, with overlays/modals for forms and detail.

---

## What is explicitly out of scope

- Customer-facing portal
- Payment gateway integration (UPI links are just `wa.me` text, not real payment collection)
- Billing / subscriptions
- True deploy/return tracking for inventory (availability is computed per event date instead — see Inventory availability logic above and `ROADMAP.md` v2)
- Native mobile app
- Firebase / phone / Google sign-in (planned as ROADMAP Prompt 26; email + password with emailed codes is what exists)

*Previously also listed here: "Multi-merchant / multi-business support (single merchant per deployment for now)". That is built and deployed: see "Multi-merchant" under Data model and `ROADMAP.md`'s Scope decisions log.*

Business analytics, usage tracking, and inventory tracking, originally deferred, are in scope per panel feedback and a direct merchant request — see the dedicated sections above. See `ROADMAP.md` for what's still deferred and why.

## Related documents

| File | Purpose |
|---|---|
| `CODING_STANDARDS.md` | Naming, structure, style conventions |
| `PROMPTS.md` | Sequenced Cursor build prompts (a historical build log, not current architecture) |
| `BUGS.md` | Bug tracker + prevention checklist |
| `SECURITY.md` | Auth model, input validation, audit checklist per milestone |
| `DEPLOYMENT.md` | How and where this gets deployed, with config per platform |
| `DATA_PRIVACY.md` | How real client data (names, phone numbers) is handled — DPDP Act context |
| `TESTING.md` | What gets tested before each milestone ships |
| `RUNBOOK.md` | What to do when something breaks in production |
| `ROADMAP.md` | What's deferred from v1 and why |
