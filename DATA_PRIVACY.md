# DATA_PRIVACY.md — EventFlow

## Why this file exists

The moment a real client's name and phone number is entered into this system, it stops being "just a project" and becomes a system that processes another person's personal data — someone who never saw a privacy policy, never clicked "I agree," and doesn't know this app exists. This file is a plain-language guide to handling that responsibly, including the relevant Indian law.

This is not a substitute for legal advice. If EventFlow grows beyond a single merchant's personal use, get an actual lawyer to review this before wider rollout.

---

## The relevant law: India's DPDP Act, 2023

India's **Digital Personal Data Protection Act (DPDP Act), 2023** governs how personal data of Indian individuals is collected, stored, and used. A few principles from it are directly relevant here, in plain language:

- **Purpose limitation**: data should only be used for the reason it was collected. A client's phone number was given to coordinate their wedding booking — it shouldn't be reused for unrelated marketing without separate consent.
- **Data minimization**: collect only what's needed. EventFlow's schema is already minimal (name, phone, event details) — resist the urge to add fields "just in case."
- **Reasonable security safeguards**: the law expects "reasonable security practices" to protect personal data — this is the legal hook behind everything in SECURITY.md. An unauthenticated public URL holding client phone numbers would not meet this bar.
- **Breach notification**: if personal data is compromised, there are notification obligations. For a single-merchant POC this is unlikely to be triggered in practice, but it's the reason rotating a leaked secret immediately (SECURITY.md) isn't optional.

This app is being built **for** the merchant (a data fiduciary under the Act) — the merchant is collecting their own clients' data to run their business. EventFlow as a tool should make it easier for the merchant to handle that data responsibly, not harder.

---

## What this means practically for EventFlow

### Data EventFlow stores
- Client name
- Client phone number
- Event type, date, guest count, venue
- Advance/total amounts
- Change log notes (free text — could contain anything the merchant types)
- **Inventory data** (`inventory_items`, `booking_inventory`, `inventory_damage_log` tables) — item names (e.g. "Plastic Chairs"), quantities, and damage notes. This is data about the *merchant's business assets*, not about any person, so it carries no DPDP-relevant risk on its own. The only thing worth watching: `inventory_damage_log.note` is free text, same caution as `change_log.change_note` below — don't let a merchant casually type a client's name into a damage note ("torn during Priya's wedding setup") without realizing it links business-asset data back to a specific client. Not a hard technical restriction, just worth a heads-up in the same plain-language conversation described below.
- **Usage events** (`event_log` table) — timestamps of merchant logins and actions (booking created, booking edited, WhatsApp sent, etc.). This is data about the *merchant's* own usage of the tool, not about their clients — but the merchant should still know it's being collected and why (adoption tracking for the PoC), per the transparency note below. This data should never include client names/phone numbers in its `metadata` field — log a booking ID reference only, not the personal details, to keep this table low-risk even if it's queried more casually during panel prep.

### Data EventFlow does NOT need and should never collect
- Client email (not used anywhere in the current flow — don't add it speculatively)
- Client address (venue field is sufficient; don't add a separate home address field)
- Any payment card / bank details (UPI links via WhatsApp are just text — no payment data ever touches this system, and it should stay that way for v1)
- Any biometric or government ID data — completely out of scope, no reason this would ever be needed

### Who can see this data
- Only the merchant (single login, per SECURITY.md)
- You, as the developer, will have access during build and via the Render/Neon dashboards — be deliberate about this. Don't export or copy real client data into chat logs, screenshots, or anywhere outside the app and database itself.

### Telling the merchant what you're doing with their data
Even informally, the merchant should know:
- Where their data lives (which cloud providers — Render, Vercel, Neon/Supabase)
- That it's password-protected but they are responsible for keeping that password private
- That you (the developer) can technically access the database directly — be upfront about this rather than implying otherwise
- **That the app logs their own usage (logins, bookings created/edited, messages sent) — and why**: this is being used to demonstrate the tool's value to the hackathon/program panel. This is a reasonable and honest thing to track, but it should be said out loud, not left implicit. Most merchants will have no objection once it's explained — but the explanation should happen.
- What happens if they want to stop using the app (see Data Retention below)

A short, honest conversation covers this — it doesn't need to be a formal legal document for a single-merchant POC, but it does need to happen.

---

## Data retention and deletion

- Define what happens to a booking after the event has passed — for v1, keep it (it becomes useful historical/repeat-client data per the original brainstorm), but this is a deliberate choice, not a default to leave unexamined
- If the merchant ever wants to stop using EventFlow, they should be able to get their data out (see Export below) and have it deleted from the hosted database on request
- There is no automatic data deletion in v1 — this is a known gap, acceptable for a single trusted merchant relationship, but should be revisited before onboarding additional merchants

---

## Data export (merchant's right to their own data)

Even without a formal feature, make sure you (the developer) can produce a clean CSV/JSON export of the merchant's bookings on request — this is both good practice and aligns with the spirit of data portability principles in the DPDP Act. A simple script using the existing DB connection that dumps the `bookings` table to CSV is sufficient for v1; it doesn't need a UI button yet.

---

## What NOT to do (common mistakes at this stage)

- **Don't paste real client names/phone numbers into Claude, Cursor, ChatGPT, or any AI tool while debugging.** Use the seeded fake data (Ramesh Sharma, Priya Patel, etc.) for all debugging conversations, including with Claude Projects. If a real bug only reproduces with real data, anonymize it first (replace the real name/number with a fake one in the same shape) before pasting into any chat.
- **Don't screenshot the live app with real client data visible** for any purpose — demo recordings, status updates, social posts — without blurring or replacing the data first.
- **Don't store the merchant's login password anywhere except their own memory / password manager.** You as the developer should know the bcrypt hash exists, never the plaintext.
- **Don't add analytics/tracking scripts (Google Analytics, etc.) without thinking through what they'd capture** — a booking dashboard with client names rendered on screen plus a third-party tracking script is a combination worth being deliberate about, not defaulting into.

---

## Quick checklist before going live with real data

- [ ] Merchant has been told, in plain language, where their data is stored and who can access it
- [ ] Login password is something only the merchant knows (not reused from another account, not shared over an insecure channel)
- [ ] You have a plan for what happens to the data if the merchant stops using the app
- [ ] No real client data has been pasted into any AI chat tool during development
- [ ] SECURITY.md's pre-deploy checklist is fully checked off — privacy and security are the same problem here, not separate ones
