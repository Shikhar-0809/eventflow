import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')

const { rowCount: deleted } = await pool.query(
  "DELETE FROM event_log WHERE event_type IN ('timing_probe', 'broken_probe', 'order_probe')",
)

const { rows } = await pool.query(
  'SELECT id, event_type, metadata FROM event_log ORDER BY id',
)

console.log(JSON.stringify({ deleted, rows }, null, 2))
