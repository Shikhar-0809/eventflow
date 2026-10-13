import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
})

const COLUMN_MIGRATIONS = [
  'ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_price INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE booking_inventory ADD COLUMN IF NOT EXISTS unit_price INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE booking_inventory ADD COLUMN IF NOT EXISTS line_total INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS subtotal INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS grand_total INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_type_custom TEXT',
]

const FK_MIGRATIONS = [
  'ALTER TABLE change_log DROP CONSTRAINT IF EXISTS change_log_booking_id_fkey',
  'ALTER TABLE change_log ADD CONSTRAINT change_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE',
  'ALTER TABLE booking_inventory DROP CONSTRAINT IF EXISTS booking_inventory_booking_id_fkey',
  'ALTER TABLE booking_inventory ADD CONSTRAINT booking_inventory_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE',
]

export const initDb = async () => {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(schema)

  for (const sql of COLUMN_MIGRATIONS) {
    await pool.query(sql)
  }

  for (const sql of FK_MIGRATIONS) {
    await pool.query(sql)
  }

  console.log('Schema initialized')
}
