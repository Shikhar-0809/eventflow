# DEPLOYMENT.md — EventFlow

## Why this file exists

`ARCHITECTURE.md` and `PROMPTS.md` both reference this file as the source of truth for getting EventFlow off localhost and onto a real, persistent, HTTPS-served deployment. This is that file. Like `SECURITY.md`, treat it as load-bearing — if a step here is skipped or improvised around, the most likely failure mode is silent data loss (an ephemeral filesystem wiping the database) or a broken session (cookie flags misconfigured for the live domain), not a loud error.

This file assumes Prompt 15 in `PROMPTS.md` (the Postgres migration) has been run, or is about to be. **Do not deploy on SQLite.** See the next section for why.

---

## Why SQLite can't be the production database

`ARCHITECTURE.md` already states this, repeated here because it's the reason this entire file exists: Render, Railway, and Vercel's free/standard compute tiers use **ephemeral filesystems**. Anything written to local disk — including a SQLite `.db` file — can be silently wiped on every redeploy, every restart, every scale event, or every time the platform recycles the container for maintenance. There is no warning before this happens. The app keeps running; the data is just gone.

For a POC this is the single most common way "it worked yesterday" turns into "all the merchant's bookings disappeared overnight." It is not a hypothetical edge case — it is the default, expected behavior of these platforms' free tiers.

**The fix:** a managed Postgres database (Neon or Supabase, both have a genuinely free tier with persistent storage) that lives outside the application container entirely. The app talks to it over a connection string, the same way it would talk to any external service. Restarting or redeploying the app has zero effect on the data, because the data was never on the app's own disk.

---

## Target architecture

| Layer | Platform | Why |
|---|---|---|
| Frontend (React/Vite static build) | **Vercel** | Free tier, automatic HTTPS, trivial GitHub-integration deploys, purpose-built for static/SPA frontends |
| Backend (Express API) | **Render** | Free tier supports a long-running Node process (Vercel's serverless model doesn't fit an Express app with persistent middleware/sessions as cleanly), automatic HTTPS, easy env var management |
| Database | **Neon** (or Supabase as an alternative) | Free tier Postgres with persistent storage, works fine for single-merchant POC scale, simple connection string setup |

This matches what `ARCHITECTURE.md`'s tech stack table and `ROADMAP.md`'s v1 scope both already specify — this file is the "how," not a new decision.

---

## Pre-deployment checklist

Do not proceed past this section until every item is true:

- [ ] Prompt 15 (Postgres migration) is complete — `server/db/database.js` connects via `pg`, every query uses `$1, $2` placeholders instead of `?`, `seed.js`'s `NODE_ENV === 'production'` guard is intact and tested
- [ ] `SECURITY.md`'s full pre-deploy security audit checklist has been run and is clean (this should already be true from Prompt 12, but re-run it specifically against Postgres-backed code, since query syntax changed)
- [ ] A **separate** `JWT_SECRET`, `MERCHANT_PASSWORD_HASH`, and `ADMIN_ACCESS_KEY` have been generated for production — **never reuse the local dev values.** Generate fresh ones using the exact commands in `SECURITY.md`'s "Generating secrets" section.
- [ ] You have a real, memorable production password chosen for the merchant — generate its hash locally (never paste the plaintext into any chat tool, commit, or file, per `SECURITY.md` and `DATA_PRIVACY.md`)
- [ ] `.gitignore` confirmed covering `.env` in both `client/` and `server/`, and `git log -p -- '**/.env'` returns nothing (per the pre-push check already done in this build)

---

## Step 1 — Provision Postgres (Neon)

1. Go to [neon.tech](https://neon.tech), sign up, create a new project (e.g. `eventflow-prod`)
2. Once created, Neon gives you a connection string in the form:
   ```
   postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
   ```
3. Copy this — it becomes `DATABASE_URL` in the backend's production environment (Step 3)
4. Neon's free tier includes a built-in dev/prod branching feature — optionally create a second branch (e.g. `dev`) if you want a separate Postgres instance for local development that mirrors prod schema without touching real data. Not required, but recommended once past single-developer POC stage.
5. Run the schema against this database once, before the app's first production boot:
   ```bash
   psql "postgresql://<connection-string>" -f server/db/schema.sql
   ```
   (Requires the `psql` CLI locally, or use Neon's web-based SQL editor and paste `schema.sql`'s contents directly.)

---

## Step 2 — Deploy the backend (Render)

1. Push the latest code to GitHub if not already done (it should be, per the earlier push in this build)
2. Go to [render.com](https://render.com), sign up, **New > Web Service**, connect your GitHub repo
3. Configuration:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Free
4. Add environment variables in Render's dashboard (Settings → Environment) — **never commit these, set them only in Render's UI**:
   ```
   NODE_ENV=production
   PORT=3001
   DATABASE_URL=<the Neon connection string from Step 1>
   JWT_SECRET=<freshly generated production value>
   MERCHANT_PASSWORD_HASH=<freshly generated production bcrypt hash>
   ADMIN_ACCESS_KEY=<freshly generated production value>
   CORS_ORIGIN=<your Vercel frontend URL — set this in Step 3, then come back and update this>
   SESSION_COOKIE_NAME=eventflow_session
   ```
5. Deploy. Render will build and start the service, and assign a URL like `https://eventflow-api.onrender.com`
6. Confirm it's alive: `https://eventflow-api.onrender.com/api/health` should return `{"status":"ok"}`

**Known Render free-tier gotcha:** free-tier services spin down after a period of inactivity and take 30-60 seconds to "wake up" on the next request. For a demo recording, hit the health endpoint a minute or two before you start recording so the service is already warm — a cold-start delay during a live demo looks like the app is broken.

---

## Step 3 — Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com), sign up, **New Project**, import the same GitHub repo
2. Configuration:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite (should auto-detect)
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default for Vite)
3. Environment variable for production builds (also in `client/.env.production` in the repo — no Vercel dashboard override needed unless you want to set it explicitly):
   ```
   VITE_API_URL=/api
   ```
   Must stay a **relative** path, not the full `onrender.com` URL. `client/vercel.json` rewrites `/api/*` to the Render backend so all browser requests are same-origin on the Vercel domain — see `SECURITY.md`'s Session cookie configuration section for why this matters (mobile ITP / cross-site cookie blocking).
4. Deploy. Vercel assigns a URL like `https://eventflow.vercel.app`
5. **Go back to Render** and update `CORS_ORIGIN` to this exact Vercel URL (Step 2's config had a placeholder for this). Redeploy the backend so the new CORS origin takes effect.

---

## Step 4 — Verify the live deployment

Run through `SECURITY.md`'s "Pre-deploy additions" checklist and `TESTING.md`'s "Pre-deploy test pass" in full, against the **live URLs**, not localhost:

- [ ] Cookie `secure` flag works — log in on the live URL, refresh, confirm the session persists (this is the #1 thing that silently breaks between dev and prod, per `SECURITY.md`'s repeated warning about the `secure: NODE_ENV === 'production'` cookie flag)
- [ ] HTTPS active on both URLs, no browser security warnings, padlock shows a valid cert
- [ ] A logged-out session genuinely cannot reach `/api/bookings`, `/api/analytics/summary`, or `/api/usage/admin` on the live backend URL
- [ ] Create a real booking on the live URL, confirm it persists after manually triggering a Render redeploy (this is the actual proof that the SQLite→Postgres migration solved the problem this file exists to solve)
- [ ] Confirm `/api/usage/admin` still requires both `requireAuth` and the `x-admin-key` header on the live URL — test with curl, not the browser, since it's intentionally not reachable from the frontend
- [ ] Test the full demo flow (login → calendar → new booking with conflict detection → WhatsApp link → analytics → my activity) end-to-end on the deployed URLs, on both a desktop browser and an actual mobile phone browser, per `TESTING.md`

---

## Production data hygiene

- The production database should **never** be seeded with `seed.js`'s demo data — confirm `NODE_ENV=production` is genuinely set in Render's environment (not just locally), since that's the only thing preventing demo bookings from appearing in front of a real merchant
- Once the merchant starts entering real client data, follow `DATA_PRIVACY.md` in full — this is no longer a POC sandbox at that point
- Rotate `JWT_SECRET`, `MERCHANT_PASSWORD_HASH`, and `ADMIN_ACCESS_KEY` to values that have never been used in any dev/local context, if they haven't already been generated fresh per the pre-deployment checklist

---

## Rollback / troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login works locally but fails on the live URL ("works once, then logs out immediately") | Cookie `secure` flag issue, or `CORS_ORIGIN` mismatch | Confirm `NODE_ENV=production` is actually set on Render; confirm `CORS_ORIGIN` exactly matches the Vercel URL (no trailing slash mismatch) |
| Bookings disappear after a Render redeploy | Still running on SQLite, not Postgres | Re-confirm Prompt 15 migration is actually deployed — check Render's logs for `better-sqlite3` references; confirm `DATABASE_URL` is set |
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
| `PROMPTS.md` | Prompt 15 (Postgres migration) is the code-level prerequisite this file assumes is done |
