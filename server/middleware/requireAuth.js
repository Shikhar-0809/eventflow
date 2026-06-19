import jwt from 'jsonwebtoken'

export const requireAuth = (req, res, next) => {
  const token = req.cookies[process.env.SESSION_COOKIE_NAME]

  if (!token) {
    return res.status(401).json({ error: 'You must be logged in to do that.' })
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' })
  }
}
