# EventFlow

EventFlow is a booking and inventory dashboard for small tent and catering businesses in India. A business owner gets one place to manage bookings, catch date conflicts, track advances and stock, send WhatsApp messages to clients, review business analytics, and see recent activity — without pen and paper or scattered spreadsheets.

It is a **multi-merchant product, deployed with real merchant data**. Any business can sign up (email + password, with an emailed 6-digit code) and gets its own isolated data; every API route is scoped to the logged-in merchant. See [SECURITY.md](SECURITY.md) for the auth model, tenant isolation and what the threat model covers, and [CLAUDE.md](CLAUDE.md) for the working rules (read it before changing anything: production holds real client data).

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS v3, Zustand, FullCalendar, Recharts, SheetJS, jsPDF + html2canvas (PDF reports) |
| Backend | Node.js 22, Express, Postgres via `pg` (Neon) |
| Auth & validation | JWT session cookie, bcrypt, emailed codes (Brevo), Zod |
| Hosting | Vercel (frontend, `/api` proxied), Render (API), Neon (database) |

Full stack rationale, routes, data model and folder layout: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Local setup

### 1. Clone and install

`client/` is an npm workspace of the repo root; `server/` is a standalone npm project with its own lockfile (Render builds it on its own, BUGS #092). Local setup is two installs:

```bash
git clone <repository-url>
cd eventflow
npm ci            # root: client + concurrently
cd server
npm ci            # server (includes Playwright for the verify scripts)
cd ..
```

### 2. Environment files

Copy the example env files and fill in placeholders (never commit real `.env` files):

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

**Client** (`client/.env`): `VITE_API_URL` (already `http://localhost:3001/api` in the example).

**Server** (`server/.env`), names only; the full list with notes is in [ARCHITECTURE.md](ARCHITECTURE.md#environment-variables):

- `NODE_ENV=development`, `PORT=3001`, `CORS_ORIGIN=http://localhost:5173`, `SESSION_COOKIE_NAME=eventflow_session`
- `DATABASE_URL` — Postgres connection string. **Point it at a Neon dev branch, never the production database**: the server and every script refuse the production host when `NODE_ENV` is not `production` (`server/config/productionHosts.js`).
- `JWT_SECRET`, `OTP_HMAC_SECRET`, `ADMIN_ACCESS_KEY` — generated below
- `EMAIL_DEV_LOG=true` — prints sign-up and reset codes in the server console instead of sending email, so you do not need Brevo locally
- Production only: `PROXY_SHARED_SECRET`, `PROXY_LOCK_MODE`, `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `APP_URL` (see [DEPLOYMENT.md](DEPLOYMENT.md))

There is no shared merchant password and no `MERCHANT_PASSWORD_HASH`: each merchant sets their own password at sign-up and only the bcrypt hash is stored in the database.

### 3. Generate server secrets (one-time per environment)

Run these locally. Use **placeholders** in docs and chat; only put generated values in your local `server/.env`.

```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 32   # OTP_HMAC_SECRET (a different value)
openssl rand -base64 24   # ADMIN_ACCESS_KEY, for the internal /api/usage/admin route
```

More detail on auth, cookies, rate limits and the proxy lock: **[SECURITY.md](SECURITY.md)**.

---

## Run locally

From the repo root:

```bash
npm run dev
```

This uses `concurrently` to start both apps:

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001 (`GET /api/health` → `{ "status": "ok" }`)

On startup the server applies any pending database migrations (`server/db/migrations/`). On a dev database it then seeds fictional demo data (two demo merchants with populated dashboards; see `server/db/seedMerchants.js` for their demo logins, which exist on dev databases only). Production skips all seeding. To try the sign-up flow locally, use `EMAIL_DEV_LOG=true` and read the code from the server console.

Verify scripts (`server/scripts/verify-*.mjs`, `npm run verify:isolation`, `verify:pricing`, `verify:analytics`) are for dev databases only and need `--confirm-host=<dev host>`; see [TESTING.md](TESTING.md).

---

## Project docs

| Document | What's in it |
|----------|----------------|
| [CLAUDE.md](CLAUDE.md) | Working rules and current status (read first) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System overview, tech stack, folder structure, API routes, data model, env var names |
| [SECURITY.md](SECURITY.md) | Threat model, auth model, tenant isolation, secrets setup, rate limits, session cookie rules |
| [DATA_PRIVACY.md](DATA_PRIVACY.md) | How client PII is handled, merchant transparency, DPDP-oriented guidance |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Component conventions, validation rules, SQL and store patterns, Tailwind palette |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Vercel + Render + Neon setup, env vars, release process |
| [RUNBOOK.md](RUNBOOK.md) | What to do when something breaks (rollback, restore) |
| [BUGS.md](BUGS.md) | Known issues tracker with severity and fix notes |
| [TESTING.md](TESTING.md) | Manual test checklists and verification scripts |
| [ROADMAP.md](ROADMAP.md) | Scope decisions log and deferred features (what not to build yet) |
| [PROMPTS.md](PROMPTS.md) | Historical build log of the original Cursor prompts (not the current architecture) |

---

## License

Private / POC — see repository owner for usage terms.
