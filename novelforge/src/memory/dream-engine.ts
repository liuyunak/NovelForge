import { FullTextMemory } from './full-text-memory.js'
import { StateManager } from '../state/manager.js'
import { ModelRouter } from '../router.js'
import { MemoryRetriever } from './retriever.js'
import { logger } from '../logger.js'
import { jaccardSimilarity } from '../utils/similarity.js'

export interface DreamResult {
  triggerChapter: number
  chaptersIntegrated: number
  summary: string
  timestamp: string
  conflictsDetected: string[]
}

export interface DreamLog {
  id: string
  triggerChapter: number
  chaptersIntegrated: number
  summary: string
  timestamp: string
}

export class DreamEngine {
  private fullTextMemory: FullTextMemory
  private stateManager: StateManager
  private router: ModelRouter
  private dreamInterval: number
  private dreamLogs: DreamLog[]
  private retriever: MemoryRetriever | null = null
  private loadedFromDb: boolean = false

  constructor(
    fullTextMemory: FullTextMemory,
    stateManager: StateManager,
    router: ModelRouter,
    dreamInterval: number = 10
  ) {
    this.fullTextMemory = fullTextMemory
    this.stateManager = stateManager
    this.router = router
    this.dreamInterval = dreamInterval
    this.dreamLogs = []
  }

  /**
   * Set a MemoryRetriever for persistent dream log storage.
   * Call this before executeDream() if you want logs persisted to SQLite.
   */
  setRetriever(retriever: MemoryRetriever): void {
    this.retriever = retriever
  }

  /**
   * Load dream history from SQLite and merge with in-memory logs.
   * Call this after setRetriever() to restore history after service restart.
   */
  async loadHistory(): Promise<void> {
    if (!this.retriever) return

    try {
      const dbLogs = this.retriever.getDreamLogs()
      if (dbLogs.length === 0) return

      // Get existing in-memory log IDs for deduplication
      const existingIds = new Set(this.dreamLogs.map(l => l.id))

      for (const dbLog of dbLogs) {
        const logId = `dream_db_${dbLog.id}`
        if (!existingIds.has(logId)) {
          this.dreamLogs.push({
            id: logId,
            triggerChapter: dbLog.triggerChapter,
            chaptersIntegrated: this.parseChapterCount(dbLog.chaptersIntegrated),
            summary: dbLog.summary,
            timestamp: dbLog.createdAt,
          })
        }
      }

      // Sort by triggerChapter ascending (chronological order)
      this.dreamLogs.sort((a, b) => a.triggerChapter - b.triggerChapter)
      this.loadedFromDb = true

      logger.info(`[DreamEngine] Loaded ${dbLogs.length} dream logs from SQLite`)
    } catch (err) {
      logger.warn('[DreamEngine] Failed to load dream history from SQLite: %s', err)
    }
  }

  /**
   * Parse "startChapter-endChapter" string to a numeric count.
   */
  private parseChapterCount(range: string): number {
    const parts = range.split('-').map(Number)
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return Math.max(1, parts[1] - parts[0] + 1)
    }
    return 10 // default
  }

  async shouldDream(currentChapter: number): Promise<boolean> {
    return currentChapter % this.dreamInterval === 0
  }

  async executeDream(currentChapter: number): Promise<DreamResult> {
    logger.info(`Executing /dream at chapter ${currentChapter}`)
    
    const summary = await this.fullTextMemory.triggerDream()
    const chaptersIntegrated = Math.min(10, currentChapter)
    const conflictsDetected = await this.detectConflicts(currentChapter, summary)
    
    await this.updateWorkingMemory(currentChapter, summary)
    
    const log: DreamLog = {
      id: `dream_${Date.now()}`,
      triggerChapter: currentChapter,
      chaptersIntegrated,
      summary,
      timestamp: new Date().toISOString(),
    }
    this.dreamLogs.push(log)
    
    // Persist to SQLite dream_logs table if retriever is available
    if (this.retriever) {
      try {
        const startChapter = Math.max(1, currentChapter - chaptersIntegrated + 1)
        this.retriever.persistDreamLog(currentChapter, startChapter, currentChapter, summary)
      } catch (err) {
        logger.warn('[DreamEngine] Failed to persist dream log: %s', err)
      }
    }
    
    const result: DreamResult = {
      triggerChapter: currentChapter,
      chaptersIntegrated,
      summary,
      timestamp: log.timestamp,
      conflictsDetected,
    }
    
    logger.info({ summaryLength: summary.length, conflicts: conflictsDetected.length }, 'Dream completed')
    
    return result
  }

  private async detectConflicts(chapter: number, summary: string): Promise<string[]> {
    const conflicts: string[] = []
    
    try {
      const workingMemory = await this.stateManager.read('working_memory')
      const existingSummary = workingMemory.dream_summary
      
      if (existingSummary) {
        const overlap = jaccardSimilarity(existingSummary, summary)
        if (overlap > 0.8) {
          conflicts.push('新旧摘要高度重叠，可能存在重复信息')
        }
      }
      
      const characters = await this.stateManager.read('characters')
      for (const char of characters.characters.slice(0, 10)) {
        if (summary.includes(char.name) && !workingMemory.character_states?.[char.name]) {
          conflicts.push(`角色 ${char.name} 在摘要中出现但状态未记录`)
        }
      }
    } catch {
      // Ignore errors during conflict detection
    }
    
    return conflicts
  }

  private async updateWorkingMemory(chapter: number, dreamSummary: string): Promise<void> {
    try {
      const workingMemory = await this.stateManager.read('working_memory')
      
      workingMemory.dream_summary = dreamSummary
      workingMemory.updated_at = new Date().toISOString()
      
      await this.stateManager.write('working_memory', workingMemory)
    } catch (error) {
      logger.error('Failed to update working memory with dream: %s', error)
    }
  }

  async getDreamSummary(): Promise<string | null> {
    try {
      const workingMemory = await this.stateManager.read('working_memory')
      return workingMemory.dream_summary || null
    } catch {
      return null
    }
  }

  async getDreamHistory(): Promise<DreamLog[]> {
    return this.dreamLogs
  }

  async getLastDream(): Promise<DreamLog | null> {
    return this.dreamLogs.length > 0 ? this.dreamLogs[this.dreamLogs.length - 1] : null
  }
}
