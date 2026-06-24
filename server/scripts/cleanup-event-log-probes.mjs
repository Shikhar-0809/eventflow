import db from '../db/database.js'

const deleted = db
  .prepare("DELETE FROM event_log WHERE event_type IN ('timing_probe', 'broken_probe', 'order_probe')")
  .run()

const rows = db.prepare('SELECT id, event_type, metadata FROM event_log ORDER BY id').all()

console.log(JSON.stringify({ deleted: deleted.changes, rows }, null, 2))
