// Test helper for verify scripts: a fresh throwaway password for each use, so no password literal sits in the repo.
// 8+ chars and under 72 bytes, so it passes the sign-up password rules (passwordField in schemas/merchant.schema.js).
import { randomBytes } from 'node:crypto'

export const freshPassword = () => `Pw-${randomBytes(12).toString('hex')}`
