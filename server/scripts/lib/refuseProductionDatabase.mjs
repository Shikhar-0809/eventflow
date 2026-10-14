// Side-effect import for verify and seed scripts: they must never run against production.
// Import it right after `import 'dotenv/config'` and before db/database.js.
import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { touchesProductionDb } from '../../config/productionHosts.js'

const libDir = dirname(fileURLToPath(import.meta.url))

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: join(libDir, '../../.env') })
}

if (touchesProductionDb()) {
  console.error('Refusing to run: DATABASE_URL points at the PRODUCTION database. Point it at a dev branch.')
  process.exit(1)
}
