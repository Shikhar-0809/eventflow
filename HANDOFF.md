# EventFlow — Handoff Summary

**Purpose of this file:** paste this into a new chat (along with the project's `.md` docs — `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `SECURITY.md`, `DATA_PRIVACY.md`, `TESTING.md`, `BUGS.md`, `ROADMAP.md`, `PROMPTS.md`, `DEPLOYMENT.md`) to continue this build with full context, without re-explaining everything from scratch.

---

## What EventFlow is

A merchant-facing booking management dashboard for a single tent/catering business in India (built around a fictional "Sharma Tent House" persona for the demo). Built as a hackathon/program POC, but treated as **product-grade, not vibe-coded**, throughout — real client names and phone numbers were always assumed to be in scope, so auth, validation, and data privacy were taken seriously from Prompt 2 onward.

Stack: React 18 + Vite + Tailwind (client), Node + Express + better-sqlite3 (server, local dev), JWT + bcrypt auth, Zod validation, Zustand state, FullCalendar, Recharts. Full detail in `ARCHITECTURE.md`.

---

## Build status: Prompts 0–14 complete and verified. Prompt 15 (Postgres migration) deliberately NOT started.

Every prompt from `PROMPTS.md` through Prompt 14 was run, then verified with a dedicated pass (UI-level via MCP browser / Playwright, API-level via curl/scripts, DB-level via direct row inspection) before moving to the next. This was not a "build fast and hope" process — almost every milestone surfaced at least one real bug during verification, which got fixed and logged in `BUGS.md` before proceeding. Treat `BUGS.md` as authoritative for what's actually been found and fixed.

**The app is fully functional locally right now** — `localhost:5173` (frontend) + `localhost:3001` (backend), running on SQLite. This is demo-ready.

---

## What's deliberately NOT done, and why

- **Prompt 15 (Postgres migration)** — scoped but not executed. A `DEPLOYMENT.md` was drafted (Neon + Render + Vercel topology, matching `ARCHITECTURE.md`'s stated stack) and added to the project. The migration's scope was audited: 8 production-critical files need rewriting from `better-sqlite3` sync calls to `pg` async calls (`server/db/database.js`, `seed.js`, `analyticsHistorySeed.js`, `demoSeed.js`, `routes/bookings.js`, `routes/analytics.js`, `routes/usage.js`, `middleware/trackUsage.js`). 17 verification scripts under `server/scripts/` were deliberately excluded from migration scope — they verified already-closed milestones and don't need to keep working against Postgres.
  - **Decision made: skip this for now.** The hackathon submission form's "Live Product Link" field is optional; the required deliverables are a 2-min screen recording + GitHub repo link, neither of which needs a live deployed URL. Migrating the DB layer was judged too risky to attempt under time pressure right before recording — if it broke something, it could've jeopardized a working local demo for zero submission benefit.
  - **Fresh production secrets were already generated** (in case migration happens later) — saved to `server/.render-production-secrets` (gitignored, never committed). Contains a new `JWT_SECRET`, `ADMIN_ACCESS_KEY`, and a bcrypt `MERCHANT_PASSWORD_HASH` (plaintext password was never printed or logged, per `SECURITY.md`).
  - **Still needed before migration actually happens:** a real Neon (or Supabase) Postgres connection string to test against. Was not yet confirmed set up as of this handoff.

- **Actual deployment** (Render/Vercel/Neon going live) — not started, blocked behind Prompt 15.

---

## Demo readiness

Confirmed ready for a local 2-minute screen recording, following the script in `PROMPTS.md`. Key facts to know:

- **Conflict-detection demo date:** 2026-06-25 (Kavita Reddy's wedding, confirmed + Arjun Mehta, pending — same date, used to demo the conflict banner)
- **June 2026 bookings:** 11 rows, 10 distinct dates (seed ids 1–10 + Suresh Kumar id 69 added 6 days from "today" for demo richness)
- **Peak Month (Analytics):** currently June, after stray test-data cleanup — this lines up nicely with the demo since the calendar view is also showing June
- **My Activity numbers:** deliberately cleaned to small, believable values (3 logins, 2 bookings created, 2 WhatsApp messages over the past week) — was previously inflated to 36/9/11 by accumulated Cursor verification-script activity in `event_log`; this was identified and purged, keeping only 7 intentionally-seeded demo rows (tagged `demo_seed: true` in metadata)
- **Important operational note:** running any verification `.mjs` script between now and recording will repopulate `event_log` with real script-driven rows and inflate the My Activity numbers again. The cleanup logic re-runs on every dev server boot (`server/db/demoSeed.js`), so if this happens, **restart the server before recording** to re-purge.
- **Login credential:** a real local dev password was generated via `bcryptjs` and is known to the user (not stored in this chat or any file in plaintext) — if a new chat needs to regenerate it, use the documented `SECURITY.md` command and report the plaintext directly in chat (this is fine for a local-dev-only credential, not a real secret).
- **Real phone number caution:** explicitly decided NOT to use a real phone number anywhere in the demo (WhatsApp links embed it directly into a visible URL in the recording) — use seeded fake numbers in the `9876543XXX` pattern instead.

---

## Known open bugs (BUGS.md) — carry these into any new chat

| # | Description | Severity | Status |
|---|---|---|---|
| #005 | Cold reload with backend down shows LoginScreen instead of a distinct "can't connect" message (checkAuth network failure misread as invalid session) | Medium | Open |
| #012 | Clicking a different calendar event while BookingDetail drawer is already open doesn't switch the panel — stays on the previously opened booking until closed and reopened | Low | Open |

Everything else logged in `BUGS.md` (#001–#004, #006–#011, #013–#019) is **Fixed**. Notably #019 (silent loss of in-progress booking/change-log data on nav) was High severity and is now fixed with a dirty-form confirm-before-discard guard.

---

## Process patterns worth carrying into the new chat

These aren't project facts, they're working agreements that proved useful across this build:

1. **Verification before moving to the next prompt, not after several have piled up.** Each milestone got a dedicated check (TESTING.md-relevant items, SECURITY.md-relevant items where new routes/auth surface was touched) before moving on.
2. **No manual checks delegated to the user** — Cursor verifies via curl/scripts/MCP browser/Playwright itself, not by asking the user to click through the UI.
3. **Every genuinely fixed bug gets a BUGS.md entry**, even small ones — this was enforced repeatedly throughout the build after a few early passes tried to skip logging "minor" fixes.
4. **Real findings get logged even when deliberately left unfixed** (e.g. #005, #012) — distinguishing "found and fixed," "found and deferred on purpose," and "not yet checked" rather than letting things quietly disappear from the record.
5. **Server restart hygiene matters.** This build hit real friction with inline shell environment variable overrides (`$env:JWT_SECRET=...`) causing confusing session-invalidation symptoms, and with stuck/zombied terminals after many manual restarts. The clean pattern: clear all shell overrides, restart via `cd server && node index.js` only, confirm `JWT_SECRET loaded: true` in the startup log, before trusting any verification run.
6. **DB row-level privacy checks, not just code review**, for anything touching `event_log` — `DATA_PRIVACY.md`'s rule that `event_log.metadata` must never contain `client_name` or `phone` was checked against actual table contents multiple times, not assumed from the schema alone.
7. **Verification/test artifacts (stray bookings, probe event_log rows) need explicit cleanup**, not left in the DB after a verification pass — this came up repeatedly (Prompts 8, 9, 10, 14) and should keep being checked for in future passes.

---

## Suggested next steps (in rough priority order)

1. Record the 2-minute demo (app is ready now)
2. Push final code to GitHub if not already done, share view access per the hackathon form's instructions
3. Submit with GitHub link + recording link; leave "Live Product Link" blank
4. (Later, no deadline pressure) Set up a Neon Postgres instance, run Prompt 15 properly with full pre/post verification, then follow `DEPLOYMENT.md` Steps 1–4 to actually go live
5. (Later) Consider addressing #005 and #012 — both are well-understood, low-complexity fixes, just not urgent
