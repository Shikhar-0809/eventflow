import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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

export const assertConfirmedDatabaseHost = () => {
  if (!process.env.DATABASE_URL) {
    dotenv.config({ path: join(libDir, '../../.env') })
  }

  const host = databaseHostFromUrl(process.env.DATABASE_URL)
  if (!host) {
    console.error('Refusing to run: DATABASE_URL is missing or has no host.')
    process.exit(1)
  }

  console.log(`Target database host: ${host}`)

  const prefix = '--confirm-host='
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  const given = match ? match.slice(prefix.length) : ''
  if (given !== host) {
    console.error(`Refusing to run. Pass --confirm-host=${host}`)
    process.exit(1)
  }

  return host
}
