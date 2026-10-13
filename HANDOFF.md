# EventFlow — Handoff Summary

**Purpose of this file:** paste this into a new chat (along with the project's `.md` docs — `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `SECURITY.md`, `DATA_PRIVACY.md`, `TESTING.md`, `BUGS.md`, `ROADMAP.md`, `PROMPTS.md`, `DEPLOYMENT.md`) to continue this build with full context, without re-explaining everything from scratch.

---

## What EventFlow is

A merchant-facing booking management dashboard for a single tent/catering business in India (merchant persona: **Bala Ji Tent House**). Built as a hackathon/program POC, but treated as **product-grade, not vibe-coded**, throughout — real client names and phone numbers were always assumed to be in scope, so auth, validation, and data privacy were taken seriously from Prompt 2 onward.

Stack: React 18 + Vite + Tailwind (client), Node + Express + **Postgres via `pg`** (server), JWT + bcrypt auth, Zod validation, Zustand state, FullCalendar, Recharts, SheetJS (records export). Full detail in `ARCHITECTURE.md`.

---

## Build status: Prompts 0–21 complete; Prompt 15 (Postgres) is in the code

Every prompt from `PROMPTS.md` through Prompt 14 was run and verified, then Prompts 16–21 extended v1 (rebrand, non-blocking conflict, edit booking, inventory). **Prompt 15 (Postgres migration) is reflected in the current codebase** — runtime DB is Postgres via `pg` (`DATABASE_URL`); see `ARCHITECTURE.md` and `DEPLOYMENT.md`.

**The app runs against Postgres** — set `DATABASE_URL` in `server/.env`, then `localhost:5173` (frontend) + `localhost:3001` (backend).

---

## Deployment topology (current)

- **Frontend:** Vercel — `VITE_API_URL=/api`; rewrites `/api/*` → Render API (same-origin cookie)
- **Backend:** Render — Express in `server/`, `npm start` → `node index.js`
- **Database:** Postgres (Neon/Supabase or equivalent) via `DATABASE_URL`

See `DEPLOYMENT.md` for platform steps and env vars (including `ADMIN_ACCESS_KEY`, `VITE_MERCHANT_PHONE`). Secrets stay in host env or gitignored files — never committed — and plaintext passwords are never logged. See `SECURITY.md`.

---

## Demo readiness

Confirmed ready for a local 2-minute screen recording, following the script in `PROMPTS.md`. Key facts to know:

- **Conflict-detection demo date:** 2026-06-25 (Kavita Reddy's wedding, confirmed + Arjun Mehta, pending — same date, used to demo the conflict banner)
- **June 2026 bookings:** 11 rows, 10 distinct dates (seed ids 1–10 + Suresh Kumar id 69 added 6 days from "today" for demo richness)
- **Peak Month (Analytics):** currently June, after stray test-data cleanup — this lines up nicely with the demo since the calendar view is also showing June
- **My Activity numbers:** deliberately cleaned to small, believable values (3 logins, 2 bookings created, 2 WhatsApp messages over the past week) — was previously inflated by accumulated verification-script activity in `event_log`; cleanup logic re-runs on every dev server boot (`server/db/demoSeed.js`), so if verify scripts inflate numbers again, **restart the server before recording**
- **Login credential:** a real local dev password was generated via `bcryptjs` and is known to the user (not stored in this chat or any file in plaintext) — if a new chat needs to regenerate it, use the documented `SECURITY.md` command
- **Real phone number caution:** explicitly decided NOT to use a real phone number anywhere in the demo (WhatsApp links embed it directly into a visible URL in the recording) — use seeded fake numbers in the `9876543XXX` pattern instead. Merchant self-summary phone comes from `VITE_MERCHANT_PHONE`.

---

## Known open bugs (BUGS.md) — carry these into any new chat

| # | Description | Severity | Status |
|---|---|---|---|
| #022 | Verify-script cleanup may leave orphans if process killed | Low | Open (accepted) |
| #036 | Morning briefing / countdown "today" uses local Date / UTC edge before IST morning | Low | Open |

See `BUGS.md` for the full tracker. Notably #019 (silent loss of in-progress form data) and #005 / #012 (connection screen / booking detail switch) are Fixed in the archive.

---

## Process patterns worth carrying into the new chat

These aren't project facts, they're working agreements that proved useful across this build:

1. **Verification before moving to the next prompt, not after several have piled up.** Each milestone got a dedicated check (TESTING.md-relevant items, SECURITY.md-relevant items where new routes/auth surface was touched) before moving on.
2. **No manual checks delegated to the user** — Cursor verifies via curl/scripts/MCP browser/Playwright itself, not by asking the user to click through the UI.
3. **Every genuinely fixed bug gets a BUGS.md entry**, even small ones — this was enforced repeatedly throughout the build after a few early passes tried to skip logging "minor" fixes.
4. **Real findings get logged even when deliberately left unfixed** — distinguishing "found and fixed," "found and deferred on purpose," and "not yet checked" rather than letting things quietly disappear from the record.
5. **Server restart hygiene matters.** Clear shell env overrides, restart via `cd server && node index.js` only, confirm `JWT_SECRET loaded: true` in the startup log, before trusting any verification run.
6. **DB row-level privacy checks, not just code review**, for anything touching `event_log` — `DATA_PRIVACY.md`'s rule that `event_log.metadata` must never contain `client_name` or `phone` was checked against actual table contents multiple times, not assumed from the schema alone.
7. **Verification/test artifacts (stray bookings, probe event_log rows) need explicit cleanup**, not left in the DB after a verification pass.

---

## Suggested next steps (in rough priority order)

1. Record the 2-minute demo (app is ready locally with Postgres)
2. Push final code to GitHub if not already done
3. Confirm deploy env vars on Vercel + Render + Postgres host per `DEPLOYMENT.md`
4. (Later) Address #036 if IST date-edge correctness becomes user-visible
