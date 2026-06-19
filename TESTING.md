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
- [ ] WhatsApp confirmation button opens WhatsApp with correct, readable text
- [ ] WhatsApp payment reminder button opens WhatsApp with correct, readable text
- [ ] Can log a change note and see it appear with a timestamp
- [ ] Analytics screen loads and shows correct revenue/booking/peak-month figures matching the seed data
- [ ] My Activity screen loads and reflects recent actions (a fresh login, a fresh booking) without needing a manual refresh

### The unhappy path (this is where vibe-coded apps fall apart)
- [ ] Try logging in with the wrong password — see a clear error, not a frozen screen or console error
- [ ] Try creating a booking with an empty client name — see a validation message, not a silent failure or a broken record in the DB
- [ ] Try creating a booking with a phone number that's not 10 digits — rejected with a clear message
- [ ] Try creating a booking with a guest count of 0 or negative — rejected
- [ ] Try creating a booking on a date that already has a booking — conflict banner appears, submit is blocked
- [ ] Turn off the backend server and try to load the app — see a clear "can't connect" message, not a blank white screen
- [ ] Submit the booking form twice quickly (double-click) — confirm it doesn't create two duplicate bookings
- [ ] Try accessing `/api/bookings` directly in the browser without being logged in — confirm it returns 401, not data
- [ ] Try accessing `/api/analytics/summary` and `/api/usage/admin` directly without being logged in — confirm both return 401
- [ ] Open Analytics screen with a freshly seeded/near-empty database — confirm it shows the "not enough data" empty state, not a broken chart

### Visual/UX pass
- [ ] Resize browser to 1280px width (likely recording resolution) — nothing overlaps or overflows
- [ ] Open on an actual mobile phone browser, not just desktop devtools — merchant is mobile-first
- [ ] Check loading states — does the calendar show a spinner/skeleton while bookings load, or a jarring empty-then-populated flash?
- [ ] Check button disabled states are visually obvious, not just functionally disabled

---

## Pre-deploy test pass (in addition to the above, on the LIVE url)

- [ ] All of the above, repeated on the deployed Vercel/Render URLs — not just localhost
- [ ] Confirm data persists after a backend restart (see DEPLOYMENT.md verification checklist — this is the SQLite-vs-Postgres proof point)
- [ ] Confirm a logged-out session can't see any booking data, even by guessing API URLs
- [ ] Confirm HTTPS is active, no browser security warnings
- [ ] Test the full flow on the merchant's actual phone if possible, before calling it "deployed"

---

## What to do when a test fails

1. Log it in `BUGS.md` immediately with the severity rating
2. If it's a Critical or High severity bug (per the definitions in `BUGS.md`), **do not move to the next milestone** until it's fixed
3. If it's Medium/Low, note it and continue — but don't let these silently accumulate past 3-4 open items without a cleanup pass

---

## Worth automating later (not now, but flag for post-POC)

If EventFlow moves past the single-merchant POC stage, these are the first things worth converting to real automated tests (e.g. with Vitest + React Testing Library for frontend, Jest/Supertest for backend):

- Conflict detection logic (`conflictCheck.js`) — pure function, easy to unit test, high value since it's the core feature
- Booking schema validation (`booking.schema.js`) — easy to test exhaustively, catches regressions when fields change
- Auth middleware (`requireAuth.js`) — security-critical, worth locking down with tests so a future refactor can't accidentally weaken it
- API route status codes — a simple Supertest suite hitting each endpoint with valid/invalid/unauthenticated requests
