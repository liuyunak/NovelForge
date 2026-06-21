import { DAGExecutor, type NodeResult, type ProgressCallback } from './dag-executor.js'
import { NOVELFORGE_DAG } from './dag.js'
import { ModelRouter } from '../router.js'
import { ContextAssembler } from './context.js'
import { FullTextMemory } from '../memory/full-text-memory.js'
import { StateManager } from '../state/manager.js'
import { PlannerAgent, type ChapterPlan } from '../agents/planner.js'
import { ComposerAgent } from '../agents/composer.js'
import { PreAuditAgent } from '../agents/pre-audit.js'
import { ContextPrepAgent } from '../agents/context-prep.js'
import { WriterAgent } from '../agents/writer.js'
import { FastAuditAgent } from '../agents/fast-audit.js'
import { DeepAuditAgent } from '../agents/deep-audit.js'
import { AnalystAgent } from '../agents/analyst.js'
import { PolisherAgent } from '../agents/polisher.js'
import { MemoryUpdateAgent } from '../agents/memory-update.js'
import { DreamEngine } from '../memory/dream-engine.js'
import { MemoryLifecycle } from '../memory/lifecycle.js'
import { MemoryRetriever } from '../memory/retriever.js'
import { ReviewerAgent } from '../agents/reviewer.js'
import { StyleExtractorAgent } from '../agents/style-extractor.js'
import { logger } from '../logger.js'

export interface PipelineResult {
  success: boolean
  chapterNumber: number
  results: Map<string, NodeResult>
  duration_ms: number
}

export interface WriteOptions {
  mode?: string
  intensity?: number
  length?: number
}

export class DAGScheduler {
  private executor: DAGExecutor
  private router: ModelRouter
  private contextAssembler: ContextAssembler
  private stateManager: StateManager
  private fullTextMemory: FullTextMemory
  private progressCallback?: ProgressCallback
  private plannerAgent: PlannerAgent
  private composerAgent: ComposerAgent
  private preAuditAgent: PreAuditAgent
  private contextPrepAgent: ContextPrepAgent
  private writerAgent: WriterAgent
  private fastAuditAgent: FastAuditAgent
  private deepAuditAgent: DeepAuditAgent
  private analystAgent: AnalystAgent
  private polisherAgent: PolisherAgent
  private memoryUpdateAgent: MemoryUpdateAgent
  private reviewerAgent: ReviewerAgent
  private styleExtractorAgent: StyleExtractorAgent
  private memoryLifecycle: MemoryLifecycle
  private writeOptions: WriteOptions = {}

  constructor(
    workspacePath: string,
    fullTextMemory: FullTextMemory,
    stateManager: StateManager
  ) {
    this.fullTextMemory = fullTextMemory
    this.executor = new DAGExecutor(NOVELFORGE_DAG)
    this.router = new ModelRouter()
    this.contextAssembler = new ContextAssembler(fullTextMemory, stateManager)
    this.stateManager = stateManager
    
    const memoryRetriever = new MemoryRetriever()
    this.memoryLifecycle = new MemoryLifecycle(memoryRetriever)
    const dreamEngine = new DreamEngine(fullTextMemory, stateManager, this.router)
    dreamEngine.setRetriever(memoryRetriever)
    // Load dream history from SQLite after retriever is set
    dreamEngine.loadHistory().catch(err =>
      logger.warn('[DAGScheduler] Failed to load dream history: %s', err)
    )

    this.plannerAgent = new PlannerAgent(this.router, stateManager)
    this.composerAgent = new ComposerAgent(this.contextAssembler, stateManager)
    this.preAuditAgent = new PreAuditAgent(stateManager)
    this.contextPrepAgent = new ContextPrepAgent(stateManager, fullTextMemory)
    this.writerAgent = new WriterAgent(this.router, stateManager)
    this.fastAuditAgent = new FastAuditAgent(stateManager)
    this.deepAuditAgent = new DeepAuditAgent(this.router, stateManager)
    this.analystAgent = new AnalystAgent(this.router, stateManager, this.memoryLifecycle)
    this.polisherAgent = new PolisherAgent(this.router, stateManager)
    this.memoryUpdateAgent = new MemoryUpdateAgent(fullTextMemory, dreamEngine)
    this.reviewerAgent = new ReviewerAgent(this.router, stateManager, fullTextMemory)
    this.styleExtractorAgent = new StyleExtractorAgent(this.router, stateManager)
    
    this.registerAgents()
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback
    this.executor.onProgress(callback)
  }

  /**
   * Initialize state and memory subsystems.
   * Must be called before execute().
   */
  async initialize(): Promise<void> {
    await this.stateManager.initialize()
    await this.fullTextMemory.initialize()
    await this.memoryLifecycle.initialize()
  }

  private registerAgents(): void {
    this.executor.registerAgent('planner', async (inputs) => {
      logger.debug('Executing Planner...')
      const plan = await this.plannerAgent.plan(inputs.chapterNumber || 1)
      return { chapter_plan: plan }
    })

    this.executor.registerAgent('composer', async (inputs) => {
      logger.debug('Executing Composer...')
      const chapterPlan = inputs['planner']?.chapter_plan
      const context = await this.composerAgent.compose(chapterPlan)
      return { context }
    })

    this.executor.registerAgent('pre-audit', async (inputs) => {
      logger.debug('Executing PreAudit...')
      const chapterPlan = inputs['planner']?.chapter_plan
      const result = await this.preAuditAgent.audit(chapterPlan)
      return { passed: result.passed, warnings: result.warnings || [] }
    })

    this.executor.registerAgent('style-extractor', async (inputs) => {
      logger.debug('Executing StyleExtractor...')
      const chapterPlan = inputs['planner']?.chapter_plan
      const chapterNumber = chapterPlan?.chapter_number || 1
      try {
        // Only extract style from existing chapters (skip if no prior chapters exist)
        const recentText = await this.fullTextMemory.getRecentChapters(5)
        if (recentText && recentText.length > 500) {
          const samples = recentText.split(/\n\n---\n\n/).filter((s: string) => s.trim().length > 100)
          if (samples.length > 0) {
            const fingerprint = await this.styleExtractorAgent.extract(samples.slice(0, 3))
            return { fingerprint_updated: true, confidence: fingerprint.metadata?.confidence }
          }
        }
        return { fingerprint_updated: false, reason: 'insufficient text for extraction' }
      } catch (error) {
        logger.warn('StyleExtractor failed (non-blocking): %s', error instanceof Error ? error.message : error)
        return { fingerprint_updated: false, error: error instanceof Error ? error.message : 'unknown' }
      }
    })

    this.executor.registerAgent('context-prep', async (inputs) => {
      logger.debug('Executing ContextPrep...')
      const chapterPlan = inputs['planner']?.chapter_plan
      const prepared = await this.contextPrepAgent.prepare(chapterPlan?.chapter_number || 1)
      return { context: prepared }
    })

    this.executor.registerAgent('writer', async (inputs) => {
      logger.debug('Executing Writer (mode=%s, intensity=%d, length=%d)...',
        this.writeOptions.mode || 'default',
        this.writeOptions.intensity ?? 0,
        this.writeOptions.length ?? 0)
      const chapterPlan = inputs['planner']?.chapter_plan
      const context = inputs['composer']?.context
      const prepared = inputs['context-prep']?.context
      const writerOutput = await this.writerAgent.write(chapterPlan, context, prepared, this.writeOptions)

      // Post-write: analyze rhythm and detect style deviations (non-blocking)
      const chapterNumber = chapterPlan?.chapter_number || 1
      const chapterText = writerOutput.chapterText

      // Rhythm analysis (auto-triggered, non-blocking, results saved to state)
      this.writerAgent.analyzeChapterRhythm(chapterNumber, chapterText).then(result => {
        logger.info({ chapter: chapterNumber, hookStrength: result.hook_strength, coolPoints: result.cool_points?.length, alerts: result.pace_alerts?.length }, '[Rhythm] Chapter analyzed')
      }).catch(err =>
        logger.warn('[Rhythm] Analysis failed (non-blocking): %s', err)
      )

      // Style deviation detection (log only, for monitoring)
      this.writerAgent.detectStyleDeviations(chapterText).then(deviations => {
        if (deviations.length > 0) {
          logger.info({ chapter: chapterNumber, deviationCount: deviations.length, deviations: deviations.map(d => `${d.type}(${d.severity})`) }, '[Style] Deviations detected')
        }
      }).catch(err => logger.warn('Style deviation detection failed: %s', err))

      return { chapter_text: chapterText, word_count: writerOutput.wordCount }
    })

    this.executor.registerAgent('fast-audit', async (inputs) => {
      logger.debug('Executing FastAudit...')
      const chapterText = inputs['writer']?.chapter_text
      const chapterPlan = inputs['planner']?.chapter_plan
      const result = await this.fastAuditAgent.audit(chapterText, chapterPlan?.chapter_number || 1)
      return { score: result.score, passed: result.passed, warnings: [] }
    })

    this.executor.registerAgent('deep-audit', async (inputs) => {
      logger.debug('Executing DeepAudit...')
      const chapterText = inputs['writer']?.chapter_text
      const chapterPlan = inputs['planner']?.chapter_plan
      const fullTextContext = await this.fullTextMemory.getRecentChapters(20)
      const result = await this.deepAuditAgent.audit(chapterText, chapterPlan?.chapter_number || 1, fullTextContext)
      return {
        score: result.score,
        issues: result.issues || [],
        auto_fixes: result.auto_fixes || [],
        human_decision_required: result.human_decision_required || [],
      }
    })

    this.executor.registerAgent('analyst', async (inputs) => {
      logger.debug('Executing Analyst...')
      const chapterText = inputs['writer']?.chapter_text
      const chapterPlan = inputs['planner']?.chapter_plan
      const deepAuditResult = inputs['deep-audit']
      const result = await this.analystAgent.analyze(chapterText, chapterPlan?.chapter_number || 1, deepAuditResult)
      return { facts: result.chapterSummary, state_delta: {} }
    })

    this.executor.registerAgent('polisher', async (inputs) => {
      logger.debug('Executing Polisher...')
      const chapterText = inputs['writer']?.chapter_text
      const result = await this.polisherAgent.polish(chapterText)
      return { polished_text: result.polishedText, changes: result.changes }
    })

    this.executor.registerAgent('memory-update', async (inputs) => {
      logger.debug('Executing MemoryUpdate...')
      // Fallback: use polisher output if available, otherwise writer output
      const chapterText = inputs['polisher']?.polished_text || inputs['writer']?.chapter_text || ''
      const chapterPlan = inputs['planner']?.chapter_plan
      const analystOutput = inputs['analyst']
      await this.memoryUpdateAgent.update(
        chapterPlan?.chapter_number || 1,
        chapterText,
        chapterPlan?.title || '',
        analystOutput?.facts || ''
      )
      return { updated: true }
    })

    this.executor.registerAgent('reviewer', async (inputs) => {
      logger.debug('Executing Reviewer...')
      const chapterText = inputs['polisher']?.polished_text || inputs['writer']?.chapter_text || ''
      const chapterPlan = inputs['planner']?.chapter_plan
      const result = await this.reviewerAgent.review(chapterText, chapterPlan)
      return result
    })
  }

  /**
   * Set writing options (mode, intensity, length) that will be applied
   * by the writer agent during pipeline execution.
   */
  setWriteOptions(options: WriteOptions): void {
    this.writeOptions = { ...options }
  }

  async execute(chapterNumber: number): Promise<PipelineResult> {
    logger.info(`Starting pipeline for chapter ${chapterNumber}`)
    const startTime = Date.now()
    
    this.executor.reset()
    const results = await this.executor.execute()
    
    // Check if we're paused waiting for approval
    const waitingNodes = this.executor.getWaitingApprovalNodes()
    
    const success = Array.from(results.values()).every(r => r.status !== 'failed')
    
    return {
      success,
      chapterNumber,
      results,
      duration_ms: Date.now() - startTime,
    }
  }

  /**
   * Resume pipeline after human approval. Does NOT reset completed nodes.
   */
  async resumeAfterApproval(chapterNumber: number): Promise<PipelineResult> {
    logger.info(`Resuming pipeline for chapter ${chapterNumber} after approval`)
    const startTime = Date.now()
    
    // Use resume() instead of execute() — no reset
    const results = await this.executor.resume()
    
    const success = Array.from(results.values()).every(r => r.status !== 'failed')
    
    return {
      success,
      chapterNumber,
      results,
      duration_ms: Date.now() - startTime,
    }
  }

  approveOutline(): void {
    this.executor.approveNode('approval1')
  }

  approveFinal(): void {
    this.executor.approveNode('approval2')
  }
}
