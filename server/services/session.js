import jwt from 'jsonwebtoken'

export const sessionCookieOptions = (isProd) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
})

export const issueSession = (res, merchantId, tokenVersion) => {
  // tv ties the session to merchants.token_version: a password reset bumps it and ends every older session.
  const token = jwt.sign({ merchant_id: merchantId, tv: tokenVersion }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
  })

  res.cookie(process.env.SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(process.env.NODE_ENV === 'production'),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export const clearSession = (res) =>
  res.clearCookie(process.env.SESSION_COOKIE_NAME, sessionCookieOptions(process.env.NODE_ENV === 'production'))

// Invalidates every session issued so far by bumping merchants.token_version, and returns the new version. It takes
// the query runner (a transaction client, or the pool) and never touches `res`: inside a transaction the bump commits
// with the change that caused it, and the caller issues this device's cookie with issueSession ONLY after COMMIT.
export const bumpTokenVersion = async (db, merchantId) => {
  const { rows } = await db.query(
    'UPDATE merchants SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
    [merchantId],
  )
  if (rows.length === 0) throw new Error('bumpTokenVersion: merchant not found.')
  return rows[0].token_version
}
