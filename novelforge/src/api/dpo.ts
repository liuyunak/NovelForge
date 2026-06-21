/**
 * DPO (Direct Preference Optimization) API Routes
 * 
 * Exposes the DPO data collection, export, and management functionality
 * for learning from user edits and preferences.
 */
import { Hono } from 'hono'
import * as fs from 'fs'
import * as path from 'path'
import { DPODataCollector } from '../learning/dpo-collector.js'
import { logger } from '../logger.js'
import { checkOwnership, validateId } from '../utils/security.js'

export const dpoRouter = new Hono()

/**
 * Create a DPO collector instance for a workspace.
 */
function getCollector(workspaceId: string): DPODataCollector | null {
  const workspacePath = path.join(process.cwd(), 'workspace', workspaceId)
  if (!fs.existsSync(workspacePath)) return null
  return new DPODataCollector(workspacePath)
}

/**
 * GET /stats — get DPO statistics for a workspace
 */
dpoRouter.get('/:workspaceId/stats', (c) => {
  const workspaceId = c.req.param('workspaceId')
  if (!validateId(workspaceId)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, workspaceId)
  if (ownershipError) return ownershipError
  const collector = getCollector(workspaceId)
  if (!collector) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const stats = collector.getStats()
    return c.json(stats)
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to get DPO stats')
    return c.json({ error: 'Failed to get stats' }, 500)
  }
})

/**
 * GET /samples — list all DPO samples for a workspace
 * Query params: chapter (filter by chapter), limit, offset
 */
dpoRouter.get('/:workspaceId/samples', (c) => {
  const workspaceId = c.req.param('workspaceId')
  if (!validateId(workspaceId)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, workspaceId)
  if (ownershipError) return ownershipError
  const collector = getCollector(workspaceId)
  if (!collector) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const chapter = c.req.query('chapter') ? parseInt(c.req.query('chapter')!) : undefined
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0

    let samples = collector.getSamplesForTraining()

    if (chapter && !isNaN(chapter)) {
      samples = samples.filter(s => s.chapter === chapter)
    }

    const total = samples.length
    const paginated = samples.slice(offset, offset + limit)

    return c.json({ samples: paginated, total, limit, offset })
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to list DPO samples')
    return c.json({ error: 'Failed to list samples' }, 500)
  }
})

/**
 * POST /collect — collect a new DPO sample from a user edit
 * Body: { prompt, originalText, editedText, chapter }
 */
dpoRouter.post('/:workspaceId/collect', async (c) => {
  const workspaceId = c.req.param('workspaceId')
  if (!validateId(workspaceId)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, workspaceId)
  if (ownershipError) return ownershipError
  const collector = getCollector(workspaceId)
  if (!collector) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const body = await c.req.json().catch(() => ({}))
    const { prompt, originalText, editedText, chapter } = body as {
      prompt?: string
      originalText?: string
      editedText?: string
      chapter?: number
    }

    if (!prompt) return c.json({ error: 'prompt is required' }, 400)
    if (!originalText) return c.json({ error: 'originalText is required' }, 400)
    if (!editedText) return c.json({ error: 'editedText is required' }, 400)
    if (chapter === undefined || chapter === null) return c.json({ error: 'chapter is required' }, 400)

    await collector.collectSample(prompt, originalText, editedText, chapter)

    const stats = collector.getStats()
    return c.json({ success: true, totalSamples: stats.totalSamples }, 201)
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to collect DPO sample')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

/**
 * POST /export — export DPO training data to a file
 * Body: { outputPath? }
 */
dpoRouter.post('/:workspaceId/export', async (c) => {
  const workspaceId = c.req.param('workspaceId')
  if (!validateId(workspaceId)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, workspaceId)
  if (ownershipError) return ownershipError
  const collector = getCollector(workspaceId)
  if (!collector) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const body = await c.req.json().catch(() => ({}))
    const outputPath = (body as { outputPath?: string }).outputPath ||
      path.join(process.cwd(), 'data', 'training', `dpo_${workspaceId}_export.json`)

    // Ensure output directory exists
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const count = await collector.exportForTraining(outputPath)
    return c.json({ success: true, exportedSamples: count, outputPath })
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to export DPO data')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

/**
 * POST /import — batch import DPO samples
 * Body: { samples: DPOSample[] }
 */
dpoRouter.post('/:workspaceId/import', async (c) => {
  const workspaceId = c.req.param('workspaceId')
  if (!validateId(workspaceId)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, workspaceId)
  if (ownershipError) return ownershipError
  const collector = getCollector(workspaceId)
  if (!collector) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const body = await c.req.json().catch(() => ({}))
    const { samples } = body as { samples?: any[] }

    if (!samples || !Array.isArray(samples)) {
      return c.json({ error: 'samples array is required' }, 400)
    }

    const imported = await collector.batchImport(samples)
    const stats = collector.getStats()
    return c.json({ success: true, imported, totalSamples: stats.totalSamples })
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to import DPO samples')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

/**
 * DELETE /clear — clear all DPO samples for a workspace
 */
dpoRouter.delete('/:workspaceId/clear', async (c) => {
  const workspaceId = c.req.param('workspaceId')
  if (!validateId(workspaceId)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, workspaceId)
  if (ownershipError) return ownershipError
  const collector = getCollector(workspaceId)
  if (!collector) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const cleared = await collector.clearAll()
    return c.json({ success: true, clearedSamples: cleared })
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to clear DPO samples')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

/**
 * DELETE /cleanup — remove old DPO samples based on age
 * Query: maxAge (days, default 30)
 */
dpoRouter.delete('/:workspaceId/cleanup', async (c) => {
  const workspaceId = c.req.param('workspaceId')
  if (!validateId(workspaceId)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, workspaceId)
  if (ownershipError) return ownershipError
  const collector = getCollector(workspaceId)
  if (!collector) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const maxAge = c.req.query('maxAge') ? parseInt(c.req.query('maxAge')!) * 24 * 60 * 60 * 1000 : undefined
    const removed = await collector.clearOldSamples(maxAge)
    const stats = collector.getStats()
    return c.json({ success: true, removedSamples: removed, remainingSamples: stats.totalSamples })
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to cleanup DPO samples')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
