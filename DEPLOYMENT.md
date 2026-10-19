# DEPLOYMENT.md — EventFlow

## Why this file exists

`ARCHITECTURE.md` and `PROMPTS.md` both reference this file as the source of truth for getting EventFlow off localhost and onto a real, persistent, HTTPS-served deployment. This is that file. Like `SECURITY.md`, treat it as load-bearing — if a step here is skipped or improvised around, the most likely failure mode is silent data loss (an ephemeral filesystem wiping the database) or a broken session (cookie flags misconfigured for the live domain), not a loud error.

Production runs on Postgres (Neon): the Postgres migration (git commit `5ed072b`, 2026-06-24) and the first Vercel + Render deploys are done, and the app is live with real merchant data. **Never deploy on SQLite** (it is no longer supported by the code at all). The sections below are both the record of how it was set up and the procedure for rebuilding or changing it.

---

## Why SQLite can't be the production database (historical rationale; the app now uses Postgres only)

`ARCHITECTURE.md` already states this, repeated here because it's the reason this entire file exists: Render, Railway, and Vercel's free/standard compute tiers use **ephemeral filesystems**. Anything written to local disk — including a SQLite `.db` file — can be silently wiped on every redeploy, every restart, every scale event, or every time the platform recycles the container for maintenance. There is no warning before this happens. The app keeps running; the data is just gone.

For a POC this is the single most common way "it worked yesterday" turns into "all the merchant's bookings disappeared overnight." It is not a hypothetical edge case — it is the default, expected behavior of these platforms' free tiers.

**The fix:** a managed Postgres database (Neon or Supabase, both have a genuinely free tier with persistent storage) that lives outside the application container entirely. The app talks to it over a connection string, the same way it would talk to any external service. Restarting or redeploying the app has zero effect on the data, because the data was never on the app's own disk.

---

## Target architecture

| Layer | Platform | Why |
|---|---|---|
| Frontend (React/Vite static build) | **Vercel** | Free tier, automatic HTTPS, trivial GitHub-integration deploys, purpose-built for static/SPA frontends |
| Backend (Express API) | **Render** | Free tier supports a long-running Node process (Vercel's serverless model doesn't fit an Express app with persistent middleware/sessions as cleanly), automatic HTTPS, easy env var management |
| Database | **Neon** (or Supabase as an alternative) | Free tier Postgres with persistent storage, fine at this scale (a handful of small merchants), simple connection string setup |

This matches what `ARCHITECTURE.md`'s tech stack table and `ROADMAP.md`'s v1 scope both already specify — this file is the "how," not a new decision.

---

## Pre-deployment checklist

Do not proceed past this section until every item is true:

- [ ] `server/db/database.js` connects via `pg`, every query uses `$1, $2` placeholders, and `seed.js`'s `NODE_ENV === 'production'` guard is intact (the Postgres migration, Prompt 15, is done)
- [ ] `SECURITY.md`'s full pre-deploy security audit checklist has been run and is clean (this should already be true from Prompt 12, but re-run it specifically against Postgres-backed code, since query syntax changed)
- [ ] A **separate** `JWT_SECRET`, `OTP_HMAC_SECRET`, `ADMIN_ACCESS_KEY` and `PROXY_SHARED_SECRET` have been generated for production — **never reuse the local dev values.** Generate fresh ones using the exact commands in `SECURITY.md`'s "Generating secrets" section. `BREVO_API_KEY` and a verified `EMAIL_FROM` sender come from the Brevo dashboard.
- [ ] Merchants choose their own passwords at sign-up (only the bcrypt hash is stored in `merchants.password_hash`); there is no shared merchant password and `MERCHANT_PASSWORD_HASH` no longer exists. Never paste a real password into any chat tool, commit, or file, per `SECURITY.md` and `DATA_PRIVACY.md`
- [ ] `.gitignore` confirmed covering `.env` in both `client/` and `server/`, and `git log -p -- '**/.env'` returns nothing (per the pre-push check already done in this build)

---

## Step 1 — Provision Postgres (Neon)

1. Go to [neon.tech](https://neon.tech), sign up, create a new project (e.g. `eventflow-prod`)
2. Once created, Neon gives you a connection string in the form:
   ```
   postgresql://<user>:<password>@<host>/<dbname>?sslmode=verify-full
   ```
3. Copy this — it becomes `DATABASE_URL` in the backend's production environment (Step 3)
4. Neon's free tier includes a built-in dev/prod branching feature — optionally create a second branch (e.g. `dev`) if you want a separate Postgres instance for local development that mirrors prod schema without touching real data. Not required, but recommended once past single-developer POC stage.
5. Nothing to run by hand: the backend applies the schema itself on boot from `server/db/migrations/` (numbered SQL files, recorded in `schema_migrations`). A new database gets `001_baseline` and everything after it; the existing production database adopts `001_baseline` without re-running it. To apply or check migrations manually from `server/`: `npm run migrate -- --confirm-host=<host>` (production additionally needs `NODE_ENV=production` and `--i-really-mean-production`).
   **Before deploying a release that contains a migration, create a fresh restore-point branch of the production database in Neon** (migrations have no down step; a failed one rolls back, a successful one does not).

---

## Step 2 — Deploy the backend (Render)

1. Push the latest code to GitHub if not already done (it should be, per the earlier push in this build)
2. Go to [render.com](https://render.com), sign up, **New > Web Service**, connect your GitHub repo
3. Configuration:
   - **Root Directory:** `server`
   - **Build Command:** `npm ci --omit=dev` (changed from `npm install`). It installs exactly what `server/package-lock.json` pins and fails if that file is out of sync with `server/package.json`, so regenerate the lockfile whenever `server/package.json` changes, and keep devDependencies (Playwright) out of the deploy. `server/` is not an npm workspace (BUGS #092): local setup is `npm ci` at the repo root, then `npm ci` in `server/`; the root lockfile only feeds Vercel (client + concurrently).
   - **Start Command:** `node index.js`
   - **Instance Type:** Free
4. Add environment variables in Render's dashboard (Settings → Environment) — **never commit these, set them only in Render's UI**:
   ```
   NODE_ENV=production
   PORT=3001
   DATABASE_URL=<the Neon connection string from Step 1, with sslmode=verify-full (not require)>
   JWT_SECRET=<freshly generated production value>
   OTP_HMAC_SECRET=<freshly generated production value>
   ADMIN_ACCESS_KEY=<freshly generated production value>
   PROXY_SHARED_SECRET=<generated; the same value is set in Vercel, Step 3>
   PROXY_LOCK_MODE=enforce
   BREVO_API_KEY=<from Brevo>
   EMAIL_FROM=<verified sender address>
   EMAIL_FROM_NAME=EventFlow
   APP_URL=<optional, shown in emails>
   CORS_ORIGIN=<your Vercel frontend URL — set this in Step 3, then come back and update this>
   SESSION_COOKIE_NAME=eventflow_session
   ```
   The server refuses to start without `JWT_SECRET`, `SESSION_COOKIE_NAME` and (in production) `PROXY_SHARED_SECRET`; a missing `BREVO_API_KEY`, `EMAIL_FROM` or `OTP_HMAC_SECRET` only logs a warning at boot, but sign-up and password-reset codes then fail (`EMAIL_FROM_NAME` is also needed and is not in that warning). The server applies pending migrations on boot.
5. Deploy. Render will build and start the service, and assign a URL like `https://eventflow-api.onrender.com`
6. Confirm it's alive: `https://eventflow-api.onrender.com/api/health` should return `{"status":"ok"}`

**Known Render free-tier gotcha:** free-tier services spin down after a period of inactivity and take 30-60 seconds to "wake up" on the next request. For a demo recording, hit the health endpoint a minute or two before you start recording so the service is already warm — a cold-start delay during a live demo looks like the app is broken.

---

## Step 3 — Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com), sign up, **New Project**, import the same GitHub repo
2. Configuration:
   - **Root Directory:** `./` (the repo root, not `client`)
   - The build, output and install commands and all routing and headers come from the **root `vercel.json`**, which is the only Vercel config. Vercel does not read a `vercel.json` inside `client/`.
3. Environment variables. `PROXY_SHARED_SECRET` (the same value as on Render) must be set in the Vercel project's settings as a server-side variable, **not** prefixed `VITE_`: the root `vercel.json` copies it into the `x-proxy-secret` header on every `/api` request, and in production Render rejects requests without it (SECURITY.md, "Proxy-only origin lock"). For production builds the API base is also in `client/.env.production` in the repo — no Vercel dashboard override needed unless you want to set it explicitly:
   ```
   VITE_API_URL=/api
   ```
   Must stay a **relative** path, not the full `onrender.com` URL. The root `vercel.json` rewrites `/api/*` to the Render backend so all browser requests are same-origin on the Vercel domain — see `SECURITY.md`'s Session cookie configuration section for why this matters (mobile ITP / cross-site cookie blocking).
4. Deploy. Vercel assigns a URL like `https://eventflow.vercel.app`
5. **Go back to Render** and update `CORS_ORIGIN` to this exact Vercel URL (Step 2's config had a placeholder for this). Redeploy the backend so the new CORS origin takes effect.

---

## Releasing the multi-merchant work (Prompts 24 + 25): two pushes (done 2026-10-15; kept as the pattern for any release where code and schema depend on each other)

Take a **fresh restore-point branch of the production database in Neon first** (migrations have no down step). Then ship in two pushes so no running instance ever relies on a `DEFAULT` that is already gone:

1. **Push (a): everything except `004`.** Push the commit just before `004_drop_merchant_defaults`:
   `git push origin <sha-of-the-docs-commit-before-004>:main`
   The new code never relies on `DEFAULT 1`; the old instance still can. Render applies migrations `001` (adopted), `002`, `003` at boot. Verify live: login works (everyone re-logs in once), then calendar, bookings, inventory, records, analytics and settings; in the Render logs `migrate:` shows `baseline adopted`, `known drift ... bookings_status_check`, `applied 002...`, `applied 003...`.
2. **Push (b): `004` alone**, once (a) is verified live: `git push origin main`. Afterwards create a booking to confirm writes still work.

**If something goes wrong:** RUNBOOK.md, "Rolling back a release" (revert a specific commit, redeploy on Render and Vercel, the env vars the current code needs, restore from the Neon restore-point branch). The old rollback SHA in the historical section there is unsafe.

## Step 4 — Verify the live deployment

Run through `SECURITY.md`'s "Pre-deploy additions" checklist and `TESTING.md`'s "Pre-deploy test pass" in full, against the **live URLs**, not localhost:

- [ ] Cookie `secure` flag works — log in on the live URL, refresh, confirm the session persists (this is the #1 thing that silently breaks between dev and prod, per `SECURITY.md`'s repeated warning about the `secure: NODE_ENV === 'production'` cookie flag)
- [ ] HTTPS active on both URLs, no browser security warnings, padlock shows a valid cert
- [ ] A logged-out session genuinely cannot reach `/api/bookings`, `/api/analytics/summary`, or `/api/usage/admin` on the live backend URL
- [ ] Create a real booking on the live URL, confirm it persists after manually triggering a Render redeploy (this is the actual proof that the SQLite→Postgres migration solved the problem this file exists to solve)
- [ ] Confirm `/api/usage/admin` still requires both `requireAuth` and the `x-admin-key` header on the live URL — test with curl, not the browser, since it's intentionally not reachable from the frontend
- [ ] A direct request to the Render URL (not through Vercel) returns 403 except `/api/health`, and `PROXY_LOCK_MODE` is `enforce`
- [ ] Sign up with a fresh email on the live URL: the emailed code arrives and the new merchant lands in an empty dashboard (proves the Brevo variables)
- [ ] Test the full demo flow (login → calendar → new booking with conflict detection → WhatsApp link → analytics → my activity) end-to-end on the deployed URLs, on both a desktop browser and an actual mobile phone browser, per `TESTING.md`

---

## Production data hygiene

- The production database should **never** be seeded with `seed.js`'s demo data — confirm `NODE_ENV=production` is genuinely set in Render's environment (not just locally), since that's the only thing preventing demo bookings from appearing in front of a real merchant
- Once the merchant starts entering real client data, follow `DATA_PRIVACY.md` in full — this is no longer a POC sandbox at that point
- Rotate `JWT_SECRET`, `OTP_HMAC_SECRET`, `ADMIN_ACCESS_KEY` and `PROXY_SHARED_SECRET` to values that have never been used in any dev/local context, if they haven't already been generated fresh per the pre-deployment checklist

---

## Rollback / troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login works locally but fails on the live URL ("works once, then logs out immediately") | Cookie `secure` flag issue, or `CORS_ORIGIN` mismatch | Confirm `NODE_ENV=production` is actually set on Render; confirm `CORS_ORIGIN` exactly matches the Vercel URL (no trailing slash mismatch) |
| Bookings disappear after a Render redeploy | `DATABASE_URL` points somewhere other than the Neon database (SQLite is no longer supported, so this cannot be a disk file) | Confirm `DATABASE_URL` on Render and look at the `Target database` lines in the logs; this symptom was the original SQLite-era failure |
| Every API call returns 403 on the live site | `PROXY_SHARED_SECRET` differs between Vercel and Render, or is missing on Vercel | Set the same value on both and redeploy both (SECURITY.md, "Rotating the secret") |
| Sign-up or reset code never arrives | Brevo variables missing or the sender is not verified | Check `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` and `OTP_HMAC_SECRET` on Render and the boot warning in the logs |
| First request after idle period is very slow | Render free-tier cold start | Expected behavior on free tier; not a bug. Hit `/api/health` to warm it up before a demo |
| CORS errors in browser console on the live frontend | `CORS_ORIGIN` on Render doesn't match the Vercel domain | Update and redeploy backend; remember Step 3's "go back and update" step |
| `/api/usage/admin` returns data without the admin key | `requireAdminKey` env var not set or not wired | This would be a serious regression — re-run `SECURITY.md`'s admin-key checks (Prompt 9's verification) against the live URL immediately |

---

## Related documents

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Tech stack and the original rationale for this deployment topology |
| `SECURITY.md` | Cookie config, CORS config, and the full pre-deploy audit checklist this file builds on |
| `DATA_PRIVACY.md` | What changes once real client data is in scope, post-deploy |
| `TESTING.md` | The pre-deploy test pass referenced in Step 4 |
| `PROMPTS.md` | Prompt 15 (Postgres migration) was the code-level prerequisite (done); PROMPTS.md is a historical build log |
