# ROADMAP.md — EventFlow

## Why this file exists

Scope discipline is the difference between shipping a working v1 and never shipping anything. This file is where "good ideas for later" go to be respected, not acted on prematurely. Every time you're tempted to add something mid-build, check here first — if it's already listed, it's already been considered and deferred on purpose.

---

## v1 (current build) — locked scope

- Single merchant, password-protected login
- Calendar view of all bookings
- Create booking with real-time conflict detection
- Booking detail view
- WhatsApp confirmation + payment reminder (deep link, no API)
- Manual change log per booking
- **Business analytics dashboard** — revenue, bookings/month, peak month, total clients (merchant-facing)
- **Usage tracking** — merchant-facing "Your Activity" summary + internal adoption-proof event log (added per panel feedback — see ARCHITECTURE.md's Analytics vs Usage section)
- Deployed on Vercel (frontend) + Render (backend) + Neon/Supabase (Postgres)

This is the version validated with the real merchant from the original conversation. Nothing below gets built until v1 is in their hands and being used.

---

## v1.5 — small additions once v1 is validated

These are low-effort, high-value additions that don't expand scope conceptually, just depth:

- Edit/cancel an existing booking (currently create-only)
- Search/filter bookings by client name or date range
- Simple data export button (CSV) in the UI — currently this exists only as a manual script per DATA_PRIVACY.md
- "Mark advance as fully paid" quick action on the detail panel
- Self-service password reset (currently manual via developer, per RUNBOOK.md)

---

## v2 — inventory tracking

The second problem the merchant named, after booking chaos. Deferred from v1 specifically because the panel feedback was to prove value with one flow first.

- Inventory items table: tents, chairs, tables, generators, etc. with quantity owned
- Link inventory to bookings — deploy/return tracking
- Conflict detection extended from "date clash" to "not enough inventory available on this date"
- Damage/loss logging

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

- Multi-tenancy (currently the entire auth model assumes one merchant)
- Per-merchant data isolation
- Onboarding flow for new merchants
- Billing/subscription model
- This would also reopen DATA_PRIVACY.md for a full rewrite — single-merchant informal trust does not scale to multi-tenant SaaS, and DPDP Act obligations get materially heavier (formal privacy policy, consent flows, possibly a Data Protection Officer depending on scale)

---

## Explicitly rejected ideas (and why)

Keeping a "no" list prevents re-litigating the same idea every few weeks.

- **Native mobile app**: a mobile-responsive web app covers the actual need; native app adds build/distribution complexity with no proportional benefit for a single merchant
- **Real payment gateway integration**: UPI deep-links via WhatsApp already solve "ask for money" without EventFlow ever touching real payment data, which is a meaningfully larger security/compliance surface (PCI-adjacent concerns) not worth taking on for v1
- **AI-generated quotations/pricing**: interesting idea, but the merchant didn't name pricing guesswork as a pain point — building it would be solving a problem that wasn't validated
- **Behavioral/automated everything before booking flow is solid**: automation on top of a shaky core flow just automates the wrong thing faster

---

## How to use this file

Before adding any feature not in "v1 (current build) — locked scope," ask: is this already listed somewhere below? If yes, it's deferred on purpose — don't build it now. If it's genuinely new, add it to the appropriate version bucket and keep building v1.
