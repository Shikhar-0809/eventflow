# EventFlow

EventFlow is a merchant-facing booking management dashboard for small tent and catering businesses in India. It gives a business owner one place to manage bookings, catch date conflicts, track advances, send WhatsApp messages to clients, review business analytics, and see recent activity — without pen and paper or scattered spreadsheets.

This repo is a **single-merchant proof of concept**, not a multi-tenant SaaS product. Auth is deliberately simple: one password, one session, one business. See [SECURITY.md — Threat model for v1](SECURITY.md#threat-model-for-v1--be-explicit-about-what-this-defends-against) for what that model is meant to defend against (and what is explicitly out of scope).

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS v3, Zustand, FullCalendar, Recharts, SheetJS |
| Backend | Node.js, Express, Postgres via `pg` |
| Auth & validation | JWT session cookie, bcrypt, Zod |

Full stack rationale, routes, and folder layout: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Local setup

### 1. Clone and install

`client/` is an npm workspace of the repo root; `server/` is a standalone npm project with its own lockfile (Render builds it on its own). Local setup is two installs:

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

**Client** (`client/.env`):

- `VITE_API_URL` — already set to `http://localhost:3001/api` in `.env.example`

**Server** (`server/.env`):

- `NODE_ENV=development`
- `PORT=3001`
- `DATABASE_URL` — Postgres connection string (required)
- `CORS_ORIGIN=http://localhost:5173`
- `SESSION_COOKIE_NAME=eventflow_session`
- Generate the secrets below and paste into the matching keys

### 3. Generate server secrets (one-time per environment)

Run these locally. Use **placeholders** in docs and chat; only put generated values in your local `server/.env`.

**`JWT_SECRET`** — long random string:

```bash
openssl rand -base64 32
```

**`MERCHANT_PASSWORD_HASH`** — bcrypt hash of your chosen login password. Run from `server/` so `bcryptjs` resolves:

```bash
cd server
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('your-chosen-password', 10))"
```

Copy the printed hash into `MERCHANT_PASSWORD_HASH` in `server/.env`. Do **not** store the plaintext password in `.env`, git, or commit messages.

**PowerShell gotcha:** bcrypt hashes contain `$` characters. When setting `MERCHANT_PASSWORD_HASH` in PowerShell (inline env or file edits that go through shell expansion), wrap the value in **single quotes** — otherwise `$` is treated as a variable and the hash is corrupted. See [BUGS.md #002](BUGS.md) for details.

**`ADMIN_ACCESS_KEY`** — for the internal `/api/usage/admin` route (same random pattern as `JWT_SECRET`):

```bash
openssl rand -base64 24
```

More detail on auth, cookies, and rate limits: **[SECURITY.md](SECURITY.md)**.

---

## Run locally

From the repo root:

```bash
npm run dev
```

This uses `concurrently` to start both apps:

- **Frontend:** http://localhost:5173  
- **Backend:** http://localhost:3001 (`GET /api/health` → `{ "status": "ok" }`)

On first dev startup, the server seeds demo bookings when the database is empty (`NODE_ENV=development` only). Historical months are filled in for analytics demos; production skips all seeding.

---

## Project docs

| Document | What's in it |
|----------|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System overview, tech stack, folder structure, API routes, data model, env var names |
| [SECURITY.md](SECURITY.md) | Threat model, auth model, secrets setup, rate limits, session cookie rules |
| [DATA_PRIVACY.md](DATA_PRIVACY.md) | How client PII is handled, merchant transparency, DPDP-oriented guidance |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Component conventions, validation rules, Tailwind palette, product-quality bar |
| [BUGS.md](BUGS.md) | Known issues tracker with severity and fix notes |
| [TESTING.md](TESTING.md) | Manual test checklists and Playwright verification scripts |
| [ROADMAP.md](ROADMAP.md) | v1 scope lock and deferred features (what not to build yet) |
| [PROMPTS.md](PROMPTS.md) | Sequenced Cursor build prompts for reproducing the project milestone by milestone |

---

## License

Private / POC — see repository owner for usage terms.
