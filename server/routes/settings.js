import { Router } from 'express'
import { pool } from '../db/database.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import { settingsPatchSchema } from '../schemas/settings.schema.js'

const router = Router()
const MONTHLY_REVENUE_TARGET_KEY = 'monthly_revenue_target'

router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM merchant_settings WHERE merchant_id = $1', [
      req.merchantId,
    ])
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]))
    res.status(200).json(settings)
  } catch (err) {
    next(err)
  }
})

router.patch('/', validate(settingsPatchSchema), async (req, res, next) => {
  try {
    const { monthly_revenue_target } = req.body
    await pool.query(
      `INSERT INTO merchant_settings (merchant_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [req.merchantId, MONTHLY_REVENUE_TARGET_KEY, String(monthly_revenue_target)],
    )
    res.status(200).json({ [MONTHLY_REVENUE_TARGET_KEY]: String(monthly_revenue_target) })
  } catch (err) {
    next(err)
  }
})

export default router
