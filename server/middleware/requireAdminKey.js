export const requireAdminKey = (req, res, next) => {
  const key = req.headers['x-admin-key']
  if (!key || key !== process.env.ADMIN_ACCESS_KEY) {
    return res.status(401).json({ error: 'Not authorized.' })
  }
  next()
}
