# EventFlow — Prompts 22–26 (docs refresh, security fixes, multi-merchant, new auth)

Append these to `PROMPTS.md`. Run in order. For every prompt, attach `@ARCHITECTURE.md @CODING_STANDARDS.md @SECURITY.md @DATA_PRIVACY.md @STATE_REPORT.md`. Browser-verify each one before committing, same as always.

**Before Prompt 24:** create a Neon branch of production (a copy-on-write snapshot) as a restore point and rehearsal target. Do not let Cursor run anything against that branch that prints rows — it contains real client data.

**Deploy rule:** Prompts 24 and 25 can be verified locally one at a time, but deploy them to production together, after the tenant-isolation script in Prompt 25 passes.

---

## Prompt 22 — Docs refresh (no code changes)
**Time: 30 min**

```
Update the project docs so they describe the code as it actually is today, using STATE_REPORT.md as the source of facts. Do NOT change any application code in this prompt.

Rules:
- Update DESCRIPTIVE content (stack, folder structure, data model, route tables, env var names, file names) to match the code.
- Do NOT weaken any RULE or requirement (auth on every route, parameterized SQL, no secrets in code, no PII in event_log, alert-don't-block, etc.). If code violates a rule, keep the rule and add the violation to BUGS.md instead.

Files:
1. ARCHITECTURE.md — Postgres via pg (not SQLite); remove the "Prompt 15 deferred" language; real folder structure (BookingPage.jsx, settingsStore.js, reportPrinter.js, excelExporter.js, the four extra route files, server/scripts/); full current schema from STATE_REPORT §3 (including billing columns, completed status, booking_expenses, merchant_settings); full route table from §4 (all 31 routes); env vars including ADMIN_ACCESS_KEY and VITE_MERCHANT_PHONE; the Vercel /api proxy; jsPDF/html2canvas via CDN; SheetJS export.
2. SECURITY.md — route auth matrix with all 31 routes (note GET /api/health is intentionally unauthenticated, returns no data); SQL section now describes pg $1 placeholders and pool.connect + BEGIN/COMMIT/ROLLBACK transactions instead of better-sqlite3.
3. CODING_STANDARDS.md — SQL/transaction examples rewritten for pg; index.css rule updated to "Tailwind directives + FullCalendar overrides + keyframes only"; add the colors actually in use (indigo for completed status, green-600 for WhatsApp CTA, emerald for profit/success, black/40 and black/50 overlays) to the palette table.
4. README.md / HANDOFF.md — remove better-sqlite3 and "Sharma Tent House" remnants.
5. BUGS.md — add a note on #020 that the SQLite revert is historical and current code is Postgres.
6. PROMPTS.md — mark Prompt 15 as completed (migration already in code).

Output a short list of every section you changed.
```

---

## Prompt 23 — Security quick fixes
**Time: 60–75 min**

```
Apply the following security fixes. Each one is a separate commit with a "security:" message and a BUGS.md entry tagged [SECURITY]. Follow SECURITY.md and CODING_STANDARDS.md.

1. trust proxy + rate limiting. Production traffic arrives browser → Vercel rewrite → Render → Express, so req.ip is probably a proxy address and every client shares one rate-limit bucket. 
   - Check server/index.js for app.set('trust proxy', ...). Report what it is now.
   - Add a TEMPORARY route GET /api/debug/ip behind requireAuth that returns { ip: req.ip, ips: req.ips, xff: req.headers['x-forwarded-for'] }. I will deploy it, call it from two different networks, and tell you the result. Then set app.set('trust proxy', <hop count>) to the exact number of proxies (never `true`, which lets clients spoof X-Forwarded-For), and DELETE the debug route in the same commit.
   - Move bookingCreateRateLimiter to run BEFORE validate(bookingSchema) on POST /api/bookings so invalid requests also count.

2. Database TLS verification. server/db/database.js uses ssl: { rejectUnauthorized: false } in production, which disables certificate checks. Change it to verify the certificate (ssl: true / rejectUnauthorized: true). Neon uses a publicly trusted certificate, so Node's default CA store is enough. Confirm the server still connects.

3. XSS in the report window. Read client/src/utils/reportPrinter.js fully. If it builds HTML with string templates / document.write / innerHTML containing booking data (client names, venues, notes, expense labels, event_type_custom), escape EVERY interpolated value with an escapeHtml() helper in utils/sanitize.js (& < > " ' → entities). Numbers formatted via formatCurrency are fine but escape them anyway for consistency. Test by creating a local booking with client name `<img src=x onerror=alert(1)>` and opening the report — no alert must fire.

4. Subresource Integrity for CDN scripts. jsPDF and html2canvas are loaded from a CDN in the report window. Pin exact versions in the URLs and add integrity="sha384-..." and crossorigin="anonymous" to each script tag. Compute the hashes from the exact files.

5. Excel formula injection. In client/src/utils/excelExporter.js, any string cell starting with =, +, -, @, tab or carriage return must be prefixed with a single quote so Excel treats it as text. Apply to every user-controlled text column (client name, venue, notes, event_type_custom, expense labels).

6. Replace the npm xlsx@0.18.5 package (no longer updated on npm, known advisories) with the current SheetJS release installed from cdn.sheetjs.com as their docs describe. Confirm export still works.

7. Security headers.
   - Server: add helmet() in server/index.js, before routes.
   - Frontend: in the Vercel config that actually serves the app, add headers for all routes: X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, X-Frame-Options DENY, Permissions-Policy (camera=(), microphone=(), geolocation=()), Strict-Transport-Security max-age=63072000; includeSubDomains.
   - Add a Content-Security-Policy as Content-Security-Policy-Report-Only FIRST: default-src 'self'; script-src 'self' plus the exact CDN host used for jsPDF/html2canvas; style-src 'self' 'unsafe-inline' (FullCalendar/recharts use inline styles); img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'. Note: a window opened from the app inherits this CSP, so the report window must keep working. List every CSP violation you see in the browser console while using every screen (calendar, booking, inventory, records export, analytics, report + PDF download). I will switch it to enforcing once it is clean.

8. Admin key: compare with crypto.timingSafeEqual (handle different lengths without throwing) instead of !==.

9. JWT: pass { algorithm: 'HS256' } to jwt.sign and { algorithms: ['HS256'] } to jwt.verify.

10. Logout: call res.clearCookie with the same httpOnly/secure/sameSite/path options used when setting the cookie.

11. Dead code / leftovers:
   - Remove better-sqlite3 from server/package.json.
   - Delete server/db/eventflow.db, eventflow.db-shm, eventflow.db-wal. Add *.db-shm and *.db-wal to .gitignore.
   - Run `git ls-files | grep -Ei "\.db|\.env"` and report EVERY tracked match (client/.env.production with only VITE_API_URL=/api is expected and fine). Do not print file contents.
   - Remove the legacy db.prepare() shim from database.js after confirming nothing imports it.
   - Delete the orphaned InventoryUnitPicker.jsx.

12. Destructive scripts guard. Every script in server/scripts/ that deletes or wipes data (wipe-for-handoff.mjs, clear-bookings.js, cleanup helpers) must print the target database HOST (never the full URL or password) and refuse to run unless passed --confirm-host=<that exact host>. Put this in one shared helper in server/scripts/lib/.

13. Stop demoSeed.js logDevBookings from printing client names — print ids, dates and counts only.

Do not change any business behavior. After all fixes, give me a summary formatted as BUGS.md rows.
```

---

## Prompt 24 — Migration runner + multi-merchant schema
**Time: 75–90 min**

```
EventFlow is becoming multi-merchant. This prompt changes ONLY the database schema and how it is applied. Route code is changed in Prompt 25. Read STATE_REPORT.md §3 and §6 first.

First, append to ROADMAP.md's Scope decisions log:
"[Pulled forward from v5+] Multi-merchant accounts — any tent/catering business can sign up and use EventFlow with fully isolated data. Pulled forward to make EventFlow a product rather than a single merchant's tool. Billing/subscriptions remain out of scope."

PART A — migration runner (replaces running schema.sql + ad-hoc ALTERs on every boot)
1. Create server/db/migrations/ with numbered SQL files and server/db/migrate.js:
   - Creates schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW()) if missing.
   - Takes a Postgres advisory lock (pg_advisory_lock) so two instances can never migrate at once.
   - Applies each unapplied file in order, each inside its own BEGIN/COMMIT; on error ROLLBACK and throw (server must fail to start rather than run on a half-migrated DB).
   - Exported runMigrations() used by initDb(), and runnable standalone as `npm run migrate` (server/package.json script). The standalone command must NOT run seeds and must print only migration ids, never row data.
2. 001_baseline.sql = the complete current schema (schema.sql + COLUMN_MIGRATIONS + FK_MIGRATIONS folded in, with ON DELETE CASCADE FKs as they exist today).
   Baseline adoption: if schema_migrations does not exist but the bookings table DOES exist, record 001_baseline as applied WITHOUT executing it (production already has this schema).
3. Remove the schema.sql execution and the COLUMN_MIGRATIONS / FK_MIGRATIONS arrays from initDb(). Delete schema.sql; ARCHITECTURE.md now points to server/db/migrations/ as the schema source of truth.

PART B — 002_multi_merchant.sql
4. CREATE TABLE merchants (
     id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     business_name TEXT,
     owner_name TEXT,
     whatsapp_phone TEXT,
     city TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   Insert merchant id 1 with business_name 'Bala Ji Tent House' and owner_name 'Bharat' (both already public in the UI). Do NOT put any phone number in the migration — it is set later from the app.
   Use OVERRIDING SYSTEM VALUE so the id is exactly 1, then reset the identity sequence past it.
5. Add merchant_id INTEGER to: bookings, change_log, booking_inventory, inventory_items, inventory_damage_log, booking_expenses, event_log, merchant_settings.
   Backfill every existing row with merchant_id = 1, then SET NOT NULL, FK → merchants(id).
   TEMPORARY: SET DEFAULT 1 on each merchant_id column so the current, not-yet-scoped route code keeps working. Prompt 25 removes these defaults.
6. Uniqueness:
   - inventory_items: drop the global UNIQUE(name); add UNIQUE(merchant_id, name).
   - merchant_settings: replace PRIMARY KEY(key) with PRIMARY KEY(merchant_id, key).
   - Add UNIQUE(id, merchant_id) on bookings and on inventory_items (needed for the composite FKs below).
7. Make cross-merchant links impossible at the database level by replacing the single-column child FKs with composite FKs:
   - change_log (booking_id, merchant_id) → bookings (id, merchant_id) ON DELETE CASCADE
   - booking_expenses (booking_id, merchant_id) → bookings (id, merchant_id) ON DELETE CASCADE
   - booking_inventory (booking_id, merchant_id) → bookings (id, merchant_id) ON DELETE CASCADE
   - booking_inventory (item_id, merchant_id) → inventory_items (id, merchant_id)
   - inventory_damage_log (item_id, merchant_id) → inventory_items (id, merchant_id)
   Drop the old single-column FKs on those columns.
8. Indexes: bookings (merchant_id, event_date); inventory_items (merchant_id); event_log (merchant_id, created_at); change_log (booking_id); booking_inventory (booking_id); booking_inventory (item_id); booking_expenses (booking_id); inventory_damage_log (item_id).
9. Seeds (dev only, still NODE_ENV-gated): every seed insert sets merchant_id explicitly. Existing demo data goes to merchant 1. Add a second dev-only merchant "Test Tent Co" (id 2) with 2 bookings and 2 inventory items so cross-merchant bugs are visible locally. Seed count checks become per-merchant.

Verify:
- Fresh empty local DB: npm run dev creates everything from 001 + 002 and seeds both merchants.
- Existing local DB with data: baseline is adopted, 002 applies, all existing rows have merchant_id = 1, app works exactly as before.
- Re-running npm run migrate is a no-op.
- Report the final schema of every table.
```

**Then, manually (not via Cursor):** run `npm run migrate` from your machine with `DATABASE_URL` pointed at the Neon *branch* of production and `NODE_ENV=production` (so seeds are skipped). Check row counts per table before and after in the Neon console. Only then is it safe for production.

---

## Prompt 25 — Merchant-scoped API + tenant-isolation test
**Time: 90–120 min — the most security-critical prompt in this set**

```
Scope every API route to the logged-in merchant. STATE_REPORT.md §6 lists every query; every one of them must be handled. A data leak between merchants is a Critical bug per BUGS.md.

1. Session carries the merchant:
   - Login (still the env-password login for now) signs a JWT with payload { merchant_id: 1 }, algorithm HS256.
   - requireAuth: verify the token, require an integer merchant_id in the payload (tokens without one → 401 "Your session has expired. Please log in again." — this forces old sessions to re-login), confirm the merchant row exists, and set req.merchantId. Never read merchant_id from the body, query or params.

2. Every query:
   - Every SELECT/UPDATE/DELETE on a business table includes `merchant_id = $n` bound to req.merchantId.
   - Every INSERT sets merchant_id = req.merchantId explicitly.
   - No zod schema may accept a merchant_id field (zod strips unknown keys — confirm no schema uses .passthrough()).
   - A lookup by id that doesn't belong to the merchant returns 404 "Booking not found." / "Item not found." — exactly as if it didn't exist. Never 403, never a different message.
   - Booking create/edit: every inventory item_id must belong to the merchant; otherwise 400 "One or more inventory items are invalid." The composite FKs from Prompt 24 are the backstop — catch FK violations (pg error code 23503) and return that same 400, never a 500.
   - Conflict checks, inventory availability, pending balances, analytics (including COUNT(DISTINCT phone)), usage/me (including last-active MAX), settings, reports, records: all merchant-scoped.
   - trackUsage writes merchant_id. For login, where requireAuth hasn't run, the login handler sets res.locals.merchantId and trackUsage uses res.locals.merchantId ?? req.merchantId.
   - GET /api/usage/admin stays cross-merchant (it's the admin feed) but includes merchant_id in each row and accepts an optional ?merchant_id= filter.

3. Migration 003_drop_merchant_defaults.sql: drop the temporary DEFAULT 1 from every merchant_id column, so any query that forgets merchant_id fails loudly with a NOT NULL error instead of silently writing to merchant 1.

4. server/scripts/verify-tenant-isolation.mjs (uses the destructive-script host guard from Prompt 23; refuses to run when NODE_ENV=production):
   - Uses dev merchants 1 and 2. Mints a session cookie for merchant 2 directly with JWT_SECRET.
   - Collects merchant 1's booking ids, expense ids, change log ids, and inventory item ids from the DB.
   - As merchant 2, attempts every route in SECURITY.md's route matrix against merchant 1's ids: GET/PATCH/DELETE bookings, PATCH status, PATCH log, POST/DELETE expenses, PATCH/DELETE inventory, PATCH price, POST damage, check-availability with merchant 1 item ids, check-conflict on merchant 1's dates (must report no conflict), and POST/PATCH a booking whose inventory lines reference merchant 1 items.
   - Expects 404 (or the 400 above) for every cross-merchant attempt.
   - Every list endpoint (bookings, pending balances, inventory, records, reports, analytics, usage/me, settings) as merchant 2 must contain zero merchant 1 rows and counts must match merchant 2's own data.
   - Snapshots merchant 1's row counts and a checksum of its bookings/inventory before and after: they must be identical.
   - Prints PASS/FAIL per check (ids and route names only, no client names or phones) and exits non-zero on any FAIL.

5. Update SECURITY.md: threat model now includes "one merchant reading or modifying another merchant's data"; document req.merchantId, the 404 rule, and the composite FKs. Add the isolation script to TESTING.md's pre-deploy pass.

Verify: the isolation script passes; then log in normally and run TESTING.md's happy path — everything still works for merchant 1.
```

---

## Prompt 26 — Google, phone OTP and email sign-in via Firebase + merchant onboarding
**Time: 2–3 hours**

**Manual setup first (you, not Cursor):**
1. Create a Firebase project. In Authentication, enable Google, Email/Password, and Phone.
2. Phone sign-in needs the Blaze plan: attach billing and **set a budget alert** (e.g. ₹200). In Phone settings, add 2–3 *test phone numbers* with fixed codes — they cost nothing and are what you use for development and the demo video.
3. Authentication → Settings → Authorized domains: add `localhost` and `eventflow-brown.vercel.app`.
4. Copy the web app config into `client/.env` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (these are public identifiers, not secrets) and into Vercel's env vars.
5. Generate a service account key. Put the JSON into `FIREBASE_SERVICE_ACCOUNT` in `server/.env` and Render's env vars. **This one is a secret** — never commit it, never paste it into Cursor or any chat.

```
Replace the single env-password login with Firebase Authentication (Google, phone OTP, email/password) and add merchant signup + onboarding. Our own httpOnly session cookie stays the only session the API trusts, per SECURITY.md — Firebase is used only to prove identity once at sign-in.

DATABASE — 004_merchant_auth.sql:
- merchants add: firebase_uid TEXT UNIQUE, auth_provider TEXT, auth_email TEXT, auth_phone TEXT, claim_phone TEXT, onboarding_complete BOOLEAN NOT NULL DEFAULT false, privacy_accepted_at TIMESTAMPTZ.
- UPDATE merchants SET onboarding_complete = true WHERE id = 1.
- Do NOT put any phone number in the migration. Add server/scripts/set-claim-phone.mjs (host-guarded) that sets merchants.claim_phone for a given merchant id from a CLI argument, so I can run it once for merchant 1 with the owner's number.

SERVER:
1. Install firebase-admin. server/lib/firebaseAdmin.js initializes it from process.env.FIREBASE_SERVICE_ACCOUNT (JSON string). Add FIREBASE_SERVICE_ACCOUNT to .env.example as a placeholder and to the required-at-boot env check.
2. POST /api/auth/session { idToken } — rate limited (10 per 15 min per IP), zod-validated:
   - admin.auth().verifyIdToken(idToken, true) (checks revocation).
   - Reject if auth_time is older than 5 minutes (prevents replaying an old token).
   - For password-provider accounts, require email_verified === true; otherwise 403 { error: "Please verify your email first.", code: "EMAIL_NOT_VERIFIED" }.
   - Find merchant by firebase_uid. If none: if the token has a verified phone_number equal to some merchant's claim_phone AND that merchant's firebase_uid IS NULL, link it (set firebase_uid, clear claim_phone). Otherwise create a new merchant with onboarding_complete = false.
   - Wrap find/link/create in a transaction. Store auth_provider, auth_email / auth_phone from the token.
   - Issue our session cookie with JWT { merchant_id } exactly per SECURITY.md. Respond { authenticated: true, onboarding_complete }.
3. GET /api/merchants/me → { business_name, owner_name, whatsapp_phone, city, onboarding_complete }.
   PATCH /api/merchants/me — zod: business_name 2–100, owner_name 1–60, city 2–60, whatsapp_phone Indian mobile regex (same as bookings), privacy_accepted boolean. If privacy_accepted is true and privacy_accepted_at is null, set it to NOW(). onboarding_complete becomes true once business_name, owner_name and privacy_accepted_at are all set.
   requireAuth-protected. Add both to SECURITY.md's route matrix.
4. Keep the old POST /api/auth/login password route ONLY when process.env.LEGACY_PASSWORD_LOGIN === 'true' (mapping to merchant 1). I will remove it after the owner of merchant 1 has signed in by phone successfully. When the flag is off, MERCHANT_PASSWORD_HASH is no longer required at boot.
5. Business routes must reject sessions whose merchant has onboarding_complete = false with 403 { code: "ONBOARDING_REQUIRED" }, except GET/PATCH /api/merchants/me and logout.

CLIENT:
6. Install firebase. client/src/utils/firebase.js initializes from the VITE_FIREBASE_* env vars.
7. Replace LoginScreen.jsx with AuthScreen.jsx: EventFlow branding (not any merchant's name), three options:
   - "Continue with Google" (signInWithPopup).
   - Phone: +91 number input (validated) → invisible reCAPTCHA → 6-digit OTP entry with resend timer.
   - Email: sign in / create account / forgot password (sendPasswordResetEmail). On account creation send a verification email and show a "check your inbox" state with a resend button.
   After any Firebase sign-in: getIdToken() → POST /api/auth/session → then signOut() from Firebase on the client (our cookie is the only session). Map Firebase error codes to plain human sentences — never show raw "auth/..." codes.
8. Onboarding screen (shown when onboarding_complete is false): business name, your name, city, WhatsApp number shown to clients, and a consent checkbox with a short plain-language privacy notice: what EventFlow stores (your clients' names, phone numbers, event details), where (our cloud database), who can access it (you; the EventFlow developers for support), and that you can ask for export or deletion at any time. Submit → PATCH /api/merchants/me.
9. merchantStore.js (Zustand) holds the profile. Replace EVERY hardcoded merchant value listed in STATE_REPORT.md §7 with profile values: "Bala Ji Tent House" (index.html, App, Sidebar, LoginScreen, whatsapp.js sign-offs, excelExporter, reportPrinter) and the "Bharat" greeting in CalendarView. Replace VITE_MERCHANT_PHONE with merchant.whatsapp_phone and remove that env var. index.html title becomes "EventFlow"; set document.title to `EventFlow — ${business_name}` after load.
10. Add a "Business Profile" section (Sidebar → settings area) to edit the same fields later.
11. Logout clears our cookie and also calls Firebase signOut().

DOCS:
12. SECURITY.md: rewrite the Auth model section for Firebase identity + our session cookie; add the new routes and env vars; keep every existing rule.
13. DATA_PRIVACY.md: multi-merchant section — each merchant is a data fiduciary for their clients; Firebase (Google) now stores merchant login identities (email/phone); signup consent is recorded in privacy_accepted_at; export/deletion requests are per merchant.
14. ROADMAP.md Scope decisions log: "[Added] Google, phone OTP and email sign-in via Firebase Authentication; replaces the single env password."
15. ARCHITECTURE.md: env vars, auth flow, merchants table.

Verify:
- New Google account → onboarding → empty calendar with its own business name in the sidebar and WhatsApp sign-off.
- Firebase test phone number → OTP → onboarding.
- Email signup → blocked until verified → works after verifying.
- After running set-claim-phone for merchant 1, signing in with that phone lands on merchant 1's existing data with no onboarding.
- verify-tenant-isolation.mjs still passes.
- An unverified email account, an expired session, and a merchant mid-onboarding cannot reach any business route.
```

---

## After this set

- Deploy with `LEGACY_PASSWORD_LOGIN=true`, have Bharat sign in once by phone, confirm he sees his data, then set the flag to `false` and remove `MERCHANT_PASSWORD_HASH`.
- Create a demo merchant (Firebase email account + fake data) for the hackathon video and for judges to try — never record merchant 1.
- Then: full audit with Shannon against a local build using two merchant accounts, and the UI redesign.
