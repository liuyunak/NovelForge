import { Hono } from 'hono'
import { authMiddleware, jwtErrorHandler } from '../middleware/auth.js'
import { authApiRouter } from './auth.js'
import { setupRouter } from './setup.js'
import { workspaceRouter } from './workspace.js'
import { pipelineRouter } from './pipeline.js'
import { fineTuneRouter } from './finetune.js'
import { configRouter } from './config.js'
import { dpoRouter } from './dpo.js'

export const apiRouter = new Hono()

// ==================== Public Routes (no auth required) ====================

// Health check
apiRouter.get('/health', (c) => {
  return c.json({ status: 'ok', api: 'v1' })
})

// Setup wizard routes (first-run configuration, no auth needed)
apiRouter.route('/setup', setupRouter)

// Auth routes (register, login)
apiRouter.route('/auth', authApiRouter)

// ==================== Fine-tune Routes (protected, high resource cost) ====================
apiRouter.use('/finetune/*', authMiddleware)
apiRouter.use('/finetune/*', (c, next) => {
  return next().catch((err: Error) => jwtErrorHandler(err, c))
})
apiRouter.route('/finetune', fineTuneRouter)

// ==================== Config Routes (protected) ====================
apiRouter.use('/config/*', authMiddleware)
apiRouter.use('/config/*', (c, next) => {
  return next().catch((err: Error) => jwtErrorHandler(err, c))
})
apiRouter.route('/config', configRouter)

// ==================== DPO Routes (protected) ====================
apiRouter.use('/dpo/*', authMiddleware)
apiRouter.use('/dpo/*', (c, next) => {
  return next().catch((err: Error) => jwtErrorHandler(err, c))
})
apiRouter.route('/dpo', dpoRouter)

// ==================== Protected Routes (JWT required) ====================

// Apply JWT middleware to all routes below
apiRouter.use('/workspace/*', authMiddleware)
apiRouter.use('/workspace/*', (c, next) => {
  // JWT error handler wrapper
  return next().catch((err: Error) => jwtErrorHandler(err, c))
})

// Workspace CRUD + export (protected)
apiRouter.route('/workspace', workspaceRouter)

// Pipeline routes (protected, reuse workspace prefix)
apiRouter.route('/workspace', pipelineRouter)
