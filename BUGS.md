# BUGS.md — EventFlow

## How to use this file

Log every bug here as you find it during the build. Format: one line description, status, and fix note. This keeps Cursor context clean — paste the relevant bug entry when asking Cursor to fix something.

**Security bugs get logged here too** — but tagged `[SECURITY]` in the description and treated as High severity by default regardless of how minor they look. A "minor" auth bypass is still an auth bypass.

---

## Severity definitions

| Severity | Meaning | Example |
|---|---|---|
| Critical | Real client data exposed, or app is unusable | Phone numbers visible in public API response without auth |
| High | Core flow broken, or a security gap that's exploitable | Conflict detection silently fails; login can be brute-forced |
| Medium | Annoying but workaroundable, no data risk | WhatsApp link opens wrong tab |
| Low | Cosmetic | Button hover color slightly off |

**Rule: nothing rated Critical or High ships to the deployed URL.** Medium/Low can ship with a known-issues note.

---

No open bugs as of pre-Prompt-15 gate — all v1 issues resolved.

## Bug tracker

| # | Description | Severity | Status | Fix |
|---|---|---|---|---|
| 020 | [SECURITY-adjacent / process] Partial Prompt 15 (Postgres) migration code was present in the working tree (database.js exiting on missing DATABASE_URL, routes using pg) despite Prompt 15 being explicitly deferred in PROMPTS.md — broke local server startup ahead of Prompts 16-21 | High | Fixed | Reverted database.js, schema.sql, routes, seeds, trackUsage.js, package.json back to better-sqlite3. Verification pass confirmed all DB paths use better-sqlite3 .prepare()/.run()/.get()/.all() with ? placeholders, no pg references remain, db.transaction(fn) pattern intact in seed files. |
| 021 | Date conflict blocked booking creation — submit disabled and POST /bookings returned 409, contradicting ARCHITECTURE.md advisory-only conflict model (Prompt 17) | Medium | Fixed | Prompt 17 follow-up: submit no longer gated on hasConflict; POST/PATCH always persist after validation. Backend detects same-date clashes (non-cancelled) and returns optional `conflict: { detected, booking }` on 201/200 — never 409. Prior gap: backend check was removed entirely, so API-only/race paths had no clash record; restored with informational response shape matching inventory shortfalls. |
| 022 | Verification scripts' finally-block cleanup (verifyDbCleanup.mjs pattern) does not run if the script process is abruptly terminated (e.g. killed mid-execution) rather than failing gracefully via a thrown error — confirmed this is expected Node.js process-termination behavior, not a logic bug in the cleanup code itself. Can leave orphaned test rows in the dev DB if a verify script is force-killed. | Low | Open (documented, accepted) | Cleanup logic verified correct for graceful failures (deliberate-throw test passed). Abrupt termination is an accepted low-stakes risk for a single-developer dev DB — not worth engineering around at this scale. If orphaned test data is ever found, clean up manually using the naming convention (ZZZ_TEST_* / Audit *) to identify it. |
| 023 | [SECURITY] Session cookie set with sameSite: 'lax' in production is withheld by the browser on cross-domain (Vercel→Render) fetch requests, causing intermittent 401 on authenticated routes after a successful login | High | Fixed | sameSite now conditional — 'none' in production (paired with secure: true), 'lax' in development. See SECURITY.md's Session cookie configuration section. Superseded by #024 — cross-site cookie approach unreliable on mobile ITP browsers. |
| 024 | [SECURITY] SameSite=None cross-site cookie (see #023) unreliable on mobile browsers — iOS Safari ITP and similar Android privacy browsers block cross-site cookies regardless of SameSite=None; Secure flags, causing login to silently fail to persist on some phones (confirmed: Bharat's phone, user's phone in two browsers) while working on desktop and other phones | High | Fixed | Eliminated cross-site cookie dependency entirely via a Vercel rewrite proxying /api/* to the Render backend, making all requests same-origin from the browser's perspective. Cookie reverted to sameSite: 'lax', which is spec-reliable across all browsers including mobile ITP-restricted ones. See updated SECURITY.md. |
| 025 | When editing a booking, pre-fill unit_price from booking_inventory rows not from current standard rates — standard rates may have changed since the booking was created | Medium | Fixed | BookingPage edit mode loads saved line prices via GET /api/bookings/:id before applying inventoryStore standard rates. |
| 027 | Blank white screen when opening booking form in edit mode — selectedBooking.inventory undefined caused unguarded access / render crash | High | Fixed | Added optional chaining and ?? [] fallbacks on inventory in BookingPage.jsx; normalizeEventDate for date input; editLoadError inline message; BookingPageErrorBoundary so crashes show Close instead of wiping the app |
| 028 | GET /api/bookings/:id returning 304 with empty body — booking detail and edit load failed because fetch treats 304 as error | High | Fixed | Disabled Express ETag; `Cache-Control: no-store` on all `/api` routes before handlers |
| 029 | Booking detail panel showed fetch error despite GET /api/bookings/:id returning 200 — sync effect wiped fetched booking on id type mismatch; inventory/change_log needed array guards | High | Fixed | BookingDetail.jsx: bookingIdsMatch(), preserve fetched inventory on store merge, normalizeBookingDetail(); backend GET /:id returns normalized inventory array; api.js rejects non-object JSON bodies |
| 030 | CalendarView showed "Could not load bookings" despite GET /api/bookings returning 200 with a valid array — api.js `request()` rejected all array JSON bodies (regression from #029 guard meant for single-booking detail only) | High | Fixed | Removed `Array.isArray(body)` from generic `request()` validation; moved array rejection to `getBooking()` only. Added `console.error` in CalendarView catch block. |
| 031 | BookingDetail threw "TypeError: e.map is not a function" on open — `changeLog` or `booking.inventory` could be a non-array object at render time (stale state before fetch, sync-effect merge with `?? []` preserving objects, or error fallback without normalize) | High | Fixed | `safeChangeLog`/`asArray` guards on all render-time `.map()`/`.filter()` collections; sync effect and error fallback use `normalizeBookingDetail()`; `setChangeLog(asArray(...))` on fetch success. |
| 032 | BookingPage (BookingModal) crashed in edit mode with "TypeError: e.map is not a function" inside `formIsDirty` useMemo — `inventoryLinesEqual()` called `.map()` on quantity objects `{ itemId: qty }` instead of line arrays; `inventoryItems`/`data.inventory` also unguarded against non-array truthy values | High | Fixed | Added `quantitiesEqual()` for dirty-check; `asArray()` guards on `inventoryItems`, booking inventory lines, shortfalls, and availability; `billLines` useMemo uses `safeInventoryItems`. |
| 033 | BookingPage edit mode "Save Changes" showed blocked cursor and was unclickable — `canSubmit` gated on `conflictChecking` (could stick true after effect cleanup race) and `isFormValid` failed on open because computed `grandTotal` was 0 while stored `advance` > 0 before inventory lines hydrated | High | Fixed | Removed `conflictChecking` from `canSubmit` (per advisory conflict model); reset `conflictChecking` on effect cleanup; `resolvedBilling` falls back to stored booking totals in edit mode until inventory loads; explicit `cursor-pointer` when enabled. |
| 034 | Save Changes disabled again in edit mode for legacy `event_type = 'other'` bookings with `event_type_custom = null` — shared zod refinement required custom label on every `canSubmit` check, not just submit | High | Fixed | Removed cross-field `event_type_custom` refinement from client/server schemas; validation moved to `handleSubmit` pre-check and blur-only `validateEventTypeCustom()`; `bookingToForm` normalizes null to `''`. Server POST/PATCH keep inline guard. |
| 035 | Save Changes disabled on edit open for bookings with `advance > 0` — `resolvedBilling` returned computed `grandTotal: 0` when `grand_total` column was 0 but `total` held the real value (`??` treats 0 as set); advance `superRefine` then failed before inventory hydrated | High | Fixed | Edit-mode `resolvedBilling` always uses stored `grand_total`/`total` until inventory lines load; client `superRefine` only checks `advance > grandTotal` when `grandTotal > 0`. |

Carried forward from the prior build pass — see `HANDOFF.md` for the full archive of #001–#019. Log new bugs found during the rebrand/inventory/edit-booking work below this line as they're found.

---

## Bug entry template

```
| 001 | [Short description] [SECURITY] if applicable | Critical / High / Medium / Low | Open / Fixed | [How it was fixed] |
```

---

## Known gotchas to watch for

These are common issues with the stack used — check these first before logging a new bug:

**FullCalendar**
- If events don't show up: check that the `events` prop is an array and each item has `date` (not `start`) for daygrid
- If calendar overflows: make sure the parent container has an explicit height, not just `h-full`
- If event click doesn't fire: make sure `interactionPlugin` is imported and added to `plugins` array

**better-sqlite3**
- Synchronous by design — do not wrap in async/await, it will behave unexpectedly
- If DB file not found: check that the path in `database.js` is relative to the server root, not the project root
- Multi-table writes (booking + `booking_inventory` rows, item + damage log row) need `db.transaction(fn)` — a half-completed insert across two tables is a real risk once inventory lines are part of every booking write

**Zustand**
- If state updates don't reflect in calendar: make sure you're spreading the array `[...state.bookings, newBooking]` not mutating it
- If store is undefined: check that the component is inside the React tree (not called outside a component)
- `bookingStore`'s `modalMode` ('create' vs 'edit') must be reset to `'create'` on close — if it leaks, the next "New Booking" click can accidentally open in edit mode against a stale `selectedBooking`

**WhatsApp links**
- If link doesn't open WhatsApp: check that phone number has no spaces or dashes — strip all non-digits before building the link
- If message is malformed: always `encodeURIComponent` the full message string
- If the message still says "EventFlow" at the end: check `utils/whatsapp.js` — both templates should sign off as "Bala Ji Tent House" per the rebrand, see `ARCHITECTURE.md`

**CORS**
- If frontend can't reach backend: make sure `cors()` middleware is added before routes in `index.js`
- If still failing in **local dev**: explicitly set `cors({ origin: process.env.CORS_ORIGIN, credentials: true })` — `credentials: true` is required for the httpOnly auth cookie on cross-port localhost requests
- In **production**, the browser should only call `/api/*` on the Vercel domain (proxied to Render) — if `VITE_API_URL` still targets `onrender.com` directly, you reintroduce cross-site cookie failures (#024)

**Tailwind**
- If styles don't apply: check `tailwind.config.js` content array includes `./src/**/*.{js,jsx}`
- If custom FullCalendar overrides don't work: add `!important` or increase specificity with parent selector

**Inventory**
- If chair/table counts look wrong on `InventoryView`: check that "in use" is computed for **today's date only** — items committed to bookings on other dates should never reduce today's available count
- If a booking's date is changed during an edit: the availability recalculation must use the *new* date, not the date the booking was originally created against — a stale date in the check produces a confidently wrong number
- If editing a booking shows a false inventory shortfall against itself: confirm `excludeBookingId` is actually being passed to `/api/inventory/check-availability` — same class of bug as forgetting `excludeId` on the date-conflict check
- If `damaged_quantity` goes negative or above `total_quantity`: the clamp logic in the `/api/inventory/:id/damage` route is missing or wrong — this should never be reachable from the UI, but the backend must enforce it regardless of what the frontend sends

---

## Security-specific gotchas (check before every milestone)

**Auth cookie not persisting**
- If the merchant gets logged out on every refresh: check the cookie is set with `httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax'` — `secure: true` in dev (on http://localhost) will silently block the cookie from being set at all
- If login succeeds but the next API call returns 401 on the **deployed** URL with `VITE_API_URL` still pointing at the Render domain directly (cross-origin fetch): the cookie is third-party from the browser's perspective — fix is architectural: Vercel rewrite + `VITE_API_URL=/api` so requests are same-origin (see #024), not a further cookie-flag tweak
- If login works on desktop but fails to persist on **some mobile browsers** (especially iOS Safari with default privacy settings) even with `SameSite=None; Secure` set correctly: iOS ITP and similar Android privacy browsers block cross-site cookies regardless of spec-correct flags — same fix as above (#024): same-origin proxy, `sameSite: 'lax'`

**Validation skipped on the server**
- If a malformed booking gets through: the most common cause is the `validate(schema)` middleware being added to the route but placed *after* the route handler instead of before it in the middleware chain — order matters in Express. Same applies to the new inventory routes.

**Conflict check race condition**
- Frontend conflict check is advisory only (UX feedback) — the merchant can confirm a booking even when `ConflictBanner` is showing. POST `/bookings` always returns **201** and may include `conflict: { detected: true, booking: {...} }` when another non-cancelled booking shares the date (field omitted when clear). If two creates hit the same date within milliseconds, both can succeed; the response body records the clash for API-only paths.

**Inventory availability race condition**
- Same shape of bug as the conflict-check race condition above, applied to inventory: the `/api/inventory/check-availability` check and the actual booking insert are not atomic. Two near-simultaneous bookings against the same date and item could both pass the check and together oversubscribe an item. For a single merchant typing manually, this is acceptably low-probability for v1 — documented here, not fixed. Not worth a locking mechanism at this scale.

**Secrets accidentally logged**
- If `JWT_SECRET` or `MERCHANT_PASSWORD_HASH` ever appears in a `console.log` during debugging — search the whole codebase for that log line and remove it before the next commit, not just before deploy

**Rate limiting missing on login**
- If `/auth/login` has no rate limiter, it's brute-forceable. This must be present before deploy — see SECURITY.md for the exact middleware to add

**Usage event logging blocking the main request**
- If `trackUsage` middleware is wired to run BEFORE the response is sent (rather than after, fire-and-forget), a slow or failed DB write to `event_log` can delay or break the actual user-facing action (e.g. booking creation hanging because the analytics insert is slow). Always let the main response go out first, log usage as a non-blocking side effect, and catch/swallow any logging errors so they never surface to the merchant.

**event_log accidentally storing personal data**
- If `metadata` on an event_log row ever contains `client_name` or `phone` instead of just a `booking_id` reference, this is a [SECURITY] / data-privacy bug, not a cosmetic one — see DATA_PRIVACY.md. Fix immediately, and check whether any already-logged rows need to be scrubbed.

**Charts breaking on sparse data**
- If `AnalyticsView` is opened before enough months of seed data exist, recharts can render an empty or visually broken chart rather than a clean "not enough data" message. Always test this view against both a full dataset and a near-empty one.

---

## Resolved bugs archive

Move fixed bugs here from the tracker above once confirmed working. The full archive of #001–#004, #006–#011, #013–#019 from the prior build pass lives in project history / `HANDOFF.md` — re-paste entries here as they're reconfirmed in this chat if a fresh log is needed.

| # | Description | Fix |
|---|---|---|
| 005 | Cold reload with backend down shows LoginScreen instead of a distinct "can't connect" message (checkAuth network failure misread as invalid session) | authStore `connectionError` flag distinguishes network/5xx from 401; App.jsx renders a full-screen reconnect message instead of LoginScreen |
| 012 | Clicking a different calendar event while BookingDetail drawer is already open doesn't switch the panel — stays on the previously opened booking until closed and reopened | BookingDetail sync effect returns null when selectedBooking.id changes instead of keeping stale local booking state |
| — | Tab title read "EventFlow — Log In" on connection error screen instead of "EventFlow — Bala Ji Tent House" | App.jsx title effect treats `connectionError` the same as `isAuthenticated` so the merchant sees the product name, not the login title |
| — | See HANDOFF.md for the #001–#019 archive carried over from the previous session | — |
| — | Delete inventory item: transaction order, active-booking filter, error-clear on dialog reopen, parameterized queries — all verified | Verified post-implementation |
| 026 | Booking form inventory quantity inputs showed leading zeros (e.g. "015") because fields defaulted to controlled number 0 | BookingPage quantity inputs use empty string display with placeholder="0", parseInt on change, and blur reset to 0 |
| 027 | Blank white screen when opening booking form in edit mode — selectedBooking.inventory undefined caused unguarded access / render crash | Added optional chaining and ?? [] fallbacks on inventory in BookingPage.jsx; normalizeEventDate; editLoadError; BookingPageErrorBoundary |
| — | GET /api/bookings/:id returning 304 — fixed by adding no-store Cache-Control header globally to /api routes | Disabled Express ETag (`app.set('etag', false)`) and mounted `Cache-Control: no-store` on all `/api` routes before handlers so GET booking detail always returns 200 JSON |
| 029 | Booking detail panel showed error despite GET /api/bookings/:id returning 200 — sync effect returned null on id mismatch and wiped fetched booking; non-array inventory would crash .map() | bookingIdsMatch() + preserve inventory/change_log on merge in BookingDetail.jsx; backend normalizes inventory rows; api.js rejects invalid JSON bodies |
