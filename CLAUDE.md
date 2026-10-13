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
- Never run anything against the production database. Never print real client names or phone numbers. Use the seeded fictional data for all debugging.
- Every destructive script needs `--confirm-host=<host>` (see `server/scripts/lib/`). Don't bypass it.
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

## Current status (update as work progresses)

- Done: docs refresh (Prompt 22), security quick fixes (Prompt 23), enforced CSP, helmet, db.prepare shim removed.
- In progress: trust proxy = 4 (BUGS #040), then Vercel-only origin lock with `PROXY_SHARED_SECRET`.
- Next: `PROMPTS_22-26.md` Prompt 24 (multi-merchant schema), 25 (merchant-scoped API + isolation test), 26 (Firebase auth + onboarding).
