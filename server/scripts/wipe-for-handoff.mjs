import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const confirmed = process.argv.includes('--confirm')

const DELETE_ORDER = [
  'booking_inventory',
  'inventory_damage_log',
  'change_log',
  'event_log',
  'bookings',
]

function parseDbHost(connectionString) {
  if (!connectionString) return null
  try {
    const url = new URL(connectionString.replace(/^postgres(ql)?:/, 'http:'))
    return url.hostname
  } catch {
    return null
  }
}

function validateDatabaseUrl(connectionString) {
  if (!connectionString?.trim()) {
    console.error('ABORT: DATABASE_URL is not set in server/.env.')
    process.exit(1)
  }

  const host = parseDbHost(connectionString)
  const lower = connectionString.toLowerCase()

  const localPatterns = ['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal']
  if (localPatterns.some((pattern) => lower.includes(pattern))) {
    console.error(
      `ABORT: DATABASE_URL looks like a local/dev database (host: ${host ?? 'unknown'}). Refusing to run.`,
    )
    process.exit(1)
  }

  if (!lower.includes('.neon.tech')) {
    console.error(
      `ABORT: DATABASE_URL host "${host ?? 'unknown'}" is not a Neon hostname (expected *.neon.tech). Refusing to run.`,
    )
    process.exit(1)
  }

  return host
}

async function countRows(pool, table) {
  const result = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`)
  return result.rows[0].n
}

async function run() {
  const connectionString = process.env.DATABASE_URL
  const host = validateDatabaseUrl(connectionString)

  console.log('='.repeat(60))
  console.log('EventFlow production data wipe (handoff)')
  console.log('='.repeat(60))
  console.log(`Target database host: ${host}`)
  console.log(`Mode: ${confirmed ? 'LIVE WIPE (--confirm)' : 'DRY RUN (no changes)'}`)
  console.log('')

  const { pool } = await import('../db/database.js')

  if (!confirmed) {
    console.log('Would delete all rows from (in this order):')
    for (const table of DELETE_ORDER) {
      const count = await countRows(pool, table)
      console.log(`  ${table}: ${count} row(s) would be deleted`)
    }

    const inventoryCount = await countRows(pool, 'inventory_items')
    console.log(
      `  inventory_items: ${inventoryCount} row(s) would be preserved; total_quantity and damaged_quantity reset to 0`,
    )
    console.log('')
    console.log('No data was modified.')
    console.log('To execute the wipe, run:')
    console.log('  node server/scripts/wipe-for-handoff.mjs --confirm')
    await pool.end()
    return
  }

  for (const table of DELETE_ORDER) {
    const result = await pool.query(`DELETE FROM ${table}`)
    console.log(`${table}: ${result.rowCount} row(s) deleted`)
  }

  const inventoryUpdate = await pool.query(
    'UPDATE inventory_items SET damaged_quantity = 0, total_quantity = 0',
  )
  console.log(
    `inventory_items: ${inventoryUpdate.rowCount} row(s) updated (quantities reset to 0)`,
  )

  console.log('')
  console.log(
    'Wipe complete. Inventory item types preserved with quantities reset to 0. Ready for handoff.',
  )

  await pool.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
