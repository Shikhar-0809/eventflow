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

seed(db)

export default db
