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
