import { pool } from '../db/database.js'

const MODE = process.argv[2] // snapshot | clear | restore

const SNAPSHOT_TABLE = 'event_log_prompt11_verify_snapshot'

if (MODE !== 'snapshot' && MODE !== 'clear' && MODE !== 'restore') {
  console.error('Usage: node scripts/simulate-empty-event-log.mjs <snapshot|clear|restore>')
  process.exit(1)
}

try {
  if (MODE === 'snapshot') {
    await pool.query(`DROP TABLE IF EXISTS ${SNAPSHOT_TABLE}`)
    await pool.query(
      `CREATE TABLE ${SNAPSHOT_TABLE} AS SELECT id, event_type, metadata, created_at FROM event_log`,
    )
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${SNAPSHOT_TABLE}`)
    const n = rows[0].c
    console.log(JSON.stringify({ action: 'snapshot', rows: n }, null, 2))
  } else if (MODE === 'clear') {
    const { rows: beforeRows } = await pool.query('SELECT COUNT(*)::int AS c FROM event_log')
    const before = beforeRows[0].c
    await pool.query('DELETE FROM event_log')
    const { rows: afterRows } = await pool.query('SELECT COUNT(*)::int AS c FROM event_log')
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
      console.error('No snapshot table — run snapshot first')
      process.exit(1)
    }
    await pool.query('DELETE FROM event_log')
    await pool.query(
      `INSERT INTO event_log (id, event_type, metadata, created_at)
       SELECT id, event_type, metadata, created_at FROM ${SNAPSHOT_TABLE}`,
    )
    await pool.query(`DROP TABLE IF EXISTS ${SNAPSHOT_TABLE}`)
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM event_log')
    const n = rows[0].c
    console.log(JSON.stringify({ action: 'restore', rows: n }, null, 2))
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
