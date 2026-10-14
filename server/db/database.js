import pg from 'pg'
import { touchesProductionDb, PRODUCTION_DB_REFUSAL } from '../config/productionHosts.js'
import { runMigrations } from './migrate.js'

const { Pool } = pg

// Every server start and every script creates the pool here, so this one check covers them all.
if (process.env.NODE_ENV !== 'production' && touchesProductionDb()) {
  console.error(PRODUCTION_DB_REFUSAL)
  process.exit(1)
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
})

// The schema lives in db/migrations/ (numbered SQL files applied once each, in order).
// A failed migration throws, so the server refuses to start on a half-migrated database.
export const initDb = async () => {
  await runMigrations(pool)
  console.log('Schema initialized')
}
