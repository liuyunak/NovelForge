/**
 * @deprecated This Pipeline class is deprecated and will be removed in v4.0.
 * Use DAGScheduler (src/core/dag-scheduler.ts) instead, which provides:
 * - Full DAG-based execution with parallel node support
 * - Approval-based pause/resume capability
 * - Comprehensive progress callbacks
 * - Better error handling and retry logic
 * 
 * This class is kept for backward compatibility only.
 * Migration guide: Replace Pipeline usage with DAGScheduler.
 */

import { PlannerAgent, type ChapterPlan } from '../agents/planner.js'
import { WriterAgent, type WriterOutput } from '../agents/writer.js'
import { FastAuditAgent } from '../agents/fast-audit.js'
import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import { logger } from '../logger.js'
import type { FastAuditResult } from '../types/index.js'

export interface PipelineOutput {
  success: boolean
  chapterNumber: number
  chapterPlan?: ChapterPlan
  chapterText?: string
  wordCount?: number
  fastAuditResult?: FastAuditResult
  duration_ms: number
  error?: string
}

export class Pipeline {
  private router: ModelRouter
  private stateManager: StateManager
  private plannerAgent: PlannerAgent
  private writerAgent: WriterAgent
  private fastAuditAgent: FastAuditAgent

  constructor(workspacePath: string) {
    this.router = new ModelRouter()
    this.stateManager = new StateManager(workspacePath)
    this.plannerAgent = new PlannerAgent(this.router, this.stateManager)
    this.writerAgent = new WriterAgent(this.router, this.stateManager)
    this.fastAuditAgent = new FastAuditAgent(this.stateManager)
  }

  async initialize(): Promise<void> {
    await this.stateManager.initialize()
  }

  async execute(chapterNumber: number, onProgress?: (stage: string, data?: any) => void): Promise<PipelineOutput> {
    const startTime = Date.now()
    
    try {
      onProgress?.('planner')
      const chapterPlan = await this.plannerAgent.plan(chapterNumber)
      
      onProgress?.('writer')
      const writerOutput = await this.writerAgent.write(chapterPlan, { fullText: '', workingMemory: {}, sceneCard: null, authorIntent: null, styleReferences: [] })
      
      onProgress?.('fastaudit')
      const fastAuditResult = await this.fastAuditAgent.audit(writerOutput.chapterText, chapterNumber)
      
      onProgress?.('complete')
      
      return {
        success: true,
        chapterNumber,
        chapterPlan,
        chapterText: writerOutput.chapterText,
        wordCount: writerOutput.wordCount,
        fastAuditResult,
        duration_ms: Date.now() - startTime,
      }
    } catch (error) {
      logger.error({ err: error }, 'Pipeline error')
      return { success: false, chapterNumber, duration_ms: Date.now() - startTime, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
}
