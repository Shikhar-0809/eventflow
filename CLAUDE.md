# EventFlow — instructions for Claude Code

EventFlow is a deployed booking + inventory web app for small tent/catering businesses in India. Stack: React 18 + Vite + Tailwind + Zustand (client/), Node + Express + Postgres via `pg` on Neon (server/). Frontend on Vercel (eventflow-brown.vercel.app, `/api` proxied to Render), backend on Render free tier.

**Real merchant data is in production.** Treat every change as shipping to a real business.

## Read before making changes

These files define the shape, quality and safety bar. Read the relevant ones before any task, and follow them over your own defaults:

- `ARCHITECTURE.md` — stack, folder structure, data model, routes, env var names
- `CODING_STANDARDS.md` — conventions, palette, validation and SQL patterns
- `SECURITY.md` — auth model, route auth matrix, audit checklist
- `DATA_PRIVACY.md` — how client data is handled (DPDP Act context)
- `BUGS.md` — known gotchas and the bug tracker; check gotchas before debugging
- `ROADMAP.md` — scope; don't build deferred features unless the task says so

If code and these docs disagree, say so — don't silently pick one.

## Hard rules

- Never read, print, or echo `.env` files, secrets, connection strings, password hashes, or keys. Env var NAMES only. `.env.example` is fine to read and edit (placeholders only).
- Never run anything that writes to a `.env` file: no editing it, and no scripts that rewrite it (e.g. `server/scripts/set-dev-merchant-hash.mjs`), even if I asked for the outcome or the result would be harmless. If a command that touches `.env` fails, tell me the corrected command so I can run it myself with `!`; don't run it yourself.
- Never run anything against the production database. Never print real client names or phone numbers. Use the seeded fictional data for all debugging.
- Every destructive script needs `--confirm-host=<host>` (see `server/scripts/lib/`). Don't bypass it.
- The production database host lives only in `server/config/productionHosts.js`. `db/database.js` refuses it when `NODE_ENV !== 'production'`; verify and seed scripts import `scripts/lib/refuseProductionDatabase.mjs`; destructive scripts also need `--i-really-mean-production` for it. Never pass that flag, set `NODE_ENV=production` for a script, or edit the host list without asking me. Details in `SECURITY.md`.
- Never `git push` without asking me first. Never rewrite git history.
- Every SQL query uses `$1`-style parameters. Multi-table writes run in a transaction (BEGIN/COMMIT/ROLLBACK, `client.release()` in `finally`).
- Every route except `GET /api/health` and `POST /api/auth/login` has `requireAuth`. Validation (zod) runs server-side before any DB call.
- Product rule: conflicts and shortfalls alert, they don't block. Date conflicts never disable submit; inventory shortfalls require an explicit confirm-anyway step.

## Workflow

- One logical change per commit. Messages: `feat:` / `fix:` / `security:` / `docs:` / `chore:`.
- Log every bug found or fixed in `BUGS.md`; security bugs tagged `[SECURITY]`, High by default.
- Verify changes by actually running them (dev server, verify scripts, browser checks) — not just by reading the code. Report what you verified and how.
- Keep `ARCHITECTURE.md` and `SECURITY.md`'s route matrix updated when routes, tables or env vars change.
- Ask before any decision that's hard to undo (schema changes on existing data, deleting files I didn't ask about, new dependencies).
- Schema changes only as a new numbered file in `server/db/migrations/` (never edit an applied one). Rules: `CODING_STANDARDS.md`.

## Current status (update as work progresses)

- Done: docs refresh (Prompt 22), security quick fixes (Prompt 23), enforced CSP, helmet, trust proxy = 4, Vercel-only origin lock, production-database guard.
- Done locally, NOT pushed (Prompt 24): migration runner, migrations `001_baseline` / `002_multi_merchant` / `003_bookings_status_check`, merchant-scoped dev seeds. Verified on the dev branch and a scratch Neon database (fresh path, adoption with data, concurrency, failure paths). Do not deploy it alone: deploy with Prompt 25, after a fresh production restore-point branch, and confirm production has the CHECKs listed in BUGS #061 first.
- Next: `PROMPTS_22-26.md` Prompt 25 (merchant-scoped API, remove the `DEFAULT 1`s, isolation test), 26 (Firebase auth + onboarding).

## Compact instructions

When compacting, keep: the current prompt number, files changed, open BUGS.md items, and failing checks. Drop full file contents and command output.
