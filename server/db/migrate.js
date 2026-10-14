import { readdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/
// Migration files must not manage their own transaction: the runner wraps each one.
// (A plpgsql "BEGIN" inside DO $$ ... $$ has no semicolon straight after it, so it is not matched.)
const OWN_TRANSACTION = /^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im

const BASELINE_ID = '001_baseline'
// Arbitrary application-wide key for the migration lock.
const LOCK_KEY = 7240024

// What the baseline schema must already contain before an existing database may adopt it.
const BASELINE_COLUMNS = [
  ['bookings', 'subtotal'], ['bookings', 'discount'], ['bookings', 'grand_total'],
  ['bookings', 'event_type_custom'], ['bookings', 'updated_at'],
  ['inventory_items', 'unit_price'],
  ['booking_inventory', 'unit_price'], ['booking_inventory', 'line_total'],
  ['change_log', 'booking_id'], ['inventory_damage_log', 'item_id'],
  ['booking_expenses', 'booking_id'], ['merchant_settings', 'key'], ['event_log', 'metadata'],
]
const CASCADE_CHILDREN = ['change_log', 'booking_inventory', 'booking_expenses']

const loadMigrations = (dir) => {
  const files = readdirSync(dir).filter((name) => FILE_PATTERN.test(name)).sort()
  const seenPrefixes = new Set()
  return files.map((name) => {
    const prefix = name.slice(0, 3)
    if (seenPrefixes.has(prefix)) {
      throw new Error(`Two migrations share the number ${prefix}`)
    }
    seenPrefixes.add(prefix)
    const sql = readFileSync(join(dir, name), 'utf8')
    if (OWN_TRANSACTION.test(sql)) {
      throw new Error(`Migration ${name} must not contain BEGIN/COMMIT/ROLLBACK`)
    }
    return { id: name.slice(0, -'.sql'.length), sql }
  })
}

// One transaction holding a transaction-scoped advisory lock. Unlike a session lock, this stays
// correct through Neon's pooled (PgBouncer, transaction mode) endpoint, and anyone who waited
// re-checks state after the lock is granted.
const withLock = async (client, work) => {
  await client.query('BEGIN')
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY])
    const result = await work()
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

const assertBaselineCurrent = async (client) => {
  const missing = []

  const { rows: columns } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema()`,
  )
  const present = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`))
  for (const [table, column] of BASELINE_COLUMNS) {
    if (!present.has(`${table}.${column}`)) missing.push(`${table}.${column}`)
  }

  const { rows: foreignKeys } = await client.query(
    `SELECT conrelid::regclass::text AS child, confdeltype
     FROM pg_constraint
     WHERE contype = 'f' AND confrelid = 'bookings'::regclass`,
  )
  for (const child of CASCADE_CHILDREN) {
    const cascades = foreignKeys.some((fk) => fk.child === child && fk.confdeltype === 'c')
    if (!cascades) missing.push(`${child} -> bookings ON DELETE CASCADE`)
  }

  if (missing.length > 0) {
    throw new Error(
      `Existing database is not at the baseline schema (missing: ${missing.join(', ')}). Refusing to adopt it.`,
    )
  }
}

// `dir` exists so tests can point the runner at a temporary folder; the app always uses db/migrations/.
export const runMigrations = async (pool, { dir = DEFAULT_MIGRATIONS_DIR } = {}) => {
  const migrations = loadMigrations(dir)
  const client = await pool.connect()
  const applied = []
  let adopted = false

  try {
    try {
      await withLock(client, async () => {
        const { rows } = await client.query(
          "SELECT to_regclass('schema_migrations') AS tracker, to_regclass('bookings') AS bookings",
        )
        const { tracker, bookings } = rows[0]
        if (tracker) return

        const adopting = Boolean(bookings)
        if (adopting) await assertBaselineCurrent(client)

        await client.query(
          `CREATE TABLE schema_migrations (
             id         TEXT PRIMARY KEY,
             applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
           )`,
        )
        if (adopting) {
          // Production already has this schema: record the baseline without executing it.
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [BASELINE_ID])
          adopted = true
        }
      })
    } catch (err) {
      throw new Error(`Migration setup failed: ${err.message}`)
    }
    if (adopted) console.log(`migrate: baseline adopted ${BASELINE_ID}`)

    for (const migration of migrations) {
      try {
        const ran = await withLock(client, async () => {
          const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [migration.id])
          if (rows.length > 0) return false
          await client.query(migration.sql)
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id])
          return true
        })
        if (ran) {
          applied.push(migration.id)
          console.log(`migrate: applied ${migration.id}`)
        }
      } catch (err) {
        // Message only: Postgres error detail can contain row values.
        throw new Error(`Migration ${migration.id} failed: ${err.message}`)
      }
    }

    const known = new Set(migrations.map((migration) => migration.id))
    const { rows: recorded } = await client.query('SELECT id FROM schema_migrations ORDER BY id')
    const unknown = recorded.map((row) => row.id).filter((id) => !known.has(id))
    if (unknown.length > 0) {
      console.warn(`migrate: database has migrations this code does not know: ${unknown.join(', ')}`)
    }

    if (applied.length === 0 && !adopted) console.log('migrate: nothing to apply')
    return { applied, adopted }
  } finally {
    client.release()
  }
}
