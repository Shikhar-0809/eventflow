import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { requireMerchantId } = await import('./lib/merchantArg.mjs')

const merchantId = await requireMerchantId(pool)

const { rowCount: deleted } = await pool.query(
  "DELETE FROM event_log WHERE merchant_id = $1 AND event_type IN ('timing_probe', 'broken_probe', 'order_probe')",
  [merchantId],
)

const { rows } = await pool.query(
  'SELECT id, event_type, metadata FROM event_log WHERE merchant_id = $1 ORDER BY id',
  [merchantId],
)

console.log(JSON.stringify({ deleted, rows }, null, 2))
await pool.end()
