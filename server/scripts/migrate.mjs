// Applies pending database migrations and nothing else: no seeds, and it prints only migration ids.
// Usage: npm run migrate -- --confirm-host=<host>
// Production additionally needs NODE_ENV=production and --i-really-mean-production
// (see scripts/lib/confirmDatabaseHost.mjs). The server also runs migrations at boot.
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { runMigrations } = await import('../db/migrate.js')

try {
  await runMigrations(pool)
} catch (err) {
  console.error(`migrate failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
