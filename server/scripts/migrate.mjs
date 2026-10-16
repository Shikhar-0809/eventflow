// Applies pending database migrations and nothing else: no seeds, and it prints only migration ids.
// Usage: npm run migrate -- --confirm-host=<host>
// Production additionally needs NODE_ENV=production and --i-really-mean-production
// (see scripts/lib/confirmDatabaseHost.mjs). The server also runs migrations at boot.
import { assertConfirmedDatabaseHost, databaseNameFromUrl } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { runMigrations } = await import('../db/migrate.js')

try {
  // The name the server reports for the live connection, printed before anything is applied.
  const { rows } = await pool.query('SELECT current_database() AS name')
  const liveName = rows[0].name
  console.log(`Connected to database: ${liveName}`)
  const urlName = databaseNameFromUrl(process.env.DATABASE_URL)
  if (urlName && urlName !== liveName) {
    throw new Error(`the URL names database "${urlName}" but the connection is to "${liveName}"; refusing to apply`)
  }
  await runMigrations(pool)
} catch (err) {
  console.error(`migrate failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
