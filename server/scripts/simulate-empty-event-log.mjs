import db from '../db/database.js'

const MODE = process.argv[2] // snapshot | clear | restore

const SNAPSHOT_TABLE = 'event_log_prompt11_verify_snapshot'

if (MODE === 'snapshot') {
  db.exec(`DROP TABLE IF EXISTS ${SNAPSHOT_TABLE}`)
  db.exec(
    `CREATE TABLE ${SNAPSHOT_TABLE} AS SELECT id, event_type, metadata, created_at FROM event_log`,
  )
  const n = db.prepare(`SELECT COUNT(*) AS c FROM ${SNAPSHOT_TABLE}`).get().c
  console.log(JSON.stringify({ action: 'snapshot', rows: n }, null, 2))
} else if (MODE === 'clear') {
  const before = db.prepare('SELECT COUNT(*) AS c FROM event_log').get().c
  db.exec('DELETE FROM event_log')
  const after = db.prepare('SELECT COUNT(*) AS c FROM event_log').get().c
  console.log(JSON.stringify({ action: 'clear', before, after }, null, 2))
} else if (MODE === 'restore') {
  const exists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    )
    .get(SNAPSHOT_TABLE)
  if (!exists) {
    console.error('No snapshot table — run snapshot first')
    process.exit(1)
  }
  db.exec('DELETE FROM event_log')
  db.exec(
    `INSERT INTO event_log (id, event_type, metadata, created_at)
     SELECT id, event_type, metadata, created_at FROM ${SNAPSHOT_TABLE}`,
  )
  db.exec(`DROP TABLE IF EXISTS ${SNAPSHOT_TABLE}`)
  const n = db.prepare('SELECT COUNT(*) AS c FROM event_log').get().c
  console.log(JSON.stringify({ action: 'restore', rows: n }, null, 2))
} else {
  console.error('Usage: node scripts/simulate-empty-event-log.mjs <snapshot|clear|restore>')
  process.exit(1)
}
