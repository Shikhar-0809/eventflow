# RUNBOOK.md — EventFlow

Operational procedures. Keep each one short and exact. Never paste a connection string, secret or real client data into chat, tickets or logs.

---

## Release rollback — Prompts 24 + 25 (multi-merchant)

The release ships in two pushes (see DEPLOYMENT.md, "Releasing the multi-merchant work"):
**(a)** everything except `004_drop_merchant_defaults`, **(b)** `004` alone.

### What to have before pushing (a)

- **Rollback target:** `126f0a180ac8883164a030bad18f683d5163f0e4` — `origin/main` on 2026-10-14, the last release before the multi-merchant work. Everything below that says "the rollback SHA" means this commit.
- **A fresh Neon restore-point branch of production**, created immediately before push (a). Write its name here when you create it: `____________`. (The older restore point from 2026-10-13 is too stale to use.)

### Decide what actually went wrong first

| Symptom after push (a) | Do this |
|---|---|
| App up, only a small thing wrong | Fix forward. Rolling back is a last resort. |
| App broken, database fine | **Code rollback** (below). The schema changes are additive and the old code still runs on them. |
| Database damaged or a migration half-applied | **Database restore** (below), then a code rollback. |

### 1. Code rollback (Render + Vercel), no force-push

Never force-push or rewrite `main` to roll back (CLAUDE.md: never rewrite history).

- **Render (API):** dashboard → the API service → *Deploys* → either *Rollback* on the last good deploy, or *Manual Deploy → Deploy a specific commit* and give the rollback SHA above.
- **Vercel (frontend):** dashboard → *Deployments* → the last good production deployment → *Promote to Production* (instant rollback).
- Verify: `GET /api/health` returns ok; log in; calendar, bookings, inventory load.

What the old code (the rollback SHA) does on the migrated database, **as long as push (b) has NOT been applied** (the `DEFAULT 1` on `merchant_id` still exists):

- Works: login, bookings, inventory, records, analytics, usage. Every new row lands on merchant 1 through the default.
- **Broken: saving the monthly revenue target returns an error** (the old query uses `ON CONFLICT (key)`, but the primary key is now `(merchant_id, key)`). Reading it still works.
- If push (b) HAS been applied, run `004_down` first (next section), otherwise the old code's inserts fail with a NOT NULL error.

### 2. Undo push (b): `004_down`

Use this when push (b) (`004_drop_merchant_defaults`) was applied and you need the defaults back, typically before rolling the code back to the rollback SHA.

1. Open the Neon **SQL editor** for the production database (not via any script or chat).
2. Paste the whole of `server/db/rollback/004_down.sql` and run it. It is one transaction (`BEGIN … COMMIT`). It restores `DEFAULT 1` on `merchant_id` of exactly these 8 tables: `bookings`, `change_log`, `booking_inventory`, `inventory_items`, `inventory_damage_log`, `booking_expenses`, `event_log`, `merchant_settings`, and removes `004` from `schema_migrations` so the next deploy applies it again.
3. Check: `SELECT table_name, column_default FROM information_schema.columns WHERE column_name = 'merchant_id' AND table_schema = 'public' ORDER BY 1;` must show `1` for all 8, and `SELECT id FROM schema_migrations ORDER BY id;` must no longer list `004_drop_merchant_defaults`.
4. Then roll the code back (section 1).

`004_down.sql` lives in `server/db/rollback/` on purpose: the migration runner only reads `server/db/migrations/`, so it is **never** run on boot. It was tested on the dev database: it was applied after `004`, every column default then matched the schema produced by executing `001`+`002`+`003`, and re-applying `004` with the runner restored the post-004 schema exactly.

### 3. Database restore from the Neon restore-point branch

Last resort: **everything written to production after the restore point is lost** (new bookings, edits, usage events). Prefer fix-forward or a code rollback.

1. Stop writes: put the API into maintenance (suspend the Render service) so nothing is written during the restore.
2. Neon console → the production branch → *Restore* from the restore-point branch you created before push (a) (or point the API's `DATABASE_URL` at the restore-point branch — a dashboard env change, done by you, never pasted anywhere).
3. Roll the code back to the rollback SHA (section 1). The restored database is pre-migration, so the old code matches it and the new code would simply re-run `001` (adopt), `002`, `003` on the next boot.
4. Resume the service and verify as in section 1. Tell the merchant which period of entries may need re-entering.

### After any rollback

- Log what happened in BUGS.md (severity per the table there) before trying again.
- Everyone has to log in again after moving between the old and the new code if their session cookie was issued by the other version: the new code rejects tokens without `merchant_id`.
