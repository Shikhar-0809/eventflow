import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import bcrypt from 'bcryptjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')
const credentialPath = join(root, '.dev-login-credential')

const password = randomBytes(24).toString('base64url')
const hash = bcrypt.hashSync(password, 10)

const env = readFileSync(envPath, 'utf8')
const updated = env.replace(
  /^MERCHANT_PASSWORD_HASH=.*$/m,
  `MERCHANT_PASSWORD_HASH=${hash}`,
)
writeFileSync(envPath, updated, 'utf8')
writeFileSync(credentialPath, password, { encoding: 'utf8', mode: 0o600 })

const verified = bcrypt.compareSync(password, hash)
if (!verified) {
  console.error('BLOCKED: bcrypt self-check failed')
  process.exit(1)
}

console.log(JSON.stringify({ updated: true, bcryptSelfCheck: true }, null, 2))
