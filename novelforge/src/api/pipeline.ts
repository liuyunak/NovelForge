import { Hono } from 'hono'
import { z } from 'zod'
import * as fs from 'fs'
import { DAGScheduler } from '../core/dag-scheduler.js'
import { FullTextMemory } from '../memory/full-text-memory.js'
import { StateManager } from '../state/manager.js'
import { ModelRouter } from '../router.js'
import { logger } from '../logger.js'
import { checkOwnership, validateId } from '../utils/security.js'

const pipelineRouter = new Hono()

function getWorkspacePath(id: string): string {
  return `${process.cwd()}/workspace/${id}`
}

const writeSchema = z.object({
  chapter: z.number().int().min(1).optional().default(1),
  mode: z.string().optional(),
  intensity: z.number().int().min(0).max(100).optional(),
  length: z.number().int().min(500).max(50000).optional(),
})

const auditSchema = z.object({
  chapterText: z.string().min(1),
  chapterNumber: z.number().int().min(1),
})

const approveSchema = z.object({
  nodeId: z.enum(['approval1', 'approval2']),
})

// In-memory scheduler store keyed by workspace ID
// Uses TTL + LRU eviction to prevent memory leaks from abandoned workspaces
interface SchedulerEntry {
  scheduler: DAGScheduler
  lastAccessed: number
}

const schedulerStore = new Map<string, SchedulerEntry>()
const SCHEDULER_MAX_ENTRIES = 100
const SCHEDULER_TTL_MS = 30 * 60 * 1000 // 30 minutes idle TTL

// Per-workspace creation locks to prevent concurrent duplicate scheduler creation
const creationLocks = new Map<string, Promise<DAGScheduler>>()

function evictExpiredSchedulers(): void {
  const now = Date.now()
  for (const [id, entry] of schedulerStore) {
    if (now - entry.lastAccessed > SCHEDULER_TTL_MS) {
      schedulerStore.delete(id)
      logger.debug({ workspaceId: id }, 'Evicted expired scheduler')
    }
  }
}

function evictLRU(): void {
  // Find and remove the least recently used entry
  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [id, entry] of schedulerStore) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed
      oldestKey = id
    }
  }
  if (oldestKey) {
    schedulerStore.delete(oldestKey)
    logger.debug({ workspaceId: oldestKey }, 'Evicted LRU scheduler')
  }
}

/**
 * Get or create a scheduler with concurrent-creation protection.
 * Two concurrent requests for the same workspace will share the same
 * creation promise, preventing duplicate scheduler instantiation.
 */
async function getOrCreateScheduler(id: string, workspacePath: string): Promise<DAGScheduler> {
  const existing = schedulerStore.get(id)
  if (existing) {
    existing.lastAccessed = Date.now()
    return existing.scheduler
  }
  
  // Check if a creation is already in-flight for this workspace
  const inFlight = creationLocks.get(id)
  if (inFlight) {
    logger.debug({ workspaceId: id }, 'Waiting for in-flight scheduler creation')
    return inFlight
  }
  
  // Create a lock promise that other concurrent callers can await
  const creationPromise = (async () => {
    // Double-check after acquiring the lock (another caller may have completed)
    const recheck = schedulerStore.get(id)
    if (recheck) {
      recheck.lastAccessed = Date.now()
      return recheck.scheduler
    }
    
    // Evict expired entries before adding new ones
    evictExpiredSchedulers()
    
    // If still at capacity, evict LRU
    if (schedulerStore.size >= SCHEDULER_MAX_ENTRIES) {
      evictLRU()
    }
    
    const router = new ModelRouter()
    const stateManager = new StateManager(workspacePath)
    const fullTextMemory = new FullTextMemory(workspacePath, router)
    
    const scheduler = new DAGScheduler(workspacePath, fullTextMemory, stateManager)
    schedulerStore.set(id, { scheduler, lastAccessed: Date.now() })
    
    return scheduler
  })()
  
  creationLocks.set(id, creationPromise)
  
  try {
    return await creationPromise
  } finally {
    creationLocks.delete(id)
  }
}

/**
 * Remove a scheduler from the store (e.g. when workspace is deleted).
 */
function removeScheduler(id: string): void {
  schedulerStore.delete(id)
}

// POST /:id/pipeline/write — Execute full DAG pipeline for a chapter
pipelineRouter.post('/:id/pipeline/write', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = getWorkspacePath(id)
  
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const body = await c.req.json().catch(() => ({}))
  const bodyValidation = writeSchema.safeParse(body)
  if (!bodyValidation.success) {
    return c.json({ error: 'Invalid request body', details: bodyValidation.error.issues }, 400)
  }
  const { chapter: chapterNumber, mode, intensity, length } = bodyValidation.data
  
  try {
    const scheduler = await getOrCreateScheduler(id, workspacePath)
    
    // Initialize the scheduler's own state & memory (not new instances)
    await scheduler.initialize()
    
    // Set writing options that will be used by the writer agent
    scheduler.setWriteOptions({ mode, intensity, length })
    
    const result = await scheduler.execute(chapterNumber)
    
    return c.json(result)
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Pipeline error')
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      chapterNumber 
    }, 500)
  }
})

// POST /:id/pipeline/approve — Approve a DAG approval node
pipelineRouter.post('/:id/pipeline/approve', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const body = await c.req.json().catch(() => ({}))
  const bodyValidation = approveSchema.safeParse(body)
  if (!bodyValidation.success) {
    return c.json({ error: 'Invalid request body', details: bodyValidation.error.issues }, 400)
  }
  const { nodeId } = bodyValidation.data
  
  const entry = schedulerStore.get(id)
  if (!entry) {
    return c.json({ error: 'No active pipeline. Start a write pipeline first.' }, 404)
  }
  
  try {
    entry.lastAccessed = Date.now()
    if (nodeId === 'approval1') {
      entry.scheduler.approveOutline()
    } else {
      entry.scheduler.approveFinal()
    }
    
    // After approval, resume from the approval point without resetting
    const result = await entry.scheduler.resumeAfterApproval(0)
    
    return c.json({ approved: nodeId, result })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Approve error')
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// POST /:id/pipeline/audit — Standalone audit (fast + deep)
pipelineRouter.post('/:id/pipeline/audit', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = getWorkspacePath(id)
  
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const body = await c.req.json().catch(() => ({}))
  const bodyValidation = auditSchema.safeParse(body)
  if (!bodyValidation.success) {
    return c.json({ error: 'Invalid request body', details: bodyValidation.error.issues }, 400)
  }
  const { chapterText, chapterNumber } = bodyValidation.data
  
  try {
    const { FastAuditAgent } = await import('../agents/fast-audit.js')
    const { DeepAuditAgent } = await import('../agents/deep-audit.js')
    const { ModelRouter } = await import('../router.js')
    const { StateManager } = await import('../state/manager.js')
    
    const stateManager = new StateManager(workspacePath)
    await stateManager.initialize()
    const router = new ModelRouter()
    
    const fastAudit = new FastAuditAgent(stateManager)
    const deepAudit = new DeepAuditAgent(router, stateManager)
    
    const fastResult = await fastAudit.audit(chapterText, chapterNumber)
    const deepResult = await deepAudit.audit(chapterText, chapterNumber)
    
    return c.json({ fastAudit: fastResult, deepAudit: deepResult })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Audit error')
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// GET /:id/pipeline/status — Get current pipeline status
pipelineRouter.get('/:id/pipeline/status', (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const entry = schedulerStore.get(id)
  if (!entry) {
    return c.json({ status: 'no_active_pipeline' })
  }
  
  return c.json({ status: 'active', workspaceId: id })
})

// GET /:id/pipeline/stream — SSE streaming for pipeline execution
pipelineRouter.get('/:id/pipeline/stream', async (c) => {
  const id = c.req.param('id')
  const chapter = Number(c.req.query('chapter') || '1')
  const mode = c.req.query('mode') || undefined
  const intensity = c.req.query('intensity') ? Number(c.req.query('intensity')) : undefined
  const length = c.req.query('length') ? Number(c.req.query('length')) : undefined
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = getWorkspacePath(id)
  
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const scheduler = await getOrCreateScheduler(id, workspacePath)
  await scheduler.initialize()
  
  // Set writing options from query params
  scheduler.setWriteOptions({ mode, intensity, length })
  
  // Build SSE stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      
      const sendEvent = (event: string, data: any) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }
      
      scheduler.setProgressCallback((nodeId, status, result) => {
        sendEvent('progress', { nodeId, status, result })
        
        if (status === 'waiting_approval') {
          sendEvent('approval_required', { nodeId, message: 'Human approval required' })
        }
      })
      
      scheduler.execute(chapter).then((result) => {
        sendEvent('complete', result)
        controller.close()
      }).catch((error) => {
        sendEvent('error', { error: error instanceof Error ? error.message : 'Unknown error' })
        controller.close()
      })
    }
  })
  
  return c.newResponse(stream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
})

export { pipelineRouter }
