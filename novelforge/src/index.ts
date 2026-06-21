import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { config } from './config.js'
import { apiRouter } from './api/index.js'
import { initProviderManager } from './core/provider-manager.js'
import { logger } from './logger.js'
import path from 'node:path'
import * as fs from 'node:fs'

// ==================== Startup Check ====================

const SETUP_NEEDED = !config.jwtSecret || config.jwtSecret === 'novelforge-dev-secret-change-in-production'

if (SETUP_NEEDED) {
  logger.warn('============================================')
  logger.warn('  [Setup Mode] JWT Secret not configured.')
  logger.warn('  Open http://localhost:3000/setup to configure.')
  logger.warn('  The setup wizard will guide you through configuration.')
  logger.warn('============================================')
}

// ==================== Initialise Provider Manager ====================

const dataDir = path.dirname(config.dbPath)
const providerManager = initProviderManager(dataDir)
providerManager.initialize().then(() => {
  logger.info('[Startup] ProviderManager initialised')
}).catch(err => {
  logger.error('[Startup] ProviderManager init failed: %s', err)
})

const app = new Hono()

// ==================== CORS ====================
app.use('*', cors({
  origin: config.corsOrigins || ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// Logging
app.use('*', honoLogger())

// ==================== Routes ====================

// Health check (always public — minimal info only, no deployment details)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '1.0.0',
    setupNeeded: SETUP_NEEDED,
  })
})

// API routes
app.route('/api', apiRouter)

// ==================== Production Static File Serving ====================
// In production, serve the built frontend from studio/dist/
const frontendDistPath = path.resolve(process.cwd(), 'studio', 'dist')
const hasFrontendBuild = fs.existsSync(path.join(frontendDistPath, 'index.html'))

if (hasFrontendBuild) {
  logger.info('[Startup] Serving frontend from %s', frontendDistPath)

  // Serve static assets (JS, CSS, images, etc.)
  app.use('/assets/*', serveStatic({ root: frontendDistPath }))

  // Serve index.html for all non-API routes (SPA fallback)
  app.get('/*', serveStatic({
    root: frontendDistPath,
    path: 'index.html',
  }))
}

// ==================== Start Server ====================

const port = config.port
logger.info(`NovelForge server starting on port ${port}`)

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  logger.info(`============================================`)
  logger.info(`  NovelForge v3.5`)
  logger.info(`  Server: http://localhost:${info.port}`)
  if (SETUP_NEEDED) {
    logger.info(`  Setup:  http://localhost:3000/setup`)
  }
  logger.info(`  Health: http://localhost:${info.port}/health`)
  logger.info(`============================================`)
})
