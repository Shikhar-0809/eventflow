import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

export const initDb = async () => {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(schema)
  console.log('Schema initialized')
}

const toPgSql = (sql) => {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

/** Legacy shim for middleware/scripts still on the sync prepare API. */
const db = {
  prepare(sql) {
    const pgSql = toPgSql(sql)
    return {
      run(...params) {
        pool.query(pgSql, params).catch(() => {})
      },
      get(...params) {
        throw new Error('db.prepare().get() is not supported — use pool.query() instead')
      },
      all(...params) {
        throw new Error('db.prepare().all() is not supported — use pool.query() instead')
      },
    }
  },
}

export default db
