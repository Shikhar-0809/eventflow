// Never for production (BUGS #103): refuses the production host outright, on top of --confirm-host and --merchant-id.
import './lib/refuseProductionDatabase.mjs'
import { assertConfirmedDatabaseHost } from './lib/confirmDatabaseHost.mjs'

assertConfirmedDatabaseHost()

const { pool } = await import('../db/database.js')
const { requireMerchantId } = await import('./lib/merchantArg.mjs')

const MODE = process.argv[2] // snapshot | clear | restore

if (MODE !== 'snapshot' && MODE !== 'clear' && MODE !== 'restore') {
  console.error('Usage: node scripts/simulate-empty-event-log.mjs <snapshot|clear|restore> --merchant-id=<n>')
  process.exit(1)
}

// Acts on ONE merchant's event_log only (--merchant-id=<n>), in addition to the --confirm-host guard.
const merchantId = await requireMerchantId(pool)
// One snapshot table per merchant, so two merchants' snapshots never overwrite each other.
const SNAPSHOT_TABLE = `event_log_prompt11_verify_snapshot_m${merchantId}`

try {
  if (MODE === 'snapshot') {
    await pool.query(`DROP TABLE IF EXISTS ${SNAPSHOT_TABLE}`)
    await pool.query(
      `CREATE TABLE ${SNAPSHOT_TABLE} AS
       SELECT id, merchant_id, event_type, metadata, created_at FROM event_log WHERE merchant_id = $1`,
      [merchantId],
    )
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${SNAPSHOT_TABLE}`)
    const n = rows[0].c
    console.log(JSON.stringify({ action: 'snapshot', rows: n }, null, 2))
  } else if (MODE === 'clear') {
    const { rows: beforeRows } = await pool.query('SELECT COUNT(*)::int AS c FROM event_log WHERE merchant_id = $1', [merchantId])
    const before = beforeRows[0].c
    await pool.query('DELETE FROM event_log WHERE merchant_id = $1', [merchantId])
    const { rows: afterRows } = await pool.query('SELECT COUNT(*)::int AS c FROM event_log WHERE merchant_id = $1', [merchantId])
    const after = afterRows[0].c
    console.log(JSON.stringify({ action: 'clear', before, after }, null, 2))
  } else if (MODE === 'restore') {
    const { rows: existsRows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [SNAPSHOT_TABLE],
    )
    const exists = existsRows[0]
    if (!exists) {
      console.error('No snapshot table for this merchant — run snapshot first')
      process.exit(1)
    }
    await pool.query('DELETE FROM event_log WHERE merchant_id = $1', [merchantId])
    // id is GENERATED ALWAYS, so restoring the original ids needs OVERRIDING SYSTEM VALUE.
    await pool.query(
      `INSERT INTO event_log (id, merchant_id, event_type, metadata, created_at)
       OVERRIDING SYSTEM VALUE
       SELECT id, merchant_id, event_type, metadata, created_at FROM ${SNAPSHOT_TABLE} WHERE merchant_id = $1`,
      [merchantId],
    )
    await pool.query(`DROP TABLE IF EXISTS ${SNAPSHOT_TABLE}`)
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM event_log WHERE merchant_id = $1', [merchantId])
    const n = rows[0].c
    console.log(JSON.stringify({ action: 'restore', rows: n }, null, 2))
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
