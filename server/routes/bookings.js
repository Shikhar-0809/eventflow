import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

router.use(requireAuth)

export default router
