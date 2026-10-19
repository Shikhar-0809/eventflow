# EventFlow — instructions for Claude Code

EventFlow is a deployed booking + inventory web app for small tent/catering businesses in India. Stack: React 18 + Vite + Tailwind + Zustand (client/), Node + Express + Postgres via `pg` on Neon (server/), emailed codes through Brevo. Frontend on Vercel (eventflow-brown.vercel.app, `/api` proxied to Render), backend on Render free tier.

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
- Every route has `requireAuth` except `GET /api/health`, `POST /api/auth/login` and the public sign-up / password-reset routes (`POST /api/auth/signup`, `/signup/send-otp`, `/signup/resend-otp`, `/signup/verify-otp`, `/forgot/send-otp`, `/forgot/resend-otp`, `/forgot/verify-otp`, `/forgot/reset`). Those are public, rate limited and validated, and never reveal whether an email has an account (sign-up's 409 is the one accepted exception, BUGS #073). Validation (zod) runs server-side before any DB call.
- `bumpTokenVersion(client, merchantId)` (`server/services/session.js`) is the only way a logged-in route bumps `merchants.token_version`: bump inside the transaction, issue the cookie (`issueSession`, same flags as login) only after COMMIT; never touch `res` inside a transaction. The one exception is `POST /api/auth/forgot/reset`, which has no session to keep.
- `sign_in_log` holds a coarse device label ("Chrome on Android") and a timestamp, newest 10 per merchant. It never holds an IP address or the full user agent, and no log line may either.
- The delete-account table list in `server/routes/profile.js` (`DELETE /api/profile`) is written out by hand, children before parents. Whenever a table with a `merchant_id` column is added, add it there in FK-safe order in the same commit (`scripts/verify-profile-api.mjs` fails if one is missing).
- The merchant's own WhatsApp number comes from `merchants.whatsapp_phone` (the profile, via `profileStore`), never an env var. `VITE_MERCHANT_PHONE` no longer exists.
- Product rule: conflicts and shortfalls alert, they don't block. Date conflicts never disable submit; inventory shortfalls require an explicit confirm-anyway step.

## Workflow

- One logical change per commit. Messages: `feat:` / `fix:` / `security:` / `docs:` / `chore:`.
- Log every bug found or fixed in `BUGS.md`; security bugs tagged `[SECURITY]`, High by default.
- Verify changes by actually running them (dev server, verify scripts, browser checks) — not just by reading the code. Report what you verified and how.
- Keep `ARCHITECTURE.md` and `SECURITY.md`'s route matrix updated when routes, tables or env vars change.
- Ask before any decision that's hard to undo (schema changes on existing data, deleting files I didn't ask about, new dependencies).
- Schema changes only as a new numbered file in `server/db/migrations/` (never edit an applied one). Rules: `CODING_STANDARDS.md`.

## Current status (update as work progresses)

- Done: docs refresh (Prompt 22), security quick fixes (Prompt 23), enforced CSP, helmet, trust proxy = 4, Vercel-only origin lock, production-database guard. `ARCHITECTURE.md`, `SECURITY.md`, `CODING_STANDARDS.md` and the other docs were brought in line with the code on 2026-10-19; `PROMPTS.md` is a historical build log only.
- **Shipped to production 2026-10-15 (Prompts 24 + 25, multi-merchant scoping):** migration runner, migrations `001`-`004`, merchant-scoped seeds, and every API route scoped to `req.merchantId` (JWT carries `merchant_id`; foreign ids return the same 404 as missing ones; responses never include `merchant_id`). Released in two pushes: (a) `56d3907eadb2b9aff27501810aeb9bef9fd19bbc` (everything except 004), then (b) `1fed0066fbf427866a351a56a41606b42ebb48ce` (`004_drop_merchant_defaults`). Both verified live. Production `ADMIN_ACCESS_KEY` was rotated during the release; the leaked verify-script strings (BUGS #067) did not match the production merchant password. Proof on dev: `npm run verify:isolation -- --confirm-host=<dev host>`. The old rollback target `126f0a1` is **unsafe today** (login moved to per-merchant accounts); for a rollback follow RUNBOOK.md, "Rolling back a release" (revert a specific commit, never go back past `41b6c98`). The Neon restore-point branch from the release is kept for a few days; the local branch `backup-pre-reorder` can be deleted once nobody needs it.
- Future releases that ship a migration still go in two pushes where code and schema depend on each other (see DEPLOYMENT.md).
- **Shipped to production 2026-10-15 (self-service signup, commits `41b6c98` through `cfbd012`):** migration `005_merchant_accounts` (nullable `email` + `password_hash` on `merchants`, unique on `lower(email)`), `POST /api/auth/signup` (own `signupRateLimiter`), email + password login through the `merchants` table, `MERCHANT_PASSWORD_HASH` removed entirely (the env var is no longer read), `SignupScreen`, and the merchant's `business_name` in the Sidebar, tab title, calendar greeting, WhatsApp sign-offs, Excel export and printed report. Production merchant 1 (Bala Ji Tent House) was given an email and password hash by the owner and logs in with its existing data (BUGS #068). **That email is a placeholder, not Bharat's real address:** set it up properly if and when he resumes using the app (BUGS #074). Verified live: merchant 1 sees its own data, a fresh signup lands in an empty dashboard, no cross-merchant leak, per-merchant naming confirmed (BUGS #071). Dev seeds (never run in production) give two demo merchants, Bala Ji Tent House and Shree Ganesh Caterers, with populated dashboards (`db/seedMerchants.js`). The session cookie flags are unchanged; the JWT payload later gained a token-version claim (`tv`, migration 006), so it is now `{ merchant_id, tv }`.
- **Shipped to production 2026-10-15/16 (email codes and profile):** `a1a0103` (2026-10-15, migration `006_email_otps`): sign-up now needs an emailed 6-digit code, and there is self-service password reset (`/api/auth/forgot/*`); a reset ends every session through `merchants.token_version`. `0b5db27` and `6a8c2e6` (2026-10-16, migration `007_merchant_profile`): the Profile screen and `/api/profile` (business name and the merchant's own WhatsApp number, change password / email, log out other devices, recent sign-ins, in-app account deletion, security notice emails). So **email verification and password reset are done**; what is not built is Firebase / phone / Google login.
- **Fixed and pushed 2026-10-19:** booking prices and totals are computed server-side (BUGS #062); the report PDF is compressed (#091) and no longer splits a booking card across pages (#095); cancelled bookings are excluded from analytics through the shared rule in `server/services/bookingStatus.js` (#096); the Sidebar and Analytics numbers refresh after booking changes (#097, #098).
- **2026-10-19 follow-ups:** BUGS #099 (stale README / checklists, fixed) and #103 (production-host guard on every database-touching script, fixed: only `migrate.mjs` and `wipe-for-handoff.mjs` can run against production, enforced by `verify-confirm-host-guard.mjs`). **#104 (live outage, fixed in code):** the live API was hibernated and Render's edge answered every request, even `/api/health`, with a text/plain 429 (`x-render-routing: hibernate-rate-limited`) that the client mislabelled "Too many attempts"; our rate limiters were verified correct (`npm run verify:ratelimit`). The client now shows "The server is waking up. Please try again in a minute." and retries once after 3 s, only for reads and login / forgot-password code requests (never for writes); a keep-alive pinger on `GET /api/health` was set up by the owner. #100 and #101 stay open.
- Next: `PROMPTS_22-26.md` Prompt 26, now meaning Firebase / phone / Google sign-in and guided onboarding (email + password with emailed codes already exists). Open BUGS (check `BUGS.md` for the live list): #063/#072 (obsolete dev-credential scripts), #064 (verify scripts stale, partly fixed), #065, #066, #073 (sign-up reveals registered emails, accepted), #074 (merchant 1's production email is a placeholder), #076, #094 (iOS PDF canvas size, mobile deferred), #100 (time zone: analytics, inventory and pending balances use server/DB time, not IST), #101 (boot warning omits `EMAIL_FROM_NAME`), #102 (privacy policy does not name the email provider).

## Compact instructions

When compacting, keep: the current prompt number, files changed, open BUGS.md items, and failing checks. Drop full file contents and command output.
