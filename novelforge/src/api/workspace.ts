import { Hono } from 'hono'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import { StateManager } from '../state/manager.js'
import { FullTextMemory } from '../memory/full-text-memory.js'
import { DreamEngine } from '../memory/dream-engine.js'
import { MemoryLifecycle } from '../memory/lifecycle.js'
import { MemoryRetriever } from '../memory/retriever.js'
import { ModelRouter } from '../router.js'
import { logger } from '../logger.js'
import { getCurrentUserId } from '../middleware/auth.js'
import { checkOwnership, validateId } from '../utils/security.js'

const workspaceRouter = new Hono()

/** Map internal MemoryEntry category to frontend MemorySystemPanel type */
function mapCategoryToMemoryType(category: string): 'fact' | 'event' | 'relationship' | 'plot_point' | 'character_state' {
  const mapping: Record<string, 'fact' | 'event' | 'relationship' | 'plot_point' | 'character_state'> = {
    character: 'character_state',
    world: 'fact',
    plot: 'plot_point',
    style: 'fact',
    lesson: 'event',
  }
  return mapping[category] || 'fact'
}

const createWorkspaceSchema = z.object({
  title: z.string().min(1).max(200),
  genre: z.string().max(100).optional().default(''),
  corePremise: z.string().max(5000).optional().default(''),
})

workspaceRouter.get('/', async (c) => {
  const workspacePath = path.join(process.cwd(), 'workspace')
  if (!fs.existsSync(workspacePath)) {
    return c.json({ workspaces: [] })
  }
  
  const dirs = fs.readdirSync(workspacePath).filter(d => {
    const stat = fs.statSync(path.join(workspacePath, d))
    return stat.isDirectory() && d.startsWith('novel_')
  })
  
  const workspaces = dirs.map(dir => {
    const settingPath = path.join(workspacePath, dir, 'MASTER_SETTING.json')
    let title = dir
    let genre = ''
    
    if (fs.existsSync(settingPath)) {
      try {
        const setting = JSON.parse(fs.readFileSync(settingPath, 'utf-8'))
        title = setting.title || dir
        genre = setting.genre || ''
      } catch {}
    }
    
    return { id: dir, title, genre }
  })
  
  return c.json({ workspaces })
})

workspaceRouter.post('/', async (c) => {
  const body = await c.req.json()
  const validation = createWorkspaceSchema.safeParse(body)
  if (!validation.success) {
    return c.json({ error: 'Invalid request body', details: validation.error.issues }, 400)
  }
  const { title, genre, corePremise } = validation.data
  
  const ownerUserId = getCurrentUserId(c) || 'legacy'
  
  const workspaceId = `novel_${Date.now()}`
  const workspacePath = path.join(process.cwd(), 'workspace', workspaceId)
  fs.mkdirSync(workspacePath, { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'state'), { recursive: true })
  
  const stateManager = new StateManager(workspacePath)
  await stateManager.initialize()
  
  const schemas = await import('../state/schemas/index.js')
  
  const masterSetting = schemas.createDefaultMasterSetting({
    work_id: workspaceId,
    title,
    genre,
    core_premise: corePremise,
  })
  await stateManager.write('MASTER_SETTING', masterSetting)
  
  await stateManager.write('working_memory', schemas.createDefaultWorkingMemory(0))
  await stateManager.write('current_state', schemas.createDefaultCurrentState())
  await stateManager.write('characters', { characters: [], last_updated: new Date().toISOString() })
  await stateManager.write('plot_threads', schemas.createDefaultPlotThreads())
  await stateManager.write('particle_ledger', schemas.createDefaultParticleLedger())
  await stateManager.write('chapter_summaries', { summaries: [], last_updated: new Date().toISOString() })
  await stateManager.write('rhythm_map', { chapters: [], overall_metrics: { avg_hook_strength: 0.5, avg_cool_point_density: 0, total_payoffs: 0, debt_trend: 'stable' }, last_updated: new Date().toISOString() })
  await stateManager.write('power_system', schemas.createDefaultPowerSystem())
  await stateManager.write('learned_rules', { rules: [], last_updated: new Date().toISOString() })
  await stateManager.write('ai_fingerprint_blacklist', schemas.createDefaultAIFingerprintBlacklist())
  const bookConfig = schemas.createDefaultBookConfig()
  bookConfig.ownerUserId = ownerUserId
  await stateManager.write('book_config', bookConfig)
  await stateManager.write('style_fingerprint', schemas.createDefaultStyleFingerprint())
  await stateManager.write('volumes', { volumes: [{ id: 'v1', title: '卷一', chapters: [] }], last_updated: new Date().toISOString() })
  
  return c.json({ id: workspaceId, path: workspacePath })
})

workspaceRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const stateManager = new StateManager(workspacePath)
  const masterSetting = await stateManager.read('MASTER_SETTING')
  
  return c.json({ id, ...masterSetting })
})

workspaceRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  fs.rmSync(workspacePath, { recursive: true, force: true })
  
  return c.json({ success: true })
})

workspaceRouter.post('/:id/chapter', async (c) => {
  const id = c.req.param('id')
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const body = await c.req.json()
  const { number, title, content } = body
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  const chaptersDir = path.join(workspacePath, 'chapters')
  
  if (!fs.existsSync(chaptersDir)) {
    fs.mkdirSync(chaptersDir, { recursive: true })
  }
  
  const chapterFile = path.join(chaptersDir, `chapter_${String(number).padStart(3, '0')}.md`)
  fs.writeFileSync(chapterFile, `# ${title}\n\n${content}`)
  
  return c.json({ success: true })
})

workspaceRouter.get('/:id/chapters', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  const chaptersDir = path.join(workspacePath, 'chapters')
  
  if (!fs.existsSync(chaptersDir)) {
    return c.json({ chapters: [] })
  }
  
  const files = fs.readdirSync(chaptersDir).filter(f => f.endsWith('.md')).sort()
  const chapters = files.map(f => {
    const content = fs.readFileSync(path.join(chaptersDir, f), 'utf-8')
    const match = f.match(/chapter_(\d+)\.md/)
    return {
      number: match ? parseInt(match[1]) : 0,
      title: content.split('\n')[0].replace(/^#\s*/, ''),
      content: content
    }
  })
  
  return c.json({ chapters })
})

// ==================== Volume Management ====================

interface VolumeData {
  id: string
  title: string
  chapters: number[]  // chapter numbers in this volume
}

workspaceRouter.get('/:id/volumes', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) return c.json({ error: 'Workspace not found' }, 404)
  try {
    const stateManager = new StateManager(workspacePath)
    const volumes = await stateManager.read('volumes')
    return c.json({ volumes: volumes.volumes })
  } catch {
    return c.json({ volumes: [] })
  }
})

workspaceRouter.post('/:id/volumes', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  const body = await c.req.json().catch(() => ({}))
  const { volumes } = body as { volumes: VolumeData[] }
  if (!volumes || !Array.isArray(volumes)) return c.json({ error: 'volumes array required' }, 400)
  try {
    const stateManager = new StateManager(workspacePath)
    await stateManager.write('volumes', { volumes, last_updated: new Date().toISOString() })
    return c.json({ success: true, volumes })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Character Management ====================

workspaceRouter.get('/:id/characters', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  try {
    const stateManager = new StateManager(workspacePath)
    const characters = await stateManager.read('characters')
    return c.json({ characters: characters.characters })
  } catch {
    return c.json({ characters: [] })
  }
})

workspaceRouter.post('/:id/characters', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const body = await c.req.json().catch(() => ({}))
  const { name, role, items, power, location, mood, status } = body
  
  if (!name) {
    return c.json({ error: 'Character name is required' }, 400)
  }
  
  try {
    const stateManager = new StateManager(workspacePath)
    const current = await stateManager.read('characters')
    const chars = current.characters
    
    const existingIdx = chars.findIndex((c) => c.name === name)
    // NOTE: this endpoint stores a lightweight character record (a subset of
    // the full Character schema). StateManager persists JSON loosely, so we
    // cast to the registry type rather than fabricating the full structure.
    const newChar = { name, role: role || '配角', items: items || [], power, location, mood, status } as unknown as typeof chars[number]
    
    if (existingIdx >= 0) {
      chars[existingIdx] = newChar
    } else {
      chars.push(newChar)
    }
    
    await stateManager.write('characters', { characters: chars, last_updated: new Date().toISOString() })
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Style Management ====================

workspaceRouter.get('/:id/style', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  try {
    const stateManager = new StateManager(workspacePath)
    const fingerprint = await stateManager.read('style_fingerprint')
    return c.json(fingerprint)
  } catch {
    return c.json({})
  }
})

workspaceRouter.post('/:id/style/extract', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const body = await c.req.json().catch(() => ({}))
  const { sampleText } = body
  
  if (!sampleText || sampleText.length < 100) {
    return c.json({ error: 'Sample text too short (min 100 chars)' }, 400)
  }
  
  try {
    const { StyleEngine } = await import('../style/engine.js')
    
    const stateManager = new StateManager(workspacePath)
    const styleEngine = new StyleEngine(stateManager)
    
    const fingerprint = await styleEngine.analyze(sampleText)
    
    // Infer type from schema
    interface StyleFingerprintData {
      sentence_pattern?: unknown
      dialogue_style?: unknown
      pacing?: unknown
      rhetoric?: unknown
      metadata?: { source_chapters?: number; extraction_date?: string; confidence?: number }
    }
    const data: StyleFingerprintData = {
      ...fingerprint,
      metadata: {
        source_chapters: 1,
        extraction_date: new Date().toISOString(),
        confidence: 0.8,
      },
    }
    await stateManager.write('style_fingerprint', data as never)
    
    return c.json(fingerprint)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== LLM Style Extraction ====================

workspaceRouter.post('/:id/style/extract-llm', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { sampleTexts } = body

  if (!sampleTexts || !Array.isArray(sampleTexts) || sampleTexts.length === 0) {
    return c.json({ error: 'sampleTexts array required (min 1 text, each >100 chars)' }, 400)
  }

  try {
    const { StyleExtractorAgent } = await import('../agents/style-extractor.js')
    const { ModelRouter } = await import('../router.js')

    const stateManager = new StateManager(workspacePath)
    const router = new ModelRouter()
    const extractor = new StyleExtractorAgent(router, stateManager)

    const fingerprint = await extractor.extract(sampleTexts)

    return c.json(fingerprint)
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'LLM style extraction error')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Rhythm Analysis ====================

workspaceRouter.get('/:id/rhythm', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const { RhythmSystem } = await import('../style/rhythm.js')
    const stateManager = new StateManager(workspacePath)
    const rhythm = new RhythmSystem(stateManager)
    const analysis = await rhythm.getAnalysis()
    return c.json(analysis)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

workspaceRouter.post('/:id/rhythm/analyze', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { chapterNumber, chapterText } = body

  if (!chapterText || chapterText.length < 100) {
    return c.json({ error: 'chapterText required (min 100 chars)' }, 400)
  }

  try {
    const { RhythmSystem } = await import('../style/rhythm.js')
    const stateManager = new StateManager(workspacePath)
    const rhythm = new RhythmSystem(stateManager)
    const result = await rhythm.analyzeChapter(chapterNumber || 1, chapterText)
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Writing Rules (RuleEngine) ====================

workspaceRouter.get('/:id/rules', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const genre = c.req.query('genre') || ''

  try {
    const { RuleEngine } = await import('../style/rule-engine.js')
    const stateManager = new StateManager(workspacePath)
    const ruleEngine = new RuleEngine(stateManager)
    const rules = ruleEngine.getActiveRules(genre || '玄幻')
    const stats = ruleEngine.getRuleStats()
    return c.json({ rules, stats })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

workspaceRouter.post('/:id/rules/feedback', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { ruleId, action } = body

  if (!ruleId || !['override', 'apply', 'audit_pass', 'audit_fail'].includes(action)) {
    return c.json({ error: 'ruleId and action (override/apply/audit_pass/audit_fail) required' }, 400)
  }

  try {
    const { RuleEngine } = await import('../style/rule-engine.js')
    const stateManager = new StateManager(workspacePath)
    const ruleEngine = new RuleEngine(stateManager)

    switch (action) {
      case 'override': ruleEngine.onAuthorOverride(ruleId); break
      case 'apply': ruleEngine.onAuthorApply(ruleId); break
      case 'audit_pass': ruleEngine.onAuditFeedback(ruleId, true); break
      case 'audit_fail': ruleEngine.onAuditFeedback(ruleId, false); break
    }

    return c.json({ success: true, action })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

workspaceRouter.post('/:id/rules/calibrate', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { genre, referenceStats } = body

  if (!genre || !referenceStats) {
    return c.json({ error: 'genre and referenceStats required' }, 400)
  }

  try {
    const { RuleEngine } = await import('../style/rule-engine.js')
    const stateManager = new StateManager(workspacePath)
    const ruleEngine = new RuleEngine(stateManager)
    await ruleEngine.calibrateToGenre(genre, referenceStats)
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Style Deviation Detection ====================

workspaceRouter.post('/:id/style/deviations', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { chapterText } = body

  if (!chapterText || chapterText.length < 100) {
    return c.json({ error: 'chapterText required (min 100 chars)' }, 400)
  }

  try {
    const { StyleEngine } = await import('../style/engine.js')
    const stateManager = new StateManager(workspacePath)
    const styleEngine = new StyleEngine(stateManager)
    const deviations = await styleEngine.detectDeviations(chapterText)
    return c.json({ deviations })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Dream Integration (/dream) ====================

// Helper: get or create DreamEngine for a workspace
function getDreamEngine(workspacePath: string): { dreamEngine: DreamEngine; fullTextMemory: FullTextMemory } {
  const router = new ModelRouter()
  const stateManager = new StateManager(workspacePath)
  const fullTextMemory = new FullTextMemory(workspacePath, router)
  const dreamEngine = new DreamEngine(fullTextMemory, stateManager, router)
  return { dreamEngine, fullTextMemory }
}

// POST /:id/dream/trigger — Manually trigger /dream for the workspace
workspaceRouter.post('/:id/dream/trigger', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { chapterNumber } = body

  try {
    const { dreamEngine, fullTextMemory } = getDreamEngine(workspacePath)
    await fullTextMemory.initialize()

    const currentChapter = chapterNumber || fullTextMemory.getLastChapterNumber()
    if (currentChapter <= 0) {
      return c.json({ error: 'No chapters available. Write at least one chapter first.' }, 400)
    }

    // Persist dream log to SQLite
    const dbPath = path.join(workspacePath, 'data', 'novelforge.db')
    const retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    const result = await dreamEngine.executeDream(currentChapter)

    // Persist dream log to dream_logs table
    try {
      retriever.persistDreamLog(currentChapter, currentChapter - 9, currentChapter, result.summary)
    } catch {
      // dream_logs table persistence is best-effort
    }

    return c.json(result)
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Dream trigger error')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// GET /:id/dream/history — Get dream execution history
workspaceRouter.get('/:id/dream/history', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const dbPath = path.join(workspacePath, 'data', 'novelforge.db')
    const retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    const logs = retriever.getDreamLogs()
    return c.json({ logs })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// GET /:id/dream/summary — Get current dream summary from working memory
workspaceRouter.get('/:id/dream/summary', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    await stateManager.initialize()
    const workingMemory = await stateManager.read('working_memory')

    return c.json({
      dream_summary: workingMemory.dream_summary || null,
      updated_at: workingMemory.updated_at || null,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// GET /:id/dream/last — Get last dream result
workspaceRouter.get('/:id/dream/last', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const dbPath = path.join(workspacePath, 'data', 'novelforge.db')
    const retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    const logs = retriever.getDreamLogs()
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null
    return c.json({ lastDream: lastLog })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Memory Management API ====================

// GET /:id/memory — Get all active memories with stats (for MemorySystemPanel)
workspaceRouter.get('/:id/memory', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const search = c.req.query('search') || ''
  const category = c.req.query('category') || ''
  const limit = Number(c.req.query('limit') || '50')

  try {
    const dbPath = path.join(workspacePath, 'data', 'novelforge.db')
    const retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    let memories
    if (search) {
      // Use hybrid search when query is provided
      try {
        const hasEmb = await retriever.hasEmbeddings()
        if (hasEmb) {
          memories = await retriever.hybridSearch(search, {
            limit,
            category: category || undefined,
          })
        } else {
          memories = await retriever.searchByContent(search, limit)
        }
      } catch {
        memories = await retriever.searchByContent(search, limit)
      }
    } else if (category) {
      memories = await retriever.retrieveByCategory(category, limit)
    } else {
      memories = await retriever.getAllActive(limit)
    }

    // Build stats
    const stats = await retriever.getMemoryStats()

    // Map to frontend MemoryItem format
    const mappedMemories = memories.map(m => ({
      id: m.id,
      type: mapCategoryToMemoryType(m.category),
      content: m.content,
      sourceChapter: m.source_chapter,
      confidence: m.importance,
      timestamp: new Date().toISOString(),
    }))

    const byType: Record<string, number> = {}
    for (const m of mappedMemories) {
      byType[m.type] = (byType[m.type] || 0) + 1
    }

    return c.json({ memories: mappedMemories, stats: { total: stats.total, byType } })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Memory fetch error')
    return c.json({ memories: [], stats: { total: 0, byType: {} } })
  }
})

// GET /:id/memory/stats — Get memory statistics
workspaceRouter.get('/:id/memory/stats', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const dbPath = path.join(workspacePath, 'data', 'novelforge.db')
    const retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    const stats = await retriever.getMemoryStats()
    return c.json(stats)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// POST /:id/memory/search — Advanced memory search
workspaceRouter.post('/:id/memory/search', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { query, category, limit = 10, useSemantic = true } = body

  if (!query || query.length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400)
  }

  try {
    const dbPath = path.join(workspacePath, 'data', 'novelforge.db')
    const retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    let results
    if (useSemantic) {
      try {
        const hasEmb = await retriever.hasEmbeddings()
        if (hasEmb) {
          results = await retriever.hybridSearch(query, {
            limit,
            category: category || undefined,
          })
        } else {
          results = await retriever.searchByContent(query, limit)
        }
      } catch {
        results = await retriever.searchByContent(query, limit)
      }
    } else {
      results = await retriever.searchByContent(query, limit)
    }

    return c.json({
      query,
      results: results.map(r => ({
        id: r.id,
        content: r.content,
        category: r.category,
        sourceChapter: r.source_chapter,
        importance: r.importance,
        similarity: undefined as number | undefined,
      })),
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// POST /:id/memory/backfill-embeddings — Backfill embeddings for existing memories
workspaceRouter.post('/:id/memory/backfill-embeddings', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const dbPath = path.join(workspacePath, 'data', 'novelforge.db')
    const retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    const count = await retriever.backfillEmbeddings()
    return c.json({ success: true, backfilled: count })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Plot Threads (伏笔看板) ====================

// GET /:id/plots — Get all plot hooks and subplots
workspaceRouter.get('/:id/plots', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    const plotThreads = await stateManager.read('plot_threads')

    return c.json({
      hooks: plotThreads.hooks || [],
      subplots: plotThreads.subplots || [],
      reading_debt: plotThreads.reading_debt,
      last_updated: plotThreads.last_updated,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

const createHookSchema = z.object({
  content: z.string().min(1).max(2000),
  type: z.enum(['setup', 'payoff', 'cliffhanger']),
  setup_chapter: z.number().int().min(1),
  expected_payoff_chapter: z.number().int().min(1).optional(),
  strength: z.number().min(0).max(1).optional().default(0.5),
})

// POST /:id/plots/hooks — Create a new plot hook (伏笔)
workspaceRouter.post('/:id/plots/hooks', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const validation = createHookSchema.safeParse(body)
  if (!validation.success) {
    return c.json({ error: 'Invalid hook data', details: validation.error.issues }, 400)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    const plotThreads = await stateManager.read('plot_threads')

    const newHook = {
      id: `hook_${Date.now()}`,
      content: validation.data.content,
      type: validation.data.type,
      setup_chapter: validation.data.setup_chapter,
      expected_payoff_chapter: validation.data.expected_payoff_chapter,
      actual_payoff_chapter: undefined,
      status: 'active' as const,
      strength: validation.data.strength,
    }

    plotThreads.hooks.push(newHook)
    plotThreads.last_updated = new Date().toISOString()
    await stateManager.write('plot_threads', plotThreads)

    return c.json({ success: true, hook: newHook })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

const updateHookSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['active', 'overdue', 'resolved']).optional(),
  actual_payoff_chapter: z.number().int().min(1).optional(),
  content: z.string().max(2000).optional(),
  strength: z.number().min(0).max(1).optional(),
})

// PATCH /:id/plots/hooks — Update a plot hook (resolve, mark overdue, etc.)
workspaceRouter.patch('/:id/plots/hooks', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const validation = updateHookSchema.safeParse(body)
  if (!validation.success) {
    return c.json({ error: 'Invalid update data', details: validation.error.issues }, 400)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    const plotThreads = await stateManager.read('plot_threads')

    const idx = plotThreads.hooks.findIndex(h => h.id === validation.data.id)
    if (idx === -1) {
      return c.json({ error: 'Hook not found' }, 404)
    }

    const hook = plotThreads.hooks[idx]
    if (validation.data.status !== undefined) hook.status = validation.data.status
    if (validation.data.actual_payoff_chapter !== undefined) {
      hook.actual_payoff_chapter = validation.data.actual_payoff_chapter
      if (validation.data.actual_payoff_chapter > 0) {
        hook.status = 'resolved'
      }
    }
    if (validation.data.content !== undefined) hook.content = validation.data.content
    if (validation.data.strength !== undefined) hook.strength = validation.data.strength

    plotThreads.hooks[idx] = hook
    plotThreads.last_updated = new Date().toISOString()
    await stateManager.write('plot_threads', plotThreads)

    return c.json({ success: true, hook })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// DELETE /:id/plots/hooks/:hookId — Delete a plot hook
workspaceRouter.delete('/:id/plots/hooks/:hookId', async (c) => {
  const id = c.req.param('id')
  const hookId = c.req.param('hookId')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    const plotThreads = await stateManager.read('plot_threads')

    const initialLength = plotThreads.hooks.length
    plotThreads.hooks = plotThreads.hooks.filter(h => h.id !== hookId)

    if (plotThreads.hooks.length === initialLength) {
      return c.json({ error: 'Hook not found' }, 404)
    }

    plotThreads.last_updated = new Date().toISOString()
    await stateManager.write('plot_threads', plotThreads)

    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// POST /:id/plots/scan — Auto-scan chapters for potential foreshadowing hooks
workspaceRouter.post('/:id/plots/scan', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    const plotThreads = await stateManager.read('plot_threads')

    // Scan chapters for potential hooks
    const chaptersDir = path.join(workspacePath, 'chapters')
    const discoveredHooks: Array<{
      id: string; content: string; type: 'setup' | 'payoff' | 'cliffhanger';
      setup_chapter: number; strength: number; status: 'active' | 'overdue' | 'resolved';
    }> = []

    if (fs.existsSync(chaptersDir)) {
      const files = fs.readdirSync(chaptersDir).filter(f => f.endsWith('.md')).sort()
      for (const file of files) {
        const match = file.match(/chapter_(\d+)\.md/)
        if (!match) continue
        const chNum = parseInt(match[1])
        const content = fs.readFileSync(path.join(chaptersDir, file), 'utf-8')

        // Detect cliffhangers at chapter endings (last 200 chars)
        const ending = content.slice(-200)
        if (ending.includes('？') || ending.includes('...') || ending.includes('突然')) {
          const existingHook = plotThreads.hooks.find(h => h.setup_chapter === chNum)
          if (!existingHook) {
            discoveredHooks.push({
              id: `hook_scan_${Date.now()}_${chNum}`,
              content: `第${chNum}章结尾发现悬疑钩子`,
              type: 'cliffhanger',
              setup_chapter: chNum,
              strength: 0.6,
              status: 'active',
            })
          }
        }

        // Detect setup keywords
        const setupKeywords = ['日后', '将来', '总有一天', '或许有一天', '隐约感觉', '似乎']
        for (const kw of setupKeywords) {
          if (content.includes(kw)) {
            const existingHook = plotThreads.hooks.find(h => h.setup_chapter === chNum && h.content.includes(kw))
            if (!existingHook) {
              discoveredHooks.push({
                id: `hook_scan_${Date.now()}_${chNum}_${kw}`,
                content: `第${chNum}章: 发现伏笔暗示 "${kw}"`,
                type: 'setup',
                setup_chapter: chNum,
                strength: 0.5,
                status: 'active',
              })
            }
          }
        }
      }
    }

    // Add discovered hooks
    if (discoveredHooks.length > 0) {
      plotThreads.hooks.push(...discoveredHooks)
      plotThreads.last_updated = new Date().toISOString()
      await stateManager.write('plot_threads', plotThreads)
    }

    return c.json({
      discovered: discoveredHooks.length,
      hooks: plotThreads.hooks,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Rhythm Curve (节奏曲线) ====================

// GET /:id/rhythm/chapters — Get rhythm data for all chapters (for rhythm curve chart)
workspaceRouter.get('/:id/rhythm/chapters', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    const rhythmMap = await stateManager.read('rhythm_map')

    // Enrich with chapter titles
    const chaptersDir = path.join(workspacePath, 'chapters')
    const chapterTitles: Record<number, string> = {}
    if (fs.existsSync(chaptersDir)) {
      for (const file of fs.readdirSync(chaptersDir).filter(f => f.endsWith('.md'))) {
        const match = file.match(/chapter_(\d+)\.md/)
        if (match) {
          const chNum = parseInt(match[1])
          const firstLine = fs.readFileSync(path.join(chaptersDir, file), 'utf-8').split('\n')[0]
          chapterTitles[chNum] = firstLine.replace(/^#\s*/, '')
        }
      }
    }

    const chapters = (rhythmMap.chapters || []).map((ch: any) => ({
      chapter_number: ch.chapter_number,
      hook_strength: ch.hook_strength,
      cool_points: ch.cool_points || [],
      micro_payoffs: ch.micro_payoffs,
      emotional_curve: ch.emotional_curve || [],
      pace_alerts: ch.pace_alerts || [],
      reading_debt_snapshot: ch.reading_debt_snapshot,
      chapter_title: chapterTitles[ch.chapter_number] || `第${ch.chapter_number}章`,
    }))

    return c.json({
      chapters,
      overall_metrics: rhythmMap.overall_metrics,
      last_updated: rhythmMap.last_updated,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Export ====================

const exportFormatSchema = z.object({
  format: z.enum(['txt', 'docx', 'pdf', 'epub']).default('txt'),
  includeMetadata: z.boolean().optional().default(true),
  chapterRange: z.object({
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  }).optional(),
  coverImagePath: z.string().optional().refine(
    (val) => val === undefined || val === '' || (!val.includes('..') && !val.includes('\x00')),
    { message: 'coverImagePath contains invalid characters' }
  ),
})

// POST /:id/export — Export novel in specified format
workspaceRouter.post('/:id/export', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const body = await c.req.json().catch(() => ({}))
  const validation = exportFormatSchema.safeParse(body)
  if (!validation.success) {
    return c.json({ error: 'Invalid export options', details: validation.error.issues }, 400)
  }
  
  const { format, includeMetadata, chapterRange, coverImagePath } = validation.data
  
  const chaptersDir = path.join(workspacePath, 'chapters')
  if (!fs.existsSync(chaptersDir)) {
    return c.json({ error: 'No chapters to export' }, 404)
  }
  
  try {
    const { Exporter } = await import('../core/exporter.js')
    const exporter = new Exporter(workspacePath)
    
    const outputPath = await exporter.export({
      format,
      includeMetadata,
      chapterRange,
      coverImagePath,
    })
    
    const filename = path.basename(outputPath)
    const downloadUrl = `/api/workspace/${encodeURIComponent(id)}/export/download/${encodeURIComponent(filename)}`
    
    return c.json({ url: downloadUrl, format, filename })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Export error')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// POST /:id/export/batch — Batch export to multiple formats
const batchExportSchema = z.object({
  formats: z.array(z.enum(['txt', 'docx', 'pdf', 'epub'])).min(1).max(4),
  includeMetadata: z.boolean().optional().default(true),
  chapterRange: z.object({
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  }).optional(),
  coverImagePath: z.string().optional().refine(
    (val) => val === undefined || val === '' || (!val.includes('..') && !val.includes('\x00')),
    { message: 'coverImagePath contains invalid characters' }
  ),
})

workspaceRouter.post('/:id/export/batch', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  const body = await c.req.json().catch(() => ({}))
  const validation = batchExportSchema.safeParse(body)
  if (!validation.success) {
    return c.json({ error: 'Invalid batch export options', details: validation.error.issues }, 400)
  }
  
  const { formats, includeMetadata, chapterRange, coverImagePath } = validation.data
  
  try {
    const { Exporter } = await import('../core/exporter.js')
    const exporter = new Exporter(workspacePath)
    
    const results = await exporter.batchExport({
      formats,
      includeMetadata,
      chapterRange,
      coverImagePath,
    })
    
    const files = results.map(r => ({
      format: r.format,
      filename: r.filename,
      url: `/api/workspace/${encodeURIComponent(id)}/export/download/${encodeURIComponent(r.filename)}`,
    }))
    
    return c.json({ files })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Batch export error')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// GET /:id/export/history — Get export history
workspaceRouter.get('/:id/export/history', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  try {
    const { Exporter } = await import('../core/exporter.js')
    const exporter = new Exporter(workspacePath)
    const history = exporter.getExportHistory()
    return c.json({ history })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Export history error')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// GET /:id/export/files — List exported files
workspaceRouter.get('/:id/export/files', async (c) => {
  const id = c.req.param('id')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  try {
    const { Exporter } = await import('../core/exporter.js')
    const exporter = new Exporter(workspacePath)
    const files = exporter.listExportFiles()
    return c.json({ files })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Export file list error')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// DELETE /:id/export/files/:filename — Delete an exported file
workspaceRouter.delete('/:id/export/files/:filename', async (c) => {
  const id = c.req.param('id')
  const filename = c.req.param('filename')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  
  if (!filename || filename.startsWith('.')) {
    return c.json({ error: 'Invalid filename' }, 400)
  }
  
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  
  try {
    const { Exporter } = await import('../core/exporter.js')
    const exporter = new Exporter(workspacePath)
    const deleted = exporter.deleteExportFile(filename)
    
    if (deleted) {
      return c.json({ success: true, filename })
    } else {
      return c.json({ error: 'File not found' }, 404)
    }
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Export delete error')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// POST /:id/export/script — Export novel as script JSON (film/TV format)
workspaceRouter.post('/:id/export/script', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const { chapterNumber = 1 } = body

  try {
    const { ScriptExporterAgent } = await import('../agents/script-exporter.js')
    const exporter = new ScriptExporterAgent(workspacePath)
    const script = await exporter.export(chapterNumber)

    // NOTE: ScriptExporterAgent.saveScript() already saves to exports/scripts/
    // We additionally save a copy at exports/ for the download API
    const exportDir = path.join(workspacePath, 'exports')
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const exportPath = path.join(exportDir, `script_ch${chapterNumber}.json`)
    fs.writeFileSync(exportPath, JSON.stringify(script, null, 2))

    return c.json({
      url: `/api/workspace/${encodeURIComponent(id)}/export/download/${encodeURIComponent(`script_ch${chapterNumber}.json`)}`,
      script,
    })
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Script export error')
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

workspaceRouter.get('/:id/export/download/:filename', async (c) => {
  const id = c.req.param('id')
  const filename = c.req.param('filename')
  
  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  
  // Path traversal prevention: filename must not contain path separators or traversal sequences
  if (!/^[a-zA-Z0-9_\-\. ]+$/.test(filename) || filename.includes('..')) {
    return c.json({ error: 'Invalid filename' }, 400)
  }
  
  const filePath = path.join(process.cwd(), 'workspace', id, 'exports', filename)
  
  // Double-check: ensure resolved path stays within the exports directory
  const exportsDir = path.resolve(process.cwd(), 'workspace', id, 'exports')
  if (!path.resolve(filePath).startsWith(exportsDir)) {
    logger.warn({ id, filename, filePath }, 'Path traversal attempt blocked on download')
    return c.json({ error: 'File not found' }, 404)
  }
  
  if (!fs.existsSync(filePath)) {
    return c.json({ error: 'File not found' }, 404)
  }
  
  // Determine MIME type by extension
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain; charset=utf-8',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'text/html; charset=utf-8',  // HTML-based PDF for browser print
    '.epub': 'application/epub+zip',
    '.json': 'application/json; charset=utf-8',
  }
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  // Read as binary for non-text formats, text for text formats
  const isText = ext === '.txt' || ext === '.pdf' || ext === '.json'
  const content = isText ? fs.readFileSync(filePath, 'utf-8') : fs.readFileSync(filePath)
  
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
  }
  
  if (!isText) {
    headers['Content-Length'] = String((content as Buffer).length)
  }
  
  return new Response(content, {
    status: 200,
    headers,
  })
})

// POST /:id/cover/generate — Generate cover image via Stable Diffusion
workspaceRouter.post('/:id/cover/generate', async (c) => {
  const id = c.req.param('id')

  if (!validateId(id)) {
    return c.json({ error: 'Invalid workspace ID' }, 400)
  }

  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError

  const workspacePath = path.join(process.cwd(), 'workspace', id)

  try {
    const { CoverGeneratorAgent } = await import('../agents/cover-generator.js')
    const stateManager = new StateManager(workspacePath)
    const router = new ModelRouter()

    const agent = new CoverGeneratorAgent(router, stateManager)
    const result = await agent.generate()

    // If image was saved locally, provide download URL
    if (result.success && result.localPath) {
      const filename = path.basename(result.localPath)
      // Copy to exports dir for download API
      const exportDir = path.join(workspacePath, 'exports')
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true })
      }
      const exportPath = path.join(exportDir, filename)
      if (result.localPath !== exportPath) {
        fs.copyFileSync(result.localPath, exportPath)
      }
      return c.json({
        ...result,
        url: `/api/workspace/${encodeURIComponent(id)}/export/download/${encodeURIComponent(filename)}`,
      })
    }

    return c.json(result)
  } catch (error) {
    logger.error({ workspaceId: id, err: error }, 'Cover generation error')
    return c.json({
      success: false,
      prompt: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})

// ==================== Outline Management ====================

interface OutlineItem {
  id: string
  title: string
  chapterNumber: number
  summary: string
  status: 'planned' | 'writing' | 'completed' | 'revised'
  beats?: string[]
}

workspaceRouter.get('/:id/outline', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) return c.json({ error: 'Workspace not found' }, 404)
  try {
    const stateManager = new StateManager(workspacePath)
    const data = await stateManager.read('outline')
    return c.json({ outlines: data.outlines })
  } catch {
    return c.json({ outlines: [] })
  }
})

workspaceRouter.post('/:id/outline', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  const body = await c.req.json().catch(() => ({}))
  const { outlines } = body as { outlines: OutlineItem[] }
  if (!outlines || !Array.isArray(outlines)) return c.json({ error: 'outlines array required' }, 400)
  try {
    const stateManager = new StateManager(workspacePath)
    // Frontend outline items use a richer shape (chapterNumber / 'writing' /
    // 'revised') than the persisted outline schema. JSON is stored loosely,
    // so cast to the registry type to satisfy the write() signature.
    await stateManager.write('outline', { outlines: outlines as never, last_updated: new Date().toISOString() })
    return c.json({ success: true, outlines })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Worldview Management ====================

interface WorldviewEntry {
  name: string
  category: 'geography' | 'organization' | 'power_system' | 'history' | 'culture' | 'other'
  description: string
  relatedCharacters?: string[]
}

workspaceRouter.get('/:id/worldview', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) return c.json({ error: 'Workspace not found' }, 404)
  try {
    const stateManager = new StateManager(workspacePath)
    const data = await stateManager.read('worldview')
    return c.json({ entries: data.entries })
  } catch {
    return c.json({ entries: [] })
  }
})

workspaceRouter.post('/:id/worldview', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  const body = await c.req.json().catch(() => ({}))
  const { name, category, description, relatedCharacters } = body as WorldviewEntry
  if (!name) return c.json({ error: 'name is required' }, 400)
  try {
    const stateManager = new StateManager(workspacePath)
    const existing = await stateManager.read('worldview').catch(() => ({ entries: [] as import('../state/schemas/worldview.js').WorldviewEntry[], last_updated: undefined }))
    const entries = existing.entries
    entries.push({ name, category: category || 'other', description: description || '', relatedCharacters: relatedCharacters || [] })
    await stateManager.write('worldview', { entries, last_updated: new Date().toISOString() })
    return c.json({ success: true, entry: { name, category, description, relatedCharacters } })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Relationship Graph ====================

interface GraphNodeInput {
  id?: string
  label: string
  type: 'character' | 'location' | 'item' | 'concept' | 'event' | 'organization'
  group?: number
  description?: string
  properties?: Record<string, any>
}

interface GraphLinkInput {
  id?: string
  source: string
  target: string
  type: string
  strength?: number
  description?: string
  properties?: Record<string, any>
}

function generateNodeId(type: string): string {
  const prefix = type.slice(0, 3)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${random}_${Date.now()}`
}

function generateLinkId(): string {
  return `link_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`
}

// GET /:id/graph — fetch graph data with optional filters
workspaceRouter.get('/:id/graph', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)
  if (!fs.existsSync(workspacePath)) return c.json({ error: 'Workspace not found' }, 404)

  try {
    const stateManager = new StateManager(workspacePath)
    const exists = await stateManager.exists('relationship_graph')
    
    if (!exists) {
      return c.json({ 
        nodes: [], 
        links: [], 
        metadata: { totalNodes: 0, totalLinks: 0, lastUpdated: new Date().toISOString(), workspaceId: id }
      })
    }

    let graph = await stateManager.read('relationship_graph')
    let { nodes, links } = graph

    // Apply filters
    const nodeTypes = c.req.query('nodeTypes')?.split(',').filter(Boolean)
    const linkTypes = c.req.query('linkTypes')?.split(',').filter(Boolean)
    const minStrength = c.req.query('minStrength') ? parseFloat(c.req.query('minStrength')!) : undefined
    const search = c.req.query('search')?.toLowerCase()

    if (nodeTypes && nodeTypes.length > 0) {
      const allowedIds = new Set(nodes.filter(n => nodeTypes.includes(n.type)).map(n => n.id))
      nodes = nodes.filter(n => allowedIds.has(n.id))
      links = links.filter(l => allowedIds.has(l.source) && allowedIds.has(l.target))
    }

    if (linkTypes && linkTypes.length > 0) {
      links = links.filter(l => linkTypes.includes(l.type))
    }

    if (minStrength !== undefined && !isNaN(minStrength)) {
      links = links.filter(l => (l.strength ?? 1) >= minStrength)
    }

    if (search) {
      const matchingNodeIds = new Set(
        nodes.filter(n => 
          n.label.toLowerCase().includes(search) || 
          (n.description?.toLowerCase().includes(search))
        ).map(n => n.id)
      )
      nodes = nodes.filter(n => matchingNodeIds.has(n.id))
      links = links.filter(l => matchingNodeIds.has(l.source) && matchingNodeIds.has(l.target))
    }

    return c.json({
      nodes,
      links,
      metadata: {
        totalNodes: graph.nodes.length,
        totalLinks: graph.links.length,
        lastUpdated: graph.metadata?.lastUpdated || new Date().toISOString(),
        workspaceId: id,
      }
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// POST /:id/graph/nodes — add a new node
workspaceRouter.post('/:id/graph/nodes', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)

  const body = await c.req.json().catch(() => ({})) as GraphNodeInput
  if (!body.label) return c.json({ error: 'label is required' }, 400)
  if (!body.type) return c.json({ error: 'type is required' }, 400)

  try {
    const stateManager = new StateManager(workspacePath)
    let graph = await stateManager.read('relationship_graph').catch(() => ({
      nodes: [] as any[],
      links: [] as any[],
      metadata: undefined
    }))

    const newNode = {
      id: body.id || generateNodeId(body.type),
      label: body.label,
      type: body.type,
      group: body.group ?? 0,
      description: body.description,
      properties: body.properties,
    }

    // Check duplicate label with same type
    if (graph.nodes.some(n => n.label === body.label && n.type === body.type)) {
      return c.json({ error: 'Node with same label and type already exists' }, 409)
    }

    graph.nodes.push(newNode)
    if (graph.metadata) {
      graph.metadata.totalNodes = graph.nodes.length
      graph.metadata.lastUpdated = new Date().toISOString()
    }
    await stateManager.write('relationship_graph', graph)
    return c.json(newNode, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// PUT /:id/graph/nodes/:nodeId — update a node
workspaceRouter.put('/:id/graph/nodes/:nodeId', async (c) => {
  const id = c.req.param('id')
  const nodeId = c.req.param('nodeId')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)

  const updates = await c.req.json().catch(() => ({})) as Partial<GraphNodeInput>
  if (updates.id && updates.id !== nodeId) {
    return c.json({ error: 'Cannot change node ID' }, 400)
  }

  try {
    const stateManager = new StateManager(workspacePath)
    const graph = await stateManager.read('relationship_graph')
    const idx = graph.nodes.findIndex(n => n.id === nodeId)
    if (idx === -1) return c.json({ error: 'Node not found' }, 404)

    graph.nodes[idx] = { ...graph.nodes[idx], ...updates, id: nodeId }
    if (graph.metadata) {
      graph.metadata.lastUpdated = new Date().toISOString()
    }
    await stateManager.write('relationship_graph', graph)
    return c.json(graph.nodes[idx])
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// DELETE /:id/graph/nodes/:nodeId — delete a node and its connected links
workspaceRouter.delete('/:id/graph/nodes/:nodeId', async (c) => {
  const id = c.req.param('id')
  const nodeId = c.req.param('nodeId')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)

  try {
    const stateManager = new StateManager(workspacePath)
    const graph = await stateManager.read('relationship_graph')
    
    graph.nodes = graph.nodes.filter(n => n.id !== nodeId)
    graph.links = graph.links.filter(l => l.source !== nodeId && l.target !== nodeId)
    if (graph.metadata) {
      graph.metadata.totalNodes = graph.nodes.length
      graph.metadata.totalLinks = graph.links.length
      graph.metadata.lastUpdated = new Date().toISOString()
    }
    await stateManager.write('relationship_graph', graph)
    return c.json({ success: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// POST /:id/graph/links — add a new link
workspaceRouter.post('/:id/graph/links', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)

  const body = await c.req.json().catch(() => ({})) as GraphLinkInput
  if (!body.source) return c.json({ error: 'source is required' }, 400)
  if (!body.target) return c.json({ error: 'target is required' }, 400)
  if (!body.type) return c.json({ error: 'type is required' }, 400)
  if (body.source === body.target) return c.json({ error: 'source and target cannot be the same' }, 400)

  try {
    const stateManager = new StateManager(workspacePath)
    const graph = await stateManager.read('relationship_graph')

    // Validate source and target nodes exist
    if (!graph.nodes.some(n => n.id === body.source)) {
      return c.json({ error: `Source node "${body.source}" not found` }, 404)
    }
    if (!graph.nodes.some(n => n.id === body.target)) {
      return c.json({ error: `Target node "${body.target}" not found` }, 404)
    }

    // Check for duplicate link (same source, target, type)
    if (graph.links.some(l => l.source === body.source && l.target === body.target && l.type === body.type)) {
      return c.json({ error: 'Link with same source, target, and type already exists' }, 409)
    }

    const newLink = {
      id: body.id || generateLinkId(),
      source: body.source,
      target: body.target,
      type: body.type,
      strength: body.strength,
      description: body.description,
      properties: body.properties,
    }

    graph.links.push(newLink)
    if (graph.metadata) {
      graph.metadata.totalLinks = graph.links.length
      graph.metadata.lastUpdated = new Date().toISOString()
    }
    await stateManager.write('relationship_graph', graph)
    return c.json(newLink, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// GET /:id/graph/nodes/:nodeId/neighbors — get a node's neighbors
workspaceRouter.get('/:id/graph/nodes/:nodeId/neighbors', async (c) => {
  const id = c.req.param('id')
  const nodeId = c.req.param('nodeId')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)

  try {
    const stateManager = new StateManager(workspacePath)
    const exists = await stateManager.exists('relationship_graph')
    if (!exists) {
      return c.json({ node: null, neighbors: [], links: [] })
    }

    const graph = await stateManager.read('relationship_graph')
    const node = graph.nodes.find(n => n.id === nodeId) || null

    const connectedLinks = graph.links.filter(l => l.source === nodeId || l.target === nodeId)
    const neighborIds = new Set<string>()
    for (const l of connectedLinks) {
      if (l.source === nodeId) neighborIds.add(l.target)
      else neighborIds.add(l.source)
    }

    const neighbors = graph.nodes.filter(n => neighborIds.has(n.id))

    return c.json({ node, neighbors, links: connectedLinks })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// ==================== Platform Export Routes ====================

workspaceRouter.post('/:id/export/platform', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)

  try {
    const body = await c.req.json().catch(() => ({}))
    const { platform } = body as { platform?: string }
    
    const validPlatforms = ['qidian', 'jinjiang', 'fanqie']
    if (!platform || !validPlatforms.includes(platform)) {
      return c.json({ error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` }, 400)
    }

    const outputDir = path.join(workspacePath, 'exports', 'platform')
    const { exportForPlatform } = await import('../exporters/platform-adapters.js')
    const result = await exportForPlatform(workspacePath, {
      platform: platform as 'qidian' | 'jinjiang' | 'fanqie',
      outputDir,
    })

    return c.json(result)
  } catch (error) {
    logger.error({ error, id }, 'Platform export failed')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

workspaceRouter.post('/:id/export/platform/batch', async (c) => {
  const id = c.req.param('id')
  if (!validateId(id)) return c.json({ error: 'Invalid workspace ID' }, 400)
  const ownershipError = checkOwnership(c, id)
  if (ownershipError) return ownershipError
  const workspacePath = path.join(process.cwd(), 'workspace', id)

  try {
    const body = await c.req.json().catch(() => ({}))
    const { platforms } = body as { platforms?: string[] }
    
    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return c.json({ error: 'platforms array is required' }, 400)
    }

    const validPlatforms = ['qidian', 'jinjiang', 'fanqie'] as const
    const filtered = platforms.filter((p): p is 'qidian' | 'jinjiang' | 'fanqie' => validPlatforms.includes(p as any))
    if (filtered.length === 0) {
      return c.json({ error: `No valid platforms. Must be from: ${validPlatforms.join(', ')}` }, 400)
    }

    const outputDir = path.join(workspacePath, 'exports', 'platform')
    const { batchExportForPlatforms } = await import('../exporters/platform-adapters.js')
    const results = await batchExportForPlatforms(workspacePath, filtered, outputDir)

    return c.json({ results, count: results.length })
  } catch (error) {
    logger.error({ error, id }, 'Batch platform export failed')
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

export { workspaceRouter }
