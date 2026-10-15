# TESTING.md — EventFlow

## Philosophy

Given the timeline, this is **not** asking you to write a full automated test suite. It's a structured manual testing pass that takes 10-15 minutes per milestone and catches the bugs that actually embarrass a product in front of a panel or a real merchant. If time allows later, the "Worth automating later" section flags what to convert into real tests first.

---

## Manual test pass — run after every PROMPTS.md milestone

### The happy path (always test this first)
- [ ] Can log in with the correct password
- [ ] Calendar loads and shows seeded bookings
- [ ] Can create a new booking on a free date
- [ ] New booking appears on calendar immediately, no refresh needed
- [ ] Can click a booking and see its detail panel
- [ ] Can click "Edit" on a booking, change a field, save, and see the change reflected on the calendar and detail panel without a refresh
- [ ] WhatsApp confirmation button opens WhatsApp with correct, readable text, signed "Bala Ji Tent House"
- [ ] WhatsApp payment reminder button opens WhatsApp with correct, readable text, signed "Bala Ji Tent House"
- [ ] Can log a change note and see it appear with a timestamp
- [ ] Analytics screen loads and shows correct revenue/booking/peak-month figures matching the seed data
- [ ] My Activity screen loads and reflects recent actions (a fresh login, a fresh booking) without needing a manual refresh
- [ ] Inventory screen loads and shows seeded items with correct Total / In Use Today / Available / Damaged counts
- [ ] Can add a new inventory item type and see it appear in the grid immediately
- [ ] Can update an item's total quantity owned and see Available recalculate
- [ ] Can mark units of an item as damaged, see Damaged count go up and Available go down
- [ ] Can mark damaged units as repaired, see Damaged count go down and Available go up
- [ ] Can add inventory quantities (e.g. chairs needed) while creating a booking, when there's enough stock — no warning shown, booking saves normally

### The unhappy path (this is where vibe-coded apps fall apart)
- [ ] Try logging in with the wrong password — see a clear error, not a frozen screen or console error
- [ ] Try creating a booking with an empty client name — see a validation message, not a silent failure or a broken record in the DB
- [ ] Try creating a booking with a phone number that's not 10 digits — rejected with a clear message
- [ ] Try creating a booking with a guest count of 0 or negative — rejected
- [ ] Try creating a booking on a date that already has a booking — `ConflictBanner` appears, **submit stays enabled**, and confirming the booking anyway succeeds (this is intentionally different from the old blocking behavior — re-verify it wasn't accidentally left as blocking)
- [ ] Try creating a booking on a date that already has a booking, and actually click "Confirm Booking" with the banner showing — confirm the new booking is created and both bookings now show on that date
- [ ] Editing a booking without changing its date does **not** show a false conflict against itself
- [ ] Try requesting more of an inventory item than is available for the selected date — `InventoryWarningBanner` appears with correct requested/available numbers
- [ ] With an inventory shortfall showing, click submit — confirm a `ConfirmDialog` appears asking to confirm anyway, and the booking is **not** created until that dialog is explicitly confirmed
- [ ] Cancel the inventory shortfall `ConfirmDialog` — confirm the form stays open and nothing was submitted
- [ ] Editing a booking's inventory lines down to a smaller quantity doesn't falsely flag a shortfall against its own original quantity (confirm `excludeBookingId` is wired through)
- [ ] Turn off the backend server and try to load the app — see a clear "can't connect" message, not a blank white screen
- [ ] Submit the booking form twice quickly (double-click) — confirm it doesn't create two duplicate bookings
- [ ] Try accessing `/api/bookings` directly in the browser without being logged in — confirm it returns 401, not data
- [ ] Try accessing `/api/analytics/summary`, `/api/usage/admin`, and `/api/inventory` directly without being logged in — confirm all return 401
- [ ] Open Analytics screen with a freshly seeded/near-empty database — confirm it shows the "not enough data" empty state, not a broken chart

### Email OTP (signup and password reset)
- [ ] Signup OTP happy path: Sign up, enter a new email, receive the 6-digit code, type it (or paste it), set business name and password, land in an empty dashboard
- [ ] Wrong code x5 lockout: enter five wrong codes, then the correct one; every attempt says "Code is invalid or expired." and the boxes clear. Request a new code (after the 60 s cooldown) and confirm it works
- [ ] Resend cooldown: the button reads "Resend code in 1:00" and counts down disabled; after it ends, Resend sends a new code and the countdown restarts; clicking "Send code" again early shows "Please wait before requesting another code."
- [ ] Expired code: wait 10 minutes after requesting a code, enter it, and confirm "Code is invalid or expired."
- [ ] Forgot password with an unknown email shows exactly the same message ("If an account exists for this email, we've sent a code.") and moves to the code step, and no email arrives
- [ ] A reset logs out a second browser: log in on browser A and B, reset the password on A, reload B and confirm it shows the login screen
- [ ] Signup spam doesn't block reset: for an email that already has an account, press "Send code" on Sign up five or more times (it says an account exists), then use Forgot password for the same email and confirm the code still arrives
- [ ] Which account: on Forgot password, start with a wrong email, press "Wrong email? Change it", use a different one, finish the reset; steps 2 and 3 say "Resetting password for" the masked second email, the green login banner names it, and the login email is already filled in
- [ ] Daily cap: request a sixth code for the same email within 24 hours (clear the 60 s cooldown between requests, or use different networks); Sign up shows "Too many codes requested for this email. Please try again tomorrow.", Forgot password still shows the generic message and no sixth email arrives
- [ ] Layout: the three steps of both flows at 375px and 1280px have no horizontal scroll and the six boxes fit on one row

### Rebrand check
- [ ] Sidebar shows "Bala Ji Tent House", not "Sharma Tent House" or "EventFlow"
- [ ] Browser tab title reads "EventFlow — Bala Ji Tent House"
- [ ] Both WhatsApp message templates sign off as "Bala Ji Tent House" — search the codebase for any remaining literal "Sharma Tent House" or a stray "EventFlow" sign-off in `utils/whatsapp.js` and confirm there's none left

### Visual/UX pass
- [ ] Resize browser to 1280px width (likely recording resolution) — nothing overlaps or overflows
- [ ] Open on an actual mobile phone browser, not just desktop devtools — merchant is mobile-first
- [ ] Check loading states — does the calendar show a spinner/skeleton while bookings load, or a jarring empty-then-populated flash?
- [ ] Check button disabled states are visually obvious, not just functionally disabled
- [ ] Confirm `ConflictBanner` (red) and `InventoryWarningBanner` (amber) are visually distinguishable at a glance — they mean different things and shouldn't look identical

---

## Pre-deploy test pass (in addition to the above, on the LIVE url)

- [ ] All of the above, repeated on the deployed Vercel/Render URLs — not just localhost
- [ ] Confirm data persists after a backend restart (see DEPLOYMENT.md verification checklist — this is the SQLite-vs-Postgres proof point)
- [ ] Confirm a logged-out session can't see any booking or inventory data, even by guessing API URLs
- [ ] Confirm HTTPS is active, no browser security warnings
- [ ] **Tenant isolation:** `cd server && npm run verify:isolation -- --confirm-host=<dev host>` passes on the dev database (all PASS, exit 0). It boots its own server (port 3007; override with the `ISOLATION_PORT` env var), creates labelled `ISOLATION-FIXTURE` rows and removes them again; if a run is killed, the next run removes the leftovers first. It never runs against production: use it on dev before every deploy, and confirm on the live site that a logged-in merchant sees only their own bookings
- [ ] Test the full flow on the merchant's actual phone if possible, before calling it "deployed"

---

## What to do when a test fails

1. Log it in `BUGS.md` immediately with the severity rating
2. If it's a Critical or High severity bug (per the definitions in `BUGS.md`), **do not move to the next milestone** until it's fixed
3. If it's Medium/Low, note it and continue — but don't let these silently accumulate past 3-4 open items without a cleanup pass

---

## Milestone verify scripts (historical — not a regression suite)

The `verify-*.mjs` scripts under `server/scripts/` were written against earlier milestone behavior. Do not treat failures as regressions without checking whether the script predates the current product model.

- **SQLite era / Postgres:** scripts using `better-sqlite3` directly will not work after Prompt 15 (Postgres) without a rewrite — see prior note in project history.
- **Non-blocking date conflicts (Prompt 17+):** `verify-bookings-api.mjs` and `verify-usage-privacy.mjs` still expect POST `/bookings` to return **409** on a date clash and to skip the insert. That is **outdated** — 409 was never reintroduced. Clashes are advisory-only: POST always returns **201** and includes `conflict: { detected: true, booking: {...} }` on the response body when a same-date booking exists (field omitted when clear). Re-run those scripts only after updating their expectations, or rely on the manual checks above (lines 35–36).

---

## Worth automating later (not now, but flag for post-POC)

If EventFlow moves past the single-merchant POC stage, these are the first things worth converting to real automated tests (e.g. with Vitest + React Testing Library for frontend, Jest/Supertest for backend):

- Conflict detection logic (`conflictCheck.js`) — pure function, easy to unit test, high value since it's the core feature
- Inventory availability calculation (per-date committed quantity vs. usable) — also a pure function once extracted, same value proposition as conflict detection
- Booking schema validation (`booking.schema.js`) — easy to test exhaustively, catches regressions when fields change
- Inventory schema validation (`inventory.schema.js`) — same reasoning
- Auth middleware (`requireAuth.js`) — security-critical, worth locking down with tests so a future refactor can't accidentally weaken it
- API route status codes — a simple Supertest suite hitting each endpoint with valid/invalid/unauthenticated requests

---

## Pre-Prompt-15 gate — verified 2026-06-24

Full manual + automated verification pass completed covering Prompts 16–21 (rebrand, conflict alert behavior, booking edit, inventory backend, inventory dashboard, inventory-aware booking flow). All critical paths passed. Five remaining manual spot-checks (ConfirmDialog flow, Add Inventory Item, Damage/Repair cycle, Change Log, WhatsApp templates) verified via automated scripts in server/scripts/. No blocking issues found. Build is ready for Prompt 15.
