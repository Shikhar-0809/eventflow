# ROADMAP.md — EventFlow

## Why this file exists

Scope discipline is the difference between shipping a working v1 and never shipping anything. This file is where "good ideas for later" go to be respected, not acted on prematurely. Every time you're tempted to add something mid-build, check here first — if it's already listed, it's already been considered and deferred on purpose.

---

## Scope decisions log

Changes to the locked v1 scope get recorded here so the "why" doesn't get lost later. This is a living section — append to it, don't rewrite history.

- **[Added to v1]** Inventory tracking — items, available/in-use/damaged counts, and a per-date availability check tied to bookings. Originally filed under v2 ("Conflict detection extended from 'date clash' to 'not enough inventory available on this date'"). Pulled forward at the merchant's direct request. Scope kept intentionally lighter than the full v2 description: availability is computed **per event date** by summing what's already committed to other bookings on that exact date — mirroring the existing date-clash logic — rather than a true deploy/return state machine. Real physical deploy/return tracking remains a later idea if it's ever needed; see the new v2 section below.
- **[Added to v1]** Edit an existing booking. Originally filed under v1.5 ("Edit/cancel an existing booking — currently create-only"). Only **edit** was pulled forward; **cancel** stays in v1.5 since it wasn't requested.
- **[Behavior change]** Date-clash conflict detection no longer blocks submission. It shows an alert (`ConflictBanner`), but the merchant can still confirm the booking — two events on the same date may be perfectly fine for this merchant to take on. Inventory shortfalls follow a related but stricter pattern: alert, then an explicit "confirm anyway" step before the merchant can override it, since a chair shortage is a more concrete physical problem than two calendar entries sharing a date.
- **[Rebrand]** Merchant persona renamed from "Sharma Tent House" to "Bala Ji Tent House" — Sidebar branding, WhatsApp message sign-off, and document title all updated. (The tool itself is still called EventFlow; only the merchant-facing business name changed.) WhatsApp messages now sign off as "Bala Ji Tent House" instead of "EventFlow" — the message is sent on the merchant's behalf, not the software's.
- **[UI decision]** Inventory quantity selection in BookingModal uses a visual "unit grid" picker (BookMyShow-style: a grid of unit indicators showing filled/available, click to set quantity) instead of a plain number input. This is presentation only — the underlying model remains quantity-based (available = usable - committed per event date), not individually-identified units. True per-unit identity tracking (which specific chair goes where) was considered and explicitly rejected as out of scope — items are interchangeable for this business.
- **[Resolved]** Bugs #005 (cold reload connection error), #012 (calendar event context switch), and a tab-title nit on the connection error screen — all fixed and verified before Prompt 15. No open bugs entering the Postgres migration.
- **[Pulled forward from v5+]** Multi-merchant accounts — any tent/catering business can sign up and use EventFlow with fully isolated data. Pulled forward to make EventFlow a product rather than a single merchant's tool. Billing/subscriptions remain out of scope.
- **[Delivered — Prompts 24–25]** Multi-merchant data isolation, the first half of what was pulled forward above. Prompt 24 added a migration runner, the `merchants` table, `merchant_id` on every business table and composite foreign keys; Prompt 25 made the session carry the merchant and scoped every API route, script and seed to it (a merchant can only ever see their own bookings, inventory, expenses, change log, settings and usage; another merchant's id looks exactly like a nonexistent one), proven by `npm run verify:isolation`. **Why now:** to make EventFlow a product rather than one merchant's tool, and because isolation has to exist before a second real merchant, not after: a data leak between merchants is a Critical bug (BUGS.md). It was enforced in the database as well as in the routes so that a single route bug cannot cross merchants. **Not delivered yet:** real per-merchant accounts and the onboarding flow (Prompt 26, Firebase auth); until then the single env-password login is merchant 1. Billing/subscriptions remain out of scope. DATA_PRIVACY.md was updated for the shared database, but the formal privacy policy and consent flows are still open (see the v5+ section).
- **[Delivered — 2026-10-15, commits `41b6c98`..`cfbd012`]** Self-service sign-up and per-merchant email + password login (migration `005_merchant_accounts`, `POST /api/auth/signup`, `SignupScreen`), with the merchant's `business_name` shown throughout the app and in WhatsApp sign-offs. Supersedes the "not delivered yet" note two entries above: the single env-password login is gone (`MERCHANT_PASSWORD_HASH` no longer exists) and merchant 1 logs in through the `merchants` table. **Why:** a product needs accounts before a second merchant exists.
- **[Delivered — 2026-10-15, commit `a1a0103`]** Email verification at sign-up and self-service password reset by emailed code (migration `006_email_otps`; Brevo for delivery; sessions end on reset via `token_version`). Pulled forward from the v1.5 "self-service password reset" bullet and the v5+ "still missing: email verification, password reset" note. **Why:** without it anyone could register any address, and a forgotten password needed the developer. Firebase / phone / Google login (Prompt 26) is still open.
- **[Delivered — 2026-10-16, commits `0b5db27`, `6a8c2e6`]** Merchant profile: business name and own WhatsApp number, change password / email, log out other devices, recent sign-ins, in-app account deletion (migration `007_merchant_profile`). **Why:** merchants needed to manage their own account without the developer; the merchant's WhatsApp number moved from an env var to the profile.
- **[Delivered — Postgres + deployment]** The Postgres migration (Prompt 15, `5ed072b`, 2026-06-24) and the Vercel + Render + Neon deployment are done; the v1 scope bullet below that called deployment "deliberately deferred" is superseded. Production holds real merchant data, so `CLAUDE.md` now governs how changes are made. First live deploy: on or before 2026-06-30 (commit `051d8f2` that day fixes the cross-site cookie between Render and Vercel; the exact day is not recorded).
- **[Pulled forward from v1.5 / v3]** Cancel a booking (status action in `BookingDetail`), search and filter bookings (Records screen), Excel export of records (`xlsx`, not CSV) and a date-range report with print and PDF download (Analytics). The v1.5 and v3 bullets below still list them as deferred; they are delivered.
- **[Behavior change]** Cancelled bookings no longer count toward revenue, booking counts, peak month or clients in Analytics, matching Reports and the Sidebar/Calendar (BUGS #096); the rule lives in `server/services/bookingStatus.js`. Booking prices and totals are computed on the server (BUGS #062). Analytics numbers in the Sidebar refresh after booking changes (BUGS #097, #098), and report PDFs no longer split a booking card across pages (BUGS #095; mobile PDF size, #094, is deferred).

---

## v1 (current build) — locked scope

- Single merchant, password-protected login *(superseded: multi-merchant accounts with email + password; see the Scope decisions log)*
- Calendar view of all bookings
- Create booking with real-time conflict detection (alert-only, doesn't block — see Scope decisions log)
- **Edit an existing booking** (added — see Scope decisions log)
- Booking detail view
- WhatsApp confirmation + payment reminder (deep link, no API), signed as Bala Ji Tent House *(now signed with each merchant's own business name)*
- Manual change log per booking
- **Business analytics dashboard** — revenue, bookings/month, peak month, total clients (merchant-facing)
- **Usage tracking** — merchant-facing "Your Activity" summary + internal adoption-proof event log
- **Inventory tracking** (added — see Scope decisions log):
  - Inventory item types (chairs, tables, sofas, tents, generators, etc.) with total owned and damaged/repair count
  - Available vs. in-use-today counts shown separately per item
  - Add new item types; edit total quantity owned
  - Mark items damaged / mark items repaired, with a lightweight audit log (mirrors the existing booking change-log pattern)
  - Attach inventory needs to a booking (e.g. "150 chairs, 20 tables")
  - Per-event-date availability check when creating or editing a booking — alert + explicit "confirm anyway" step if insufficient, never a silent block
- Deployed on Vercel (frontend) + Render (backend) + Neon (Postgres) — *originally "deliberately deferred" per the Prompt 15 decision; now done and live, see the Scope decisions log and `DEPLOYMENT.md`.*

This is the version validated with the real merchant from the original conversation. Nothing below gets built until v1 is in their hands and being used.

---

## v1.5 — small additions once v1 is validated

These are low-effort, high-value additions that don't expand scope conceptually, just depth:

- Cancel an existing booking *(done)*
- Search/filter bookings by client name or date range *(done: Records screen)*
- Simple data export button (CSV) in the UI — *an Excel export of records exists; a full per-account export is still by request only, per `DATA_PRIVACY.md`*
- "Mark advance as fully paid" quick action on the detail panel
- Self-service password reset *(done: emailed code, see the Scope decisions log)*

---

## v2 — deeper inventory & operations

What's left of the original "inventory tracking" bucket after the core was pulled forward into v1:

- True deploy/return tracking — explicitly marking inventory as physically out for an event and back in stock, instead of computing "in use" from the event date alone
- Multi-day event support (inventory held across a date range, not a single day)
- Damage/loss **cost** tracking (₹ value of damaged items, not just a count)
- Low-stock threshold alerts (e.g. "only 20% of chairs are unbooked this month")

---

## v3 — deeper business intelligence

Basic business analytics (revenue, bookings/month, peak month) shipped in v1 per panel feedback. v3 is the deeper layer once there's enough real usage data to make it meaningful:

- Repeat client identification (requires more historical data than v1 launch will have)
- Profit margin per event (requires cost tracking, which doesn't exist yet)
- Year-over-year comparison (requires a full year of real data first)
- Exportable business reports (PDF/Excel)

---

## v4 — customer-facing layer

Explicitly the last thing to build, per the panel's direct feedback: *"Introducing something for the customer will bring in two problems. One the scope gets broader. Second, their adoption will be a very different problem statement."*

This means v4 is not just "add a customer view" — it requires re-validating adoption with an entirely different user (the client booking the event, not the merchant). Do not treat this as a simple UI addition; treat it as a new problem statement requiring its own discovery process, possibly its own POC.

Possible shape, once that discovery happens:
- Client-facing booking confirmation page (read-only, no login — link sent via WhatsApp)
- Digital quotation the client can approve with one tap
- Client-side payment status visibility

---

## v5+ — multi-merchant

Only relevant if EventFlow moves from "one merchant's tool" to "a product for many merchants." This is a different system, not an incremental feature:

- Multi-tenancy — **done (Prompts 24–25):** merchants table, merchant-scoped session and routes; **email + password accounts, self-service sign-up, email verification and password reset are built** (migrations `005`-`007`). Still missing: Firebase/phone/Google login (Prompt 26)
- Per-merchant data isolation — **done (Prompts 24–25):** enforced in the routes and by composite foreign keys, verified by `npm run verify:isolation`
- Onboarding flow for new merchants — sign-up (email + code + password) and the Profile screen are done; guided business-profile onboarding and Firebase auth remain (Prompt 26)
- Billing/subscription model — **still out of scope**
- *(Partly done: `DATA_PRIVACY.md` now describes the shared database and the pre-onboarding checklist; the full rewrite below is still open.)* This would also reopen `DATA_PRIVACY.md` for a full rewrite — single-merchant informal trust does not scale to multi-tenant SaaS, and DPDP Act obligations get materially heavier (formal privacy policy, consent flows, possibly a Data Protection Officer depending on scale)

---

## Explicitly rejected ideas (and why)

Keeping a "no" list prevents re-litigating the same idea every few weeks.

- **Native mobile app**: a mobile-responsive web app covers the actual need; native app adds build/distribution complexity with no proportional benefit for a single merchant
- **Real payment gateway integration**: UPI deep-links via WhatsApp already solve "ask for money" without EventFlow ever touching real payment data, which is a meaningfully larger security/compliance surface (PCI-adjacent concerns) not worth taking on for v1
- **AI-generated quotations/pricing**: interesting idea, but the merchant didn't name pricing guesswork as a pain point — building it would be solving a problem that wasn't validated
- **Behavioral/automated everything before booking flow is solid**: automation on top of a shaky core flow just automates the wrong thing faster

---

## How to use this file

Before adding any feature not in "v1 (current build) — locked scope," ask: is this already listed somewhere below? If yes, it's deferred on purpose — don't build it now. If it's genuinely new, add it to the appropriate version bucket and keep building v1. If an explicit decision is made to pull something forward (as happened with inventory and booking-edit), record it in the **Scope decisions log** at the top of this file rather than just silently moving the bullet — the log is what keeps this file trustworthy over time.
