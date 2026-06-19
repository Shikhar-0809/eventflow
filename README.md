# EventFlow

Merchant-facing booking management dashboard for small tent and catering businesses.

## Local setup

```bash
npm install
```

Copy environment templates:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

Generate server secrets (one-time per environment). Full details in `SECURITY.md`.

**`JWT_SECRET`:**

```bash
openssl rand -base64 32
```

**`MERCHANT_PASSWORD_HASH`** — run from `/server` so `bcryptjs` resolves:

```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('your-chosen-password', 10))"
```

Copy the printed hash into `MERCHANT_PASSWORD_HASH` in `server/.env`. On PowerShell, wrap the hash in **single quotes** when setting the env var — `$` characters in bcrypt hashes are otherwise interpreted as variables (see `BUGS.md` #002).

## Run

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Documentation

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Tech stack, routes, data model |
| `CODING_STANDARDS.md` | Code conventions |
| `SECURITY.md` | Auth model, secrets, rate limits |
| `PROMPTS.md` | Sequenced build prompts |
| `TESTING.md` | Manual test checklists |
