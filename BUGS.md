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

## Bug tracker

| # | Description | Severity | Status | Fix |
|---|---|---|---|---|
| 001 | better-sqlite3 ERR_DLOPEN_FAILED — Node ABI mismatch between Cursor terminal (Node 22 / MODULE 127) and external PowerShell (nvm Node 20 / MODULE 115) | Medium | Fixed | See note below |
| 002 | PowerShell `$` in bcrypt hash corrupts `MERCHANT_PASSWORD_HASH` when set without quoting — login fails with "Incorrect password" | Low | Fixed | Wrap the value in single quotes when setting env vars containing `$` in PowerShell |

### 001 — better-sqlite3 ABI mismatch (ERR_DLOPEN_FAILED)

**Root cause:** nvm-windows had Node **20.20.2** active in external PowerShell (`C:\nvm4w\nodejs\node.exe`, `NODE_MODULE_VERSION` **115**) while Cursor's bundled terminal used Node **22.22.0** (`NODE_MODULE_VERSION` **127**). `npm install` compiled `better-sqlite3`'s native binary against Node 22's ABI (127), which then failed to load under Node 20 (115) with `ERR_DLOPEN_FAILED`.

**Fix:**
1. `nvm install 22.22.0` + `nvm use 22.22.0` — align external PowerShell with Cursor's bundled Node version
2. `npm rebuild better-sqlite3` — recompile the native binary against the now-matching version
3. **Windows gotcha:** a leftover `node index.js` process held a file lock on `better_sqlite3.node` (`EBUSY`/`EPERM`) — had to `Stop-Process` the running node PID before the rebuild would succeed. Kill running node processes before any future native-module rebuild on Windows.

**Status:** Fixed. Verified `node -v` and `node -p "process.versions.modules"` match between Cursor's terminal and external PowerShell; server boots clean under both `NODE_ENV=development` and `NODE_ENV=production`; prod seed guard holds; `/api/health` returns `{"status":"ok"}`.

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
- On Windows, kill any running `node` processes before `npm rebuild better-sqlite3` — a live server holds a file lock on `better_sqlite3.node` and rebuild fails with `EBUSY`/`EPERM`
- If `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION` mismatch: `npm install` and `node` must use the same Node version — check with `node -v` and `node -p "process.versions.modules"` in both Cursor and external PowerShell; align via `nvm use` then `npm rebuild better-sqlite3`

**Zustand**
- If state updates don't reflect in calendar: make sure you're spreading the array `[...state.bookings, newBooking]` not mutating it
- If store is undefined: check that the component is inside the React tree (not called outside a component)

**WhatsApp links**
- If link doesn't open WhatsApp: check that phone number has no spaces or dashes — strip all non-digits before building the link
- If message is malformed: always `encodeURIComponent` the full message string

**CORS**
- If frontend can't reach backend: make sure `cors()` middleware is added before routes in `index.js`
- If still failing: explicitly set `cors({ origin: process.env.CORS_ORIGIN, credentials: true })` — `credentials: true` is required for the httpOnly auth cookie to be sent cross-origin

**Tailwind**
- If styles don't apply: check `tailwind.config.js` content array includes `./src/**/*.{js,jsx}`
- If custom FullCalendar overrides don't work: add `!important` or increase specificity with parent selector

---

## Security-specific gotchas (check before every milestone)

**Auth cookie not persisting**
- If the merchant gets logged out on every refresh: check the cookie is set with `httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax'` — `secure: true` in dev (on http://localhost) will silently block the cookie from being set at all

**Validation skipped on the server**
- If a malformed booking gets through: the most common cause is the `validate(schema)` middleware being added to the route but placed *after* the route handler instead of before it in the middleware chain — order matters in Express

**Conflict check race condition**
- Frontend conflict check is advisory only (UX feedback). If two requests hit POST `/bookings` for the same date within milliseconds of each other, the backend check-then-insert is not atomic in plain SQL. For v1 with a single merchant typing manually, this is a low-probability bug — documented here, not yet fixed. If it becomes relevant, fix with a `UNIQUE` constraint on `event_date` in the schema and catch the DB-level constraint error instead of relying on the SELECT-then-INSERT pattern.

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

Move fixed bugs here from the tracker above once confirmed working.

| # | Description | Fix |
|---|---|---|
| — | None yet | — |
