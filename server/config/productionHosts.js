// Single source of truth for the production database host. A hostname, not a secret.
// Everything that must refuse to touch production (db/database.js, scripts/lib/*) reads it from here.
export const PRODUCTION_DB_HOSTS = ['ep-hidden-bread-aoqohpwb-pooler.c-2.ap-southeast-1.aws.neon.tech']

export const PRODUCTION_DB_REFUSAL =
  'Local dev is pointed at the PRODUCTION database. Point DATABASE_URL at a dev branch.'

// Neon serves the same database on "<endpoint>-pooler.<rest>" and "<endpoint>.<rest>".
const normalizeHost = (host) => String(host).trim().toLowerCase().replace(/-pooler(?=\.|$)/, '')

const PRODUCTION_NORMALIZED = new Set(PRODUCTION_DB_HOSTS.map(normalizeHost))

export const isProductionDbHost = (host) =>
  typeof host === 'string' && host.length > 0 && PRODUCTION_NORMALIZED.has(normalizeHost(host))

// Every host pg could connect to: the DATABASE_URL hostname, a ?host= override, and PGHOST.
// Returns hostnames only, never the URL or any credentials.
export const dbHostsFromEnv = (env = process.env) => {
  const hosts = []
  const connectionString = env.DATABASE_URL
  if (typeof connectionString === 'string' && connectionString) {
    try {
      const url = new URL(connectionString.replace(/^postgres(ql)?:\/\//i, 'http://'))
      if (url.hostname) hosts.push(url.hostname)
      const override = url.searchParams.get('host')
      if (override) hosts.push(override)
    } catch {
      // Unparsable URL: pg will fail to connect on its own.
    }
  }
  if (env.PGHOST) hosts.push(...env.PGHOST.split(','))
  return hosts
}

export const touchesProductionDb = (env = process.env) => dbHostsFromEnv(env).some(isProductionDbHost)
