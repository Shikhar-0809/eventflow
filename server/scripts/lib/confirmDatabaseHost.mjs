import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { touchesProductionDb } from '../../config/productionHosts.js'

const libDir = dirname(fileURLToPath(import.meta.url))

export const databaseHostFromUrl = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') return null
  try {
    const url = new URL(connectionString.replace(/^postgres(ql)?:\/\//i, 'http://'))
    return url.hostname || null
  } catch {
    return null
  }
}

// The database name from the connection string path (no connection is made). Names are not secrets.
export const databaseNameFromUrl = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') return null
  try {
    const url = new URL(connectionString.replace(/^postgres(ql)?:\/\//i, 'http://'))
    return decodeURIComponent(url.pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}

export const assertConfirmedDatabaseHost = () => {
  // A DATABASE_URL already in the shell always wins: the env file is only read when it is unset, and never overrides.
  const fromShell = Boolean(process.env.DATABASE_URL)
  if (!fromShell) {
    dotenv.config({ path: join(libDir, '../../.env'), override: false })
  }

  const host = databaseHostFromUrl(process.env.DATABASE_URL)
  if (!host) {
    console.error('Refusing to run: DATABASE_URL is missing or has no host.')
    process.exit(1)
  }

  console.log(`Target database host: ${host}`)
  console.log(`Target database name (from URL): ${databaseNameFromUrl(process.env.DATABASE_URL) ?? '(none in URL)'}`)
  console.log(`DATABASE_URL came from: ${fromShell ? 'the shell environment' : 'server/.env'}`)

  // The production host is refused outright unless the caller names it explicitly.
  // (db/database.js additionally refuses it whenever NODE_ENV is not production.)
  if (touchesProductionDb()) {
    if (!process.argv.includes('--i-really-mean-production')) {
      console.error(
        'Refusing to run: this is the PRODUCTION database. Pass --i-really-mean-production as well, and run with NODE_ENV=production.',
      )
      process.exit(1)
    }
    console.warn('WARNING: --i-really-mean-production passed. This run targets the PRODUCTION database.')
  }

  const prefix = '--confirm-host='
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  const given = match ? match.slice(prefix.length) : ''
  if (given !== host) {
    console.error(`Refusing to run. Pass --confirm-host=${host}`)
    process.exit(1)
  }

  return host
}
