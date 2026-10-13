# PROMPTS.md — EventFlow

## How to use this file

Run these prompts in Cursor in the exact order listed. Each prompt builds on the previous one. Before running any prompt, make sure the previous step is working and committed.

**Always attach these files as context in Cursor** (use `@filename`) before running any prompt: `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `SECURITY.md`. These three define the shape, quality, and safety bar for everything generated.

After every milestone marked **[MILESTONE]**, run the relevant checklist from `TESTING.md` and the security audit checklist from `SECURITY.md` before moving on. This is no longer optional now that real merchant data is in scope — see the conversation that led to this update.

Estimated time per prompt is noted. This build is now product-grade, not just demo — budget more time than the original 8-hour pass, especially for Prompts 2 (auth) and 6 (security hardening), which are new.

**Note on Prompts 16–21:** these were added after the original build (Prompts 0–14) was complete and demo-verified. Sequence-wise they continued from 14 while Prompt 15 (Postgres) was temporarily deferred, then Prompt 15 was completed — **current code uses Postgres via `pg`**. Prompts 16–21 extend v1's feature scope (rebrand, non-blocking conflict alerts, booking edit, inventory tracking) per the Scope decisions log in `ROADMAP.md`. They're numbered after Prompt 15 only to avoid renumbering a prompt that `DEPLOYMENT.md` and other docs already reference by number.

---

## Prompt 0 — Project scaffold
**Time: 25 min**

```
Create a full-stack monorepo project called "eventflow" with the following structure:

- /client — React 18 + Vite app with Tailwind CSS v3 configured
- /server — Node.js + Express app with better-sqlite3

Root package.json should have a "dev" script that runs both client (port 5173) and server (port 3001) concurrently using the "concurrently" package.

Client dependencies: react, react-dom, vite, tailwindcss, postcss, autoprefixer, zustand, @fullcalendar/react, @fullcalendar/daygrid, @fullcalendar/interaction, lucide-react, zod

Server dependencies: express, better-sqlite3, cors, dotenv, bcryptjs, jsonwebtoken, cookie-parser, express-rate-limit, zod

Set up Tailwind with the default config. Set up the Express server with cors (credentials: true), cookie-parser, and json middleware. Create a /api/health route that returns { status: 'ok' }.

Create .env.example files in both client/ and server/ with the placeholder variables listed in ARCHITECTURE.md — no real values.
Create a root .gitignore covering node_modules, .env, *.db, dist/.

Follow ARCHITECTURE.md for folder structure and CODING_STANDARDS.md for all conventions.
```

---

## Prompt 1 — Database setup + seed data
**Time: 25 min**

```
In /server/db/database.js, create a SQLite database singleton using better-sqlite3 (this is local dev only — production will use Postgres per DEPLOYMENT.md, but don't build that yet).

Create two tables on initialization, matching /server/db/schema.sql:
1. bookings table — as defined in ARCHITECTURE.md
2. change_log table — as defined in ARCHITECTURE.md

In /server/db/seed.js, seed exactly 10 bookings if the bookings table is empty. CRITICAL: gate this entire file so it does nothing if process.env.NODE_ENV === 'production' — log a message and exit instead. This is a hard requirement, not optional, because real merchant data must never be overwritten by seed data.

Follow CODING_STANDARDS.md seed data rules exactly:
- Spread bookings across the current calendar month (use today's date to calculate)
- Mix of event types: 4 weddings, 2 birthdays, 2 corporate, 2 other
- Mix of statuses: 7 confirmed, 2 pending, 1 cancelled
- One date must have a booking already (to be used for conflict demo) — pick a date 5-7 days from today
- Realistic Indian client names (e.g. Ramesh Sharma, Priya Patel, Sunil Verma)
- Advance between 5000-25000, total between 25000-150000

Call the seed function at the end of database.js so it runs on every server start (still respecting the NODE_ENV guard).
```

---

## Prompt 2 — Auth: login, JWT session, password hashing
**Time: 40 min — new, do not skip**

```
Build the single-merchant authentication system for EventFlow, following the exact auth model in SECURITY.md.

1. /server/middleware/rateLimiter.js — loginRateLimiter (5 attempts per 15 min per IP) and bookingCreateRateLimiter (20 per min), using express-rate-limit. Use the exact config from SECURITY.md.

2. /server/middleware/requireAuth.js — verifies the JWT from the httpOnly cookie (cookie name from process.env.SESSION_COOKIE_NAME), returns 401 with a clear error message if missing or invalid. Use the exact pattern from SECURITY.md.

3. /server/routes/auth.js with three routes:
   - POST /login — rate limited, compares submitted password against process.env.MERCHANT_PASSWORD_HASH using bcrypt.compare, issues JWT cookie on success (httpOnly, secure in prod, sameSite lax, 7 day expiry), returns 401 with "Incorrect password" on failure
   - POST /logout — clears the session cookie
   - GET /me — protected by requireAuth, returns { authenticated: true } if the session is valid (used by frontend to check login state on app load)

4. Mount auth routes at /api/auth in server/index.js, BEFORE applying requireAuth globally to anything else.

5. Apply requireAuth middleware to all /api/bookings routes (these don't exist yet, just set up index.js so when they're added in the next prompt, the middleware chain is ready).

6. On the client: build src/store/authStore.js (Zustand) tracking { isAuthenticated, isLoading }, and src/components/LoginScreen.jsx — a clean centered card with EventFlow branding, password input, "Log In" button, and error message display on failed login. On successful login, call api.getMe or similar and set isAuthenticated true.

7. In App.jsx, check auth status on mount (call GET /api/auth/me). If not authenticated, render <LoginScreen /> instead of the main dashboard. Show a loading state while this check is in flight — don't flash the dashboard before the auth check completes.

Follow SECURITY.md exactly for cookie config and error messages. Follow CODING_STANDARDS.md for component structure and the api.js wrapper pattern (credentials: 'include' on every request).
```

---

## Prompt 3 — API routes (bookings) with validation
**Time: 35 min**

```
Create /server/schemas/booking.schema.js using zod, exactly matching the schema defined in CODING_STANDARDS.md.

Create /server/middleware/validate.js — generic validation middleware that takes a zod schema and validates req.body, returning 400 with the first error message if invalid, otherwise calling next() with sanitized req.body.

Create /server/routes/bookings.js with all routes defined in ARCHITECTURE.md, each protected by requireAuth and the new validate(bookingSchema) middleware where applicable:

GET /api/bookings — return all bookings ordered by event_date ASC
GET /api/bookings/check-conflict?date=YYYY-MM-DD — return { conflict: false } or { conflict: true, booking: { id, client_name, event_type } }
GET /api/bookings/:id — return single booking with its change_log entries joined
POST /api/bookings — requireAuth, validate(bookingSchema), bookingCreateRateLimiter, then check conflict, insert, return 201 with new booking
PATCH /api/bookings/:id/log — requireAuth, append a change_log entry, return the updated log

Follow CODING_STANDARDS.md route handler pattern exactly — async, errors passed to next(err) not handled inline, correct HTTP status codes, parameterized SQL queries only.

Mount all routes at /api/bookings in server/index.js. Create /server/middleware/errorHandler.js as the global Express error handler — exact pattern from CODING_STANDARDS.md, must never leak stack traces when NODE_ENV is production. Mount it last, after all routes.
```

---

## Prompt 4 — App shell + sidebar
**Time: 30 min**

```
Build the main App.jsx shell and Sidebar.jsx component for EventFlow.

App.jsx should now handle the auth gate from Prompt 2 — render <LoginScreen /> if not authenticated, otherwise render the main layout below.

App.jsx layout (when authenticated):
- Full viewport height, flex row
- Left: <Sidebar /> fixed width 240px
- Right: main content area flex-1, overflow hidden

Sidebar.jsx:
- Background: bg-slate-900
- Top: Business name "Sharma Tent House" with a small tent icon (lucide-react: Tent), text white, bold
- Middle nav section with these items (lucide icons): Calendar (active, highlighted teal), and below it as future items (greyed out, not clickable): Package (Inventory), BarChart2 (Analytics)
- Bottom section: three quick stat cards showing — "This Month" bookings count, "Pending Advances" count, "Next Event" date — fetch these from /api/bookings (using the authenticated api.js wrapper) on mount
- Below stats: a small "Log Out" button/link that calls api.logout() and resets authStore
- Stats cards: dark bg-slate-800, rounded-lg, small label in slate-400, value in white bold

Follow CODING_STANDARDS.md for component structure and Tailwind color palette exactly.
```

---

## Prompt 5 — Calendar hero screen
**Time: 50 min**

```
Build CalendarView.jsx as the main hero screen for EventFlow.

Use @fullcalendar/react with daygrid and interaction plugins.

Fetch all bookings from /api/bookings on mount using the api utility from CODING_STANDARDS.md (credentials included automatically). Handle the loading and error states explicitly — show a spinner while loading, a clear error message with a retry button if the fetch fails (e.g. session expired mid-use should redirect to login, not show a blank calendar).

Transform bookings into FullCalendar events:
- title: "{client_name} — {event_type}"
- date: event_date
- color by status: confirmed → #0f766e (teal-700), pending → #d97706 (amber-600), cancelled → #dc2626 (red-600)
- extendedProps: store full booking object

FullCalendar config:
- headerToolbar: { left: 'prev,next today', center: 'title', right: '' }
- height: '100%'
- eventClick: opens BookingDetail panel (set selectedBooking in Zustand store)
- dateClick: opens BookingModal with that date pre-filled
- On event hover: show pointer cursor

Wrap FullCalendar in a white card with rounded-xl shadow-sm, padding. Above the calendar: a header row with "Booking Calendar" h1 in slate-800 bold, and a prominent "New Booking" button (teal, rounded-lg, lucide Plus icon) on the right that opens BookingModal.

Store bookings in Zustand using useBookingStore. After a new booking is created, re-fetch and update the calendar without page reload.

Style the FullCalendar to match the design — override its default styles in index.css to make event pills look clean and rounded.
```

---

## Prompt 6 — New booking modal + conflict detection + validation feedback
**Time: 70 min — most important prompt**

```
Build BookingModal.jsx — a slide-in modal from the right side for creating new bookings.

Trigger: "New Booking" button or a calendar dateClick sets isModalOpen=true (with optional prefilled date) in Zustand store.

Modal layout:
- Fixed overlay, dark bg-black/40 backdrop
- Modal panel slides in from right: w-[480px], h-full, bg-white, shadow-xl, p-6
- Header: "New Booking" title + X close button (lucide X)
- Scrollable form body below

Form fields (in order), each with inline validation feedback matching the zod schema in CODING_STANDARDS.md — show a red error message below any field that fails validation ON BLUR, not just on submit:
1. Client Name — text input, required, 2-100 chars
2. Phone Number — text input, required, must match Indian mobile format — show "Enter a valid 10-digit Indian mobile number" if invalid
3. Event Type — select dropdown: Wedding, Birthday, Corporate, Other
4. Event Date — date input, required — THIS IS THE CRITICAL FIELD
5. Guest Count — number input, required, positive integer
6. Venue — text input, optional
7. Advance Collected (₹) — number input, non-negative
8. Total Amount (₹) — number input, non-negative

Conflict detection on Event Date:
- On every change to the date field, call api.checkConflict(date)
- If conflict returned: render <ConflictBanner> below the date field showing "Conflict: {client_name}'s {event_type} is already booked on this date". Date input border turns red (border-red-400). Submit button disabled and grey.
- If no conflict: green checkmark icon appears next to date field. Submit button enabled (assuming rest of form is also valid).
- ConflictBanner: bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm with AlertTriangle lucide icon

On submit:
- Run full client-side validation first (instant feedback), only call API if client validation passes
- Call api.createBooking(data)
- On 201: close modal, add booking to Zustand store, calendar updates instantly
- On 409 (race condition conflict): show ConflictBanner even if frontend missed it
- On 400 (validation failed server-side despite passing client-side — should be rare but must be handled): show the server's error message in a banner at the top of the form
- On 401 (session expired): redirect to login screen
- On any other error: show a generic "Couldn't save booking, please try again" message — never show raw error objects

Submit button: full width, bg-teal-600 hover:bg-teal-700, "Confirm Booking" text, shows a loading spinner while the request is in flight, disabled state follows CODING_STANDARDS.md

All inputs: consistent style — border border-slate-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-teal-500, border-red-400 when that field has a validation error

Build ConflictBanner.jsx as a separate component.

NOTE: the "submit button disabled and grey on conflict" behavior described above was changed in Prompt 17 — if you're running this prompt fresh today, skip straight to Prompt 17's version of this behavior instead of implementing the blocking version first.
```

---

## Prompt 7 — Booking detail panel
**Time: 45 min**

```
Build BookingDetail.jsx — a right drawer panel that opens when a calendar event is clicked.

Trigger: eventClick in FullCalendar sets selectedBooking in Zustand, isDetailOpen=true.

Panel layout:
- Slides in from right, w-[420px], h-full, bg-white, shadow-xl, border-l border-slate-200
- Sits on top of calendar (fixed, right-0)
- Header: "Booking Details" + X close button
- Body: scrollable

Sections in order:

1. Client info card (bg-slate-50 rounded-xl p-4):
   - Client name: large, bold, slate-900
   - Phone: slate-600 with Phone lucide icon
   - Status badge: pill — teal for confirmed, amber for pending, red for cancelled

2. Event details grid (2-col):
   - Event Type, Date, Guest Count, Venue, Advance Paid, Total Amount
   - Each: small label in slate-400, value in slate-800 bold

3. WhatsApp actions section — heading "Send to Client":
   Three buttons, full width, spaced:
   - "Send Confirmation" — green bg, MessageCircle icon — calls confirmationMessage() from utils/whatsapp.js, opens in new tab
   - "Send Payment Reminder" — amber bg, Bell icon — calls paymentReminderMessage()
   - Both open wa.me link in new tab. Validate the phone number shape one more time before constructing the link (defense in depth — don't trust that DB data is always clean) and show an inline error instead of opening a broken link if it's somehow malformed.

4. Change log section — heading "Change Log":
   - List of existing change_log entries for this booking (fetch from GET /api/bookings/:id)
   - Each entry: timestamp (formatted as "12 Jun, 2:30 PM") + note text, small, slate-600
   - If no entries: "No changes logged yet" in slate-400
   - Below list: small textarea (max 500 chars, show remaining count) + "Log Change" button
   - On submit: call api.logChange(id, note), append to list optimistically, handle failure by reverting the optimistic update and showing an error

Build utils/whatsapp.js with confirmationMessage() and paymentReminderMessage() as defined in ARCHITECTURE.md — make sure the phone number and all text fields are validated/escaped before being inserted into the message string, and the final string is passed through encodeURIComponent.
```

---

## Prompt 8 — Usage event logging (backend)
**Time: 25 min — new, build before the analytics/usage UI**

```
Add usage event logging to EventFlow, following the event_log schema in ARCHITECTURE.md.

1. Add the event_log table to /server/db/schema.sql exactly as defined in ARCHITECTURE.md.

2. Create /server/middleware/trackUsage.js — a middleware factory that takes an event_type string and returns Express middleware that inserts a row into event_log AFTER the main route handler succeeds (don't block the response on this — fire it but don't let a logging failure break the actual request). Usage: trackUsage('booking_created').

   IMPORTANT: when metadata includes a reference to a booking, store only the booking_id as JSON metadata (e.g. {"booking_id": 14}) — never store client_name or phone in event_log, per DATA_PRIVACY.md.

3. Wire trackUsage into the relevant routes:
   - POST /api/auth/login (success only) → trackUsage('login')
   - POST /api/bookings (success only) → trackUsage('booking_created')
   - GET /api/bookings/:id → trackUsage('booking_viewed')
   - PATCH /api/bookings/:id/log → trackUsage('change_logged')

4. On the client, in BookingDetail.jsx, when the "Send Confirmation" and "Send Payment Reminder" WhatsApp buttons are clicked, call a new lightweight endpoint POST /api/usage/log-client-action with { event_type: 'whatsapp_confirmation_sent' | 'whatsapp_reminder_sent', booking_id } since these actions happen via a client-side wa.me link, not a backend round-trip. Add this route to /server/routes/usage.js, protected by requireAuth.

Test by performing a few actions (login, create a booking, view it, click a WhatsApp button) and querying the event_log table directly to confirm rows are appearing with correct event_type values and no personal data in metadata.
```

---

## Prompt 9 — Analytics + Usage routes (backend)
**Time: 30 min**

```
Create /server/routes/analytics.js and /server/routes/usage.js, both protected by requireAuth.

analytics.js:
- GET /summary — returns { revenueThisMonth, bookingsThisMonth, peakMonth: { month, count }, totalClients } computed from the bookings table (SUM/COUNT aggregates over the current month and last 6 months for peak detection; totalClients = COUNT(DISTINCT phone))
- GET /monthly — returns an array of { month: 'YYYY-MM', bookings: number, revenue: number } for the last 6 months, for charting

usage.js:
- GET /me — returns a merchant-friendly summary: { loginsThisWeek, bookingsCreatedThisMonth, whatsappMessagesSentThisMonth, lastActiveAt } computed from event_log
- GET /admin — returns the raw event_log rows (most recent 200, paginated if you have time), unfiltered, ordered by created_at DESC. This is NOT linked from the merchant-facing navigation — it exists for you to query directly (via browser devtools, a script, or Postman) when preparing panel updates. Still requires requireAuth — it should not be a fully public route.
- POST /log-client-action — accepts { event_type, booking_id }, validates event_type is one of the allowed client-side event types (whatsapp_confirmation_sent, whatsapp_reminder_sent), inserts into event_log

Mount both route files in server/index.js under /api/analytics and /api/usage.

Use parameterized queries throughout, per CODING_STANDARDS.md.
```

---

## Prompt 10 — Analytics dashboard (frontend)
**Time: 45 min**

```
Build AnalyticsView.jsx — a new screen reachable from the Sidebar (replace one of the greyed-out "future" nav items from Prompt 4 with a working "Analytics" link, lucide BarChart2 icon).

Layout:
- Page header: "Business Analytics" h1, slate-800 bold
- Top row: 4 stat cards in a grid (bg-white rounded-xl shadow-sm p-4 border border-slate-200):
  - "Revenue This Month" — large number formatted as ₹ with commas (Indian numbering, e.g. ₹1,20,000), small label below
  - "Bookings This Month" — count
  - "Peak Month" — e.g. "December (8 bookings)"
  - "Total Clients" — count
- Below: a card containing a bar chart (using recharts) showing bookings count per month for the last 6 months, x-axis = month labels, y-axis = count, bars in teal-600
- Below that: a second chart or table showing revenue per month over the same period

Fetch data from api.getAnalyticsSummary() and api.getMonthlyAnalytics() (add these to utils/api.js following the existing pattern). Show a loading skeleton while fetching, an error state with retry if the fetch fails.

If there's not yet enough data (e.g. fewer than 2 months of bookings), show a friendly empty state instead of a broken/empty chart: "Not enough data yet — analytics will appear as you add more bookings."

Use Indian Rupee formatting consistently: a small formatCurrency(amount) helper in utils/, used everywhere a ₹ amount is displayed across the whole app (retrofit this into BookingDetail.jsx and Sidebar.jsx too if they show raw numbers currently).
```

---

## Prompt 11 — Usage view (frontend)
**Time: 30 min**

```
Build UsageView.jsx — a new screen reachable from the Sidebar (add a new "My Activity" nav link, lucide Activity icon, placed below Analytics).

This is the MERCHANT-FACING view only — friendly and simple, not a raw data dump. Layout:

- Page header: "Your Activity" h1
- A welcoming one-line summary at the top, e.g. "You've been using EventFlow for [X] days" (compute from the earliest event_log entry or account creation reference point)
- 3-4 stat cards (same visual style as AnalyticsView for consistency):
  - "Logins This Week"
  - "Bookings Created This Month"
  - "WhatsApp Messages Sent This Month"
  - "Last Active" — relative time, e.g. "2 hours ago" (use a simple formatRelativeTime helper, no need for a library)
- A short encouraging footer line, e.g. "Keep it up — every booking you log here is one less thing to track on paper."

Fetch from api.getMyUsage() (add to utils/api.js). Loading and error states follow the same pattern as AnalyticsView.

Do NOT build any UI for the /api/usage/admin endpoint — that's intentionally accessed outside the merchant-facing app, per ARCHITECTURE.md's Analytics vs Usage section. Do not link to it from anywhere in the Sidebar or navigation.
```

---

## Prompt 12 — Security hardening pass
**Time: 35 min — run before any deploy**

```
Run a security hardening pass on the EventFlow codebase, following SECURITY.md exactly. Specifically:

1. Audit every route in /server/routes — confirm every route except /api/auth/login has requireAuth in its middleware chain, INCLUDING the new analytics.js and usage.js routes added in Prompts 9-11. Fix any that are missing it.

2. Confirm /server/middleware/errorHandler.js never returns err.message or err.stack when process.env.NODE_ENV === 'production'. Add a test by throwing a deliberate error and checking the response shape.

3. Search the entire codebase for any console.log that includes req.body, password, token, or full booking objects — remove or replace with a NODE_ENV-gated debug helper. Pay specific attention to anything in trackUsage.js or the analytics/usage routes that might accidentally log client phone numbers.

4. Confirm no SQL query anywhere uses string concatenation or template literals with variables — every query must use better-sqlite3's parameterized .prepare() pattern, including the new analytics aggregate queries.

5. Confirm .env is in .gitignore and run `git status` to confirm it's not tracked. Confirm .env.example has no real secret values, only placeholders.

6. Run `npm audit` in both /client and /server — report any high or critical vulnerabilities found and fix them (usually a `npm audit fix`, escalate to manual review if that doesn't resolve it).

7. Confirm the login rate limiter is actually wired into the /api/auth/login route, not just defined and unused.

8. Confirm event_log metadata never contains client_name or phone, per DATA_PRIVACY.md — spot check a few rows after generating test data.

Report back a summary of what was found and fixed, formatted as entries ready to paste into BUGS.md.
```

---

## Prompt 13 — Polish pass
**Time: 35 min**

```
Polish the EventFlow UI for the demo recording. Apply these changes:

1. Sidebar stats: make them fetch live data properly — booking count this month, count of bookings with status='pending', and the nearest upcoming event_date from today

2. Calendar event pills: override FullCalendar default styles in index.css so event pills have:
   - rounded-full pill shape
   - padding px-2 py-0.5
   - font-size 12px
   - no border
   - truncated text with ellipsis

3. Modal and drawer transitions: add CSS transition so BookingModal slides in smoothly from right (translateX animation, 200ms ease). Same for BookingDetail panel.

4. Empty state: if no bookings on a particular date, clicking on that date opens the New Booking modal with the date pre-filled (should already work from Prompt 5's dateClick handler — verify it).

5. Today highlight: make sure today's date cell in the calendar has a distinct background (FullCalendar has .fc-day-today — override to bg-teal-50)

6. Page title: set document.title to "EventFlow — Sharma Tent House"

7. Favicon: use a simple tent emoji as favicon in index.html

8. Sidebar navigation: confirm Calendar, Analytics, and My Activity are all working nav links now (no longer greyed-out placeholders), with correct active-state highlighting on whichever screen is currently shown.

9. Responsive check: make sure the layout doesn't break at 1280px wide (the likely screen recording resolution) AND on an actual mobile viewport (375px) — sidebar should collapse or become a drawer on mobile, calendar/analytics/usage screens should remain usable.

10. Loading and error states: do a pass over every screen — confirm nothing shows a blank white flash, every async boundary has a visible loading indicator, every failure state has a human-readable message.

11. Chart styling: confirm recharts bar/line colors match the app palette (teal-600 primary), axis labels are legible, and charts don't overflow their containers at any tested width.
```

---

## Prompt 14 — Demo data verification
**Time: 15 min**

```
Verify the seed data is correct for the demo recording (local dev only, NODE_ENV=development):

1. Print all seeded bookings to console on server start so I can verify dates
2. Make sure at least one booking exists on a date 5-7 days from today (for conflict demo)
3. Make sure the current month has bookings visible on at least 8 different dates
4. Add one more booking manually if needed: Suresh Kumar, Wedding, [date 6 days from today], 350 guests, venue: "Gandhi Maidan", advance: 20000, total: 120000, status: confirmed
5. Seed bookings across the PAST 5-6 months too (not just the current month) so AnalyticsView's monthly chart has enough data to look meaningful in the demo — vary the counts per month so the "peak month" stat is visibly non-trivial (e.g. December should clearly stand out with 8+ bookings vs 3-4 in other months)
6. Seed a handful of event_log rows spanning the past week (a few logins, a few booking_created events, a couple of whatsapp_confirmation_sent events) so UsageView isn't empty on first load of the recording

If any seed data is missing or malformed, fix seed.js and clear + re-run the seed. Reconfirm the NODE_ENV guard at the top of seed.js is still intact and untouched.
```

---

## Prompt 15 — Postgres migration for deploy
**Time: 40 min — see DEPLOYMENT.md — COMPLETED (migration already in code; runtime is Postgres via `pg`)**

```
Migrate EventFlow's database layer from better-sqlite3 to Postgres, following DEPLOYMENT.md exactly.


1. Install pg, remove better-sqlite3 from server dependencies (or keep both temporarily behind an env check if you want local dev to still use SQLite — but for simplicity, prefer just switching fully to Postgres using a local Postgres or a free Neon dev branch for local dev too, to keep dev/prod parity).

2. Update /server/db/schema.sql for Postgres syntax: INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY, datetime('now') → NOW(), keep TEXT as-is.

3. Rewrite /server/db/database.js to connect via a pg Pool using process.env.DATABASE_URL, with ssl enabled when NODE_ENV is production. Export the pool.

4. Update every query in /server/routes/bookings.js, /server/routes/inventory.js, and /server/routes/auth.js (if any DB access there) from better-sqlite3's synchronous .prepare().get()/.run() pattern to pg's async pool.query() with $1, $2 style parameterized placeholders instead of ?. Every route handler must now properly await these calls. Pay attention to the multi-table transactions (booking + booking_inventory, item + damage log) — pg uses a client checked out from the pool with BEGIN/COMMIT/ROLLBACK, not better-sqlite3's db.transaction(fn).

5. Re-confirm the NODE_ENV guard in seed.js still prevents seeding in production — adapt the seed insert statements to use the new pg query pattern but keep the production guard absolutely intact.

6. Test locally against a free Neon dev database before deploying — set DATABASE_URL in server/.env to the Neon connection string and confirm the app still works end to end (login, create booking, edit booking, conflict detection, inventory check, change log).

Follow CODING_STANDARDS.md's parameterized-query rule throughout — no string interpolation into SQL, ever.
```

---

## Prompt 16 — Rebrand: Sharma Tent House → Bala Ji Tent House
**Time: 15 min**

```
Rebrand the merchant persona across EventFlow from "Sharma Tent House" to "Bala Ji Tent House". The tool's own name, "EventFlow", does NOT change — only the merchant business name shown inside it.

Find and update every occurrence:

1. Sidebar.jsx — the business name header next to the tent icon: "Sharma Tent House" → "Bala Ji Tent House"
2. document.title (wherever it's set, likely main.jsx or App.jsx, per Prompt 13) — "EventFlow — Sharma Tent House" → "EventFlow — Bala Ji Tent House"
3. utils/whatsapp.js — both confirmationMessage() and paymentReminderMessage() currently sign off with "- EventFlow". Change the sign-off to "- Bala Ji Tent House" in both templates, exactly matching the templates in ARCHITECTURE.md's WhatsApp link generation section.
4. Search the whole codebase (client and server) for any other literal occurrence of "Sharma Tent House" and update it. Do NOT touch references to "EventFlow" as the tool/product name — only the merchant persona name changes.

Do not touch seed data client names (Ramesh Sharma, Priya Patel, etc.) — those are fictional client names, unrelated to the merchant business name, and should stay as-is.

After this change, re-run the WhatsApp confirmation/reminder flow manually and confirm the opened WhatsApp message reads correctly with the new sign-off.
```

---

## Prompt 17 — Conflict detection: alert, don't block
**Time: 20 min**

```
Change BookingModal.jsx's date-conflict behavior, following the updated Conflict detection logic section in ARCHITECTURE.md.

Current behavior (to remove): when a date conflict is detected, the submit button is disabled and greyed out.

New behavior:
- <ConflictBanner> still appears exactly as before when api.checkConflict(date) returns a conflict, and the date input still gets a red border
- The submit button ("Confirm Booking") stays fully enabled and clickable while a conflict is showing — remove the disabled={hasConflict} (or equivalent) condition
- Clicking submit while a conflict is showing creates the booking normally via api.createBooking(data) — no extra confirmation step for a date clash specifically (this is intentionally different from the inventory shortfall flow built in Prompt 21, which DOES get an extra confirm step)
- If the backend's own conflict check also fires (409 response, e.g. a near-simultaneous booking from a race condition), still show the ConflictBanner using the response data — but if the merchant submits again immediately after seeing it, let it through on the retry. Don't introduce a hard server-side block here either; 409 should be informational, not the end of the flow. (If this part is ambiguous on the backend, leave bookings.js's POST handler returning the conflict info on a real clash, but make sure it's not treated as a fatal error by the frontend.)

Verify: create a booking on a date that already has one. Confirm the banner shows, AND confirm you can still click "Confirm Booking" and have it succeed, with both bookings now visible on that date on the calendar.

Update BUGS.md / TESTING.md notes if you find the old blocking behavior was relied on anywhere else (e.g. a disabled-state test that needs updating).
```

---

## Prompt 18 — Edit an existing booking
**Time: 45 min**

```
Add the ability to edit an existing booking, following ARCHITECTURE.md's updated route list and Key UI decisions section.

Backend:
1. Add an `updated_at` column to the bookings table in schema.sql (TEXT, default datetime('now')), set explicitly on every PATCH.
2. Add PATCH /api/bookings/:id to /server/routes/bookings.js — requireAuth, validate(bookingSchema), then:
   - Update the booking row with the new field values
   - Set updated_at to the current timestamp
   - Return the updated booking, 200 status
3. Update GET /api/bookings/check-conflict to accept an optional ?excludeId= query param — when present, exclude that booking's own id from the conflict query, so editing a booking without changing its date doesn't falsely flag a clash against itself.
4. Wire trackUsage('booking_edited') into the PATCH route on success, following the same fire-and-forget pattern as the other trackUsage calls — metadata should be { booking_id }, nothing else.

Frontend:
5. Update bookingStore.js — add a `modalMode` field ('create' | 'edit', default 'create') and an `updateBooking` action that replaces a booking in the bookings array by id. openModal(mode) now accepts an optional mode argument.
6. Update BookingModal.jsx to handle both modes:
   - When modalMode === 'edit', prefill all form fields from the selectedBooking in the store
   - Title reads "Edit Booking" instead of "New Booking"
   - Submit button reads "Save Changes" instead of "Confirm Booking", and calls api.updateBooking(selectedBooking.id, data) instead of api.createBooking(data)
   - The date-conflict check (api.checkConflict) must pass excludeId: selectedBooking.id when in edit mode
   - On success: close modal, call updateBooking in the store, calendar and BookingDetail (if open) reflect the change immediately without a refresh
7. Add an "Edit" button (lucide Pencil icon) to BookingDetail.jsx's header, next to the close button. Clicking it calls openModal('edit') with the currently selected booking already set, opening BookingModal pre-filled.
8. Add api.updateBooking(id, data) to utils/api.js, following the existing pattern (PATCH, credentials included, error handling via the shared request() wrapper).

Verify: open a booking, click Edit, change the guest count and venue, save, and confirm both the calendar event and the detail panel reflect the change without a manual refresh. Then edit a booking's date to a date with an existing booking and confirm the alert-not-block behavior from Prompt 17 also applies correctly here.
```

---

## Prompt 19 — Inventory tracking (backend)
**Time: 50 min**

```
Build the inventory backend for EventFlow, following the Inventory tables and Inventory availability logic sections in ARCHITECTURE.md, and the inventory.schema.js definitions in CODING_STANDARDS.md.

1. Add inventory_items, booking_inventory, and inventory_damage_log tables to /server/db/schema.sql, exactly as defined in ARCHITECTURE.md's Data model section.

2. Create /server/schemas/inventory.schema.js with inventoryItemSchema, inventoryQuantityUpdateSchema, inventoryDamageAdjustSchema, and availabilityCheckSchema, exactly matching CODING_STANDARDS.md.

3. Update /server/schemas/booking.schema.js to add the optional `inventory` array field (bookingInventoryLineSchema), per CODING_STANDARDS.md.

4. Create /server/routes/inventory.js, all routes behind requireAuth:
   - GET / — return all inventory items, each with computed `usable` (total_quantity - damaged_quantity), `in_use_today` (SUM of booking_inventory.quantity for bookings where event_date = today AND status != 'cancelled'), and `available` (usable - in_use_today)
   - POST / — validate(inventoryItemSchema), insert a new item, return 201
   - PATCH /:id — validate(inventoryQuantityUpdateSchema), update total_quantity, return the updated item with recomputed fields
   - POST /:id/damage — validate(inventoryDamageAdjustSchema), apply `change` to damaged_quantity CLAMPED between 0 and total_quantity (reject or clamp — clamp and note in the response if the requested change would have gone out of bounds), insert a row into inventory_damage_log, return the updated item
   - POST /check-availability — validate(availabilityCheckSchema), for each { item_id, quantity } in the request, compute committed = SUM(booking_inventory.quantity) for OTHER bookings (status != 'cancelled') sharing the given date, excluding excludeBookingId if provided, then available = usable - committed. Return { sufficient: boolean, shortfalls: [{ item_id, name, requested, available }] } — shortfalls only includes items where requested > available

5. Update POST /api/bookings and PATCH /api/bookings/:id in bookings.js to accept the optional `inventory` array from the validated body:
   - Wrap the booking insert/update AND the booking_inventory writes in a single db.transaction(fn) — per CODING_STANDARDS.md's transaction rule, a booking should never be created with half its inventory rows missing
   - On create: after inserting the booking, insert one booking_inventory row per inventory line
   - On edit: delete all existing booking_inventory rows for that booking_id, then insert the new set (simpler and safer than diffing old vs new)
   - These routes do NOT reject on insufficient inventory — that's a frontend confirm-step concern (Prompt 21), not a backend block. The backend's job here is just to persist whatever inventory lines were submitted.

6. Mount inventory routes at /api/inventory in server/index.js.

Use parameterized queries throughout, per CODING_STANDARDS.md and SECURITY.md — including the aggregate SUM queries.

Test with curl/Postman: add an item, update its quantity, mark some damaged, mark some repaired, and call check-availability with a date that has existing bookings using that item — confirm the math is correct at each step.
```

---

## Prompt 20 — Inventory dashboard (frontend)
**Time: 50 min**

```
Build InventoryView.jsx and activate the Inventory nav item, following ARCHITECTURE.md's Key UI decisions section.

1. Update Sidebar.jsx — the "Package (Inventory)" nav item from Prompt 4 was greyed out as a future placeholder. Make it a working nav link now (lucide Package icon), following the same active-state pattern as Calendar/Analytics/My Activity.

2. Create src/store/inventoryStore.js per the structure in CODING_STANDARDS.md.

3. Build InventoryView.jsx:
   - Page header: "Inventory" h1, slate-800 bold, with an "Add Item" button (teal, lucide Plus icon) top right
   - Grid of <InventoryItemCard> — one per item, showing: item name, Total Owned, "In Use Today" (amber badge), "Available" (emerald badge), and a small Damaged count if > 0
   - Card style: bg-white rounded-xl shadow-sm border border-slate-200 p-4, consistent with AnalyticsView's stat cards
   - Below the main grid: a "Damaged / Repair Needed" section (heading + AlertTriangle icon), rendered by <DamagedItemsPanel>:
     - Lists only items with damaged_quantity > 0
     - Each row: item name, damaged count, a small form to log a damage/repair adjustment (number input for change, optional note text input, "Mark Damaged" and "Mark Repaired" buttons — Mark Damaged sends a positive change, Mark Repaired sends a negative change to api.adjustInventoryDamage)
     - If nothing is damaged: friendly empty state, "Nothing flagged as damaged right now."
   - Loading skeleton while fetching, error state with retry on failure — same pattern as AnalyticsView/UsageView

4. Build AddInventoryItemModal.jsx — small centered modal (not a slide-in drawer, this is a quick action): name input, total quantity input, both validated against inventoryItemSchema client-side first, "Add Item" submit button. On success, close modal and add the item to inventoryStore.

5. Add an inline "Edit Quantity" action on each InventoryItemCard (e.g. a small pencil icon next to Total Owned) that lets the merchant update total_quantity via api.updateInventoryQuantity — a simple inline number input + save/cancel, not a full modal.

6. Add api.getInventory(), api.addInventoryItem(), api.updateInventoryQuantity(), api.adjustInventoryDamage() to utils/api.js, following the existing pattern (already specified in CODING_STANDARDS.md's api.js example — confirm they match).

Verify against TESTING.md's new inventory checklist items: add an item, edit its quantity, mark some units damaged, mark some repaired, confirm available/in-use/damaged numbers all update correctly and immediately without a page refresh.
```

---

## Prompt 21 — Inventory-aware booking flow
**Time: 55 min**

```
Wire inventory into the booking creation/edit flow, following ARCHITECTURE.md's Inventory availability logic section exactly — this is the prompt that ties Prompts 19 and 20 into the core booking flow.

1. Build ConfirmDialog.jsx — a small reusable centered modal: title, message, "Cancel" and a confirm button (label passed as a prop, e.g. "Confirm Anyway"), used for the inventory-override step here and reusable for any future confirm-before-proceeding need. bg-white rounded-xl shadow-lg, dark overlay, consistent with the rest of the modal styling.

2. Build InventoryWarningBanner.jsx — visually distinct from ConflictBanner per CODING_STANDARDS.md's palette (amber, not red): bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-800 text-sm, AlertTriangle icon, lists each short item as "{name}: need {requested}, only {available} available".

3. Update BookingModal.jsx:
   - Add an "Inventory Needed" section to the form, after Total Amount. Render a row per existing inventory item (fetched from inventoryStore — fetch on modal open if not already loaded) with a number input defaulting to 0 (or the existing booking_inventory quantity, when in edit mode). Show "{available} available" as a small grey hint under each input, recalculated live.
   - On every change to the Event Date field OR any inventory quantity field (debounced, e.g. 300ms), call api.checkInventoryAvailability({ date, items: nonZeroQuantityLines, excludeBookingId: modalMode === 'edit' ? selectedBooking.id : undefined })
   - If the response has shortfalls.length > 0: render <InventoryWarningBanner> below the Inventory Needed section, listing the shortfalls. Do NOT disable the submit button — this banner alone does not block anything, matching the date-conflict pattern from Prompt 17.
   - On submit: run normal client-side validation first. THEN, if the most recent availability check still shows a shortfall, do NOT call the create/edit API yet — instead open <ConfirmDialog> with a message summarizing the shortfall (e.g. "You don't have enough Plastic Chairs for this date — need 150, only 100 available. Confirm this booking anyway?"). Only call api.createBooking/api.updateBooking if the merchant confirms. If they cancel, close the dialog and leave the form open and untouched.
   - If there's no shortfall, submit proceeds immediately as before, no dialog.
   - Include the inventory lines (item_id + quantity, omitting zero-quantity rows) in the payload sent to createBooking/updateBooking.

4. Update BookingDetail.jsx to show a new "Inventory Used" section (between Event details and the WhatsApp actions section) listing each inventory_items line attached to this booking with its quantity, fetched alongside the booking detail from GET /api/bookings/:id (update that route in bookings.js to also join and return booking_inventory rows with item names).

Verify end-to-end: create a booking requesting more chairs than available for that date — confirm the warning banner appears, confirm clicking submit opens the ConfirmDialog instead of submitting immediately, confirm cancelling the dialog leaves the form open, and confirm confirming it actually creates the booking with the over-allocated inventory line saved. Then verify the opposite — enough inventory — submits with no dialog at all.
```

---

## Demo script (for screen recording)

Follow this exactly during recording. Keep narration tight.

**Note:** this script predates Prompts 16–21 (rebrand, non-blocking conflict, edit booking, inventory). The 2:00 structure below still works almost unchanged — just say "Bala Ji Tent House" instead of "Sharma Tent House" wherever the business name comes up, and the conflict-banner beat now naturally ends with "...and the owner can still take it" instead of being blocked. If there's room, a short inventory beat (10-15 sec, showing the Inventory screen and an availability warning) is worth adding before the Analytics beat — but re-time the whole script before recording rather than guessing at the cut, since this hasn't been verified against the actual new screens yet.

**[0:00–0:10]** Open the app. Pan across the calendar — show it's populated with real bookings across the month. "This is EventFlow — a booking dashboard built specifically for tent and catering businesses."

**[0:10–0:20]** Point to the sidebar stats. "The owner sees their month at a glance — total bookings, pending advances, next event."

**[0:20–0:40]** Click "New Booking". Form slides in. "A new inquiry just came in." Fill in: Neha Singh, phone, Wedding, pick the conflicting date. Conflict banner appears. "The system immediately flags the clash — Suresh Kumar's wedding is already on that date — but it's the owner's call whether they can still take it."

**[0:40–0:55]** Change to a free date. Green checkmark appears. Fill remaining fields. Click "Confirm Booking". Booking appears on calendar instantly.

**[0:55–1:15]** Click the new booking on the calendar. Detail panel slides in. "The owner can reach the client in one tap." Click "Send Confirmation" — WhatsApp opens with message pre-filled, signed from Bala Ji Tent House. Back to app.

**[1:15–1:35]** Navigate to Analytics. "And the owner finally sees their business clearly — revenue, bookings, their peak month — without doing a single manual count." Point to the chart.

**[1:35–1:50]** Navigate to My Activity. "EventFlow also shows the owner their own usage — proof the tool is actually part of their daily routine, not sitting unused."

**[1:50–2:05]** Pull back to calendar. "EventFlow — built for the merchant. Zero pen and paper."
```
