import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { seed } from './seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'eventflow.db')
const SCHEMA_PATH = join(__dirname, 'schema.sql')

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.exec(readFileSync(SCHEMA_PATH, 'utf-8'))

const bookingColumns = db.prepare('PRAGMA table_info(bookings)').all().map((col) => col.name)
if (!bookingColumns.includes('updated_at')) {
  db.exec('ALTER TABLE bookings ADD COLUMN updated_at TEXT')
  db.exec("UPDATE bookings SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL")
}

seed(db)

export default db
