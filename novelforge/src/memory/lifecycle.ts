import { MemoryRetriever } from './retriever.js'
import type { MemoryEntry } from '../types/index.js'
import { logger } from '../logger.js'
import { jaccardSimilarity } from '../utils/similarity.js'

// ==================== Configuration ====================

export interface DecayConfig {
  /** Global default decay rate per cycle (applied to each memory) */
  decayRate: number
  /** Importance below which a memory is considered "inactive" */
  minImportance: number
  /** Importance below which a memory is archived (hard floor) */
  archiveThreshold: number
  /** Per-category decay multipliers (e.g. plot facts decay slower than style notes) */
  categoryDecayMultipliers: Record<MemoryEntry['category'], number>
  /** Max age (in chapters) before forced archival regardless of importance */
  maxChapterAge: number
  /**
   * Decay curve mode:
   *   - 'linear': newImportance = importance - (decayRate * multiplier)  (original behavior)
   *   - 'ebbinghaus': newImportance = importance * e^(-decayRate * multiplier * chapterAge)
   *     Uses exponential decay — memories decay rapidly at first, then slow down.
   */
  decayCurve: 'linear' | 'ebbinghaus'
  /**
   * Access frequency modifier: each access_count reduces effective decay rate.
   *   effectiveDecay = decayRate / (1 + accessCount * accessFrequencyModifier)
   * Set to 0 to disable access-frequency feedback.
   */
  accessFrequencyModifier: number
}

export interface ConflictRecord {
  id: string
  memoryAId: string
  memoryBId: string
  type: 'character_conflict' | 'world_conflict' | 'plot_conflict' | 'general_conflict'
  description: string
  similarity: number
  detectedChapter: number
  resolved: boolean
  resolution?: 'keep_a' | 'keep_b' | 'merge' | 'keep_both' | 'manual'
  resolvedChapter?: number
  timestamp: string
}

export interface MergeResult {
  merged: MemoryEntry
  sourceIds: string[]
  mergedCount: number
}

export interface ForgetResult {
  forgottenIds: string[]
  reason: 'decay' | 'duplicate' | 'age' | 'manual' | 'low_importance'
}

export interface LifecycleStats {
  totalMemories: number
  activeMemories: number
  archivedMemories: number
  conflictMemories: number
  decayedThisCycle: number
  mergedThisCycle: number
  forgottenThisCycle: number
  avgImportance: number
}

// ==================== Default Configuration ====================

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  decayRate: 0.01,
  minImportance: 0.1,
  archiveThreshold: 0.05,
  categoryDecayMultipliers: {
    character: 0.5,   // character facts decay slowly
    world: 0.6,       // world-building is fairly stable
    plot: 1.0,        // plot events decay at normal rate
    style: 1.5,       // style patterns may change, decay faster
    lesson: 0.4,      // learned lessons should persist
  },
  maxChapterAge: 50,
  decayCurve: 'ebbinghaus',
  accessFrequencyModifier: 0.05,
}

// ==================== MemoryLifecycle ====================

export class MemoryLifecycle {
  private retriever: MemoryRetriever
  private decayInterval: ReturnType<typeof setInterval> | null = null
  private config: DecayConfig
  private conflictStore: Map<string, ConflictRecord> = new Map()
  private stats: LifecycleStats

  constructor(retriever: MemoryRetriever, config?: Partial<DecayConfig>) {
    this.retriever = retriever
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config }
    this.stats = this.createEmptyStats()
  }

  // ==================== Initialization ====================

  async initialize(): Promise<void> {
    await this.retriever.initialize()
    await this.loadConflictStore()
    this.resetCycleStats()
  }

  // ==================== Decay Management ====================

  startDecayCheck(intervalMs: number = 3600000): void {
    if (this.decayInterval) {
      clearInterval(this.decayInterval)
    }
    this.decayInterval = setInterval(() => {
      this.applyDecay()
    }, intervalMs)
    logger.info(`[MemoryLifecycle] Decay check started (interval: ${intervalMs}ms)`)
  }

  stopDecayCheck(): void {
    if (this.decayInterval) {
      clearInterval(this.decayInterval)
      this.decayInterval = null
      logger.info('[MemoryLifecycle] Decay check stopped')
    }
  }

  /**
   * Apply decay to all active memories and persist changes to database.
   *
   * Two decay curve modes:
   *
   * 1) Ebbinghaus (default): newImportance = importance * e^(-decayRate * multiplier * chapterAge)
   *    - Exponential decay — memories decay rapidly at first, then slow down.
   *    - chapterAge = (currentChapter - source_chapter) clamped to [1, maxChapterAge]
   *
   * 2) Linear: newImportance = importance - (decayRate * multiplier)  (original behavior)
   *
   * Access frequency feedback:
   *    effectiveDecay = baseDecay / (1 + accessCount * accessFrequencyModifier)
   *    Frequently accessed memories decay slower.
   *
   * Side effects:
   *  - Memories below archiveThreshold are archived
   *  - Memories below minImportance but above archiveThreshold stay active (soft inactive)
   *  - Memories past maxChapterAge are force-archived
   *  - All importance changes are written back to DB
   */
  async applyDecay(): Promise<{ decayed: number; archived: number; forcedArchived: number }> {
    const curveLabel = this.config.decayCurve === 'ebbinghaus' ? 'Ebbinghaus' : 'Linear'
    logger.info(`[MemoryLifecycle] Applying memory decay (${curveLabel} curve)...`)

    // Get all active memories (up to 10000, but in practice much less)
    const memories = await this.retriever.getRecentMemories(99999, 10000)
    let decayed = 0
    let archived = 0
    let forcedArchived = 0

    const currentChapter = this.getLastKnownChapter()

    for (const memory of memories) {
      const categoryMultiplier = this.config.categoryDecayMultipliers[memory.category] || 1.0

      // Access frequency modifier: frequently accessed memories decay slower
      const accessCount = (memory as any).access_count || 0
      const accessModifier = this.config.accessFrequencyModifier > 0
        ? 1 / (1 + accessCount * this.config.accessFrequencyModifier)
        : 1

      let newImportance: number

      if (this.config.decayCurve === 'ebbinghaus') {
        // Ebbinghaus forgetting curve: exponential decay
        // newImportance = importance * e^(-rate * multiplier * chapterAge * accessModifier)
        const chapterAge = Math.max(1, Math.min(currentChapter - memory.source_chapter, this.config.maxChapterAge))
        const effectiveRate = this.config.decayRate * categoryMultiplier * accessModifier
        newImportance = memory.importance * Math.exp(-effectiveRate * chapterAge)
      } else {
        // Linear decay (original formula)
        const effectiveDecay = this.config.decayRate * categoryMultiplier * accessModifier
        newImportance = Math.max(0, memory.importance - effectiveDecay)
      }

      // Clamp to [0, 1]
      newImportance = Math.max(0, Math.min(1, newImportance))

      // Check chapter age
      const ageExceeded = memory.source_chapter < (currentChapter - this.config.maxChapterAge)

      if (ageExceeded) {
        // Force archive: too old
        await this.retriever.updateImportance(memory.id, newImportance, 'archived')
        forcedArchived++
      } else if (newImportance <= this.config.archiveThreshold) {
        // Archive: importance too low
        await this.retriever.updateImportance(memory.id, newImportance, 'archived')
        archived++
      } else if (Math.abs(newImportance - memory.importance) > 0.0001) {
        // Decay but keep active (only update if actually changed)
        await this.retriever.updateImportance(memory.id, newImportance)
        decayed++
      }
    }

    this.stats.decayedThisCycle = decayed + archived + forcedArchived

    logger.info(
      `[MemoryLifecycle] Decay applied (${curveLabel}): ${decayed} decayed, ${archived} archived, ${forcedArchived} force-archived`
    )

    return { decayed, archived, forcedArchived }
  }

  private lastKnownChapter = 0

  /** Called by onChapterWrite to track current chapter for age calculation */
  private trackChapter(chapter: number): void {
    if (chapter > this.lastKnownChapter) {
      this.lastKnownChapter = chapter
    }
  }

  private getLastKnownChapter(): number {
    return this.lastKnownChapter
  }

  // ==================== Chapter Write Handler ====================

  async onChapterWrite(
    chapter: number,
    facts: MemoryEntry[],
    generateEmbeddings: boolean = true
  ): Promise<ConflictRecord[]> {
    this.trackChapter(chapter)
    this.resetCycleStats()

    // Step 1: Detect conflicts
    const conflicts = await this.detectConflicts(facts, chapter)

    // Step 2: Merge similar facts within the batch itself (de-duplicate)
    const dedupedFacts = await this.deduplicateBatch(facts)

    // Step 3: Save facts with conflict-boosted importance
    for (const fact of dedupedFacts) {
      const conflict = conflicts.find(c => c.memoryBId === fact.id || c.memoryAId === fact.id)
      if (conflict) {
        fact.importance = Math.min(1, fact.importance + 0.2)
      }

      if (generateEmbeddings) {
        await this.retriever.saveWithEmbedding({
          ...fact,
          source_chapter: chapter,
        })
      } else {
        await this.retriever.save({
          ...fact,
          source_chapter: chapter,
        })
      }
    }

    // Step 4: Persist conflicts
    for (const conflict of conflicts) {
      this.conflictStore.set(conflict.id, conflict)
    }
    await this.persistConflictStore()

    // Step 5: Mark conflicting memories in DB
    for (const conflict of conflicts) {
      await this.retriever.markConflict(conflict.memoryAId, conflict.memoryBId)
    }

    logger.info(
      `[MemoryLifecycle] Chapter ${chapter}: saved ${dedupedFacts.length} facts (${facts.length - dedupedFacts.length} deduped), ${conflicts.length} conflicts`
    )

    return conflicts
  }

  // ==================== Conflict Detection ====================

  private async detectConflicts(
    newFacts: MemoryEntry[],
    chapter: number
  ): Promise<ConflictRecord[]> {
    const conflicts: ConflictRecord[] = []

    for (const fact of newFacts) {
      // Search existing memories for potential conflicts
      const existing = await this.retriever.searchByContent(fact.content.substring(0, 30), 5)

      for (const ex of existing) {
        if (ex.category === fact.category && ex.id !== fact.id) {
          const similarity = jaccardSimilarity(fact.content, ex.content)

          // Conflict: similar enough to be related, different enough to contradict
          if (similarity > 0.6 && similarity < 0.95) {
            const conflictType = this.getConflictType(fact, ex)

            // Check if already recorded
            const existingConflict = await this.findExistingConflict(ex.id, fact.id)
            if (existingConflict && existingConflict.resolved) {
              continue // Already resolved
            }

            if (!existingConflict) {
              conflicts.push({
                id: `conf_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
                memoryAId: ex.id,
                memoryBId: fact.id,
                type: conflictType,
                description: `Conflicting ${fact.category} facts: "${ex.content.substring(0, 50)}..." vs "${fact.content.substring(0, 50)}..."`,
                similarity,
                detectedChapter: chapter,
                resolved: false,
                timestamp: new Date().toISOString(),
              })
            }
          }
        }
      }
    }

    return conflicts
  }

  private async findExistingConflict(memA: string, memB: string): Promise<ConflictRecord | undefined> {
    for (const [, conf] of this.conflictStore) {
      if (
        (conf.memoryAId === memA && conf.memoryBId === memB) ||
        (conf.memoryAId === memB && conf.memoryBId === memA)
      ) {
        return conf
      }
    }
    return undefined
  }

  private getConflictType(newFact: MemoryEntry, existingFact: MemoryEntry): ConflictRecord['type'] {
    if (newFact.category === 'character' && existingFact.category === 'character') {
      return 'character_conflict'
    }
    if (newFact.category === 'world' && existingFact.category === 'world') {
      return 'world_conflict'
    }
    if (newFact.category === 'plot' && existingFact.category === 'plot') {
      return 'plot_conflict'
    }
    return 'general_conflict'
  }

  /**
   * Resolve a specific conflict.
   */
  async resolveConflict(
    conflictId: string,
    resolution: ConflictRecord['resolution']
  ): Promise<boolean> {
    const conflict = this.conflictStore.get(conflictId)
    if (!conflict) return false

    conflict.resolved = true
    conflict.resolution = resolution
    conflict.resolvedChapter = this.lastKnownChapter

    this.conflictStore.set(conflictId, conflict)

    // If resolution is "merge", perform the merge
    if (resolution === 'merge') {
      await this.mergeMemories(conflict.memoryAId, conflict.memoryBId)
    }

    // If resolution is "keep_a" or "keep_b", archive the other
    if (resolution === 'keep_a') {
      await this.retriever.archiveMemory(conflict.memoryBId)
    } else if (resolution === 'keep_b') {
      await this.retriever.archiveMemory(conflict.memoryAId)
    }

    // Clear conflict status from both memories
    await this.retriever.clearConflict(conflict.memoryAId)
    await this.retriever.clearConflict(conflict.memoryBId)

    await this.persistConflictStore()
    return true
  }

  // ==================== Memory Merge ====================

  /**
   * Public API: manually merge two memories by ID.
   * Returns the merged result or null if either memory doesn't exist.
   */
  async mergeMemoriesById(memoryAId: string, memoryBId: string): Promise<MergeResult | null> {
    const result = await this.mergeMemories(memoryAId, memoryBId)
    if (result) {
      this.stats.mergedThisCycle++
    }
    return result
  }

  /**
   * Merge two memories into one, combining their content and taking the higher importance.
   */
  private async mergeMemories(memoryAId: string, memoryBId: string): Promise<MergeResult | null> {
    const [memA, memB] = await Promise.all([
      this.retriever.getById(memoryAId),
      this.retriever.getById(memoryBId),
    ])

    if (!memA || !memB) return null

    const mergedContent = this.combineMemoryContent(memA, memB)
    const mergedImportance = Math.max(memA.importance, memB.importance) + 0.1

    const merged: Omit<MemoryEntry, 'id'> = {
      content: mergedContent,
      category: memA.category,
      source_chapter: Math.min(memA.source_chapter, memB.source_chapter),
      importance: Math.min(1, mergedImportance),
    }

    // Save the merged memory
    const newId = await this.retriever.saveWithEmbedding(merged)
    // Archive the originals
    await this.retriever.archiveMemory(memoryAId)
    await this.retriever.archiveMemory(memoryBId)

    return {
      merged: { ...merged, id: newId },
      sourceIds: [memoryAId, memoryBId],
      mergedCount: 2,
    }
  }

  /**
   * Combine two memory contents intelligently.
   * If B is an update of A (same subject, newer info), keep B as primary and note A as history.
   */
  private combineMemoryContent(memA: MemoryEntry, memB: MemoryEntry): string {
    const sim = jaccardSimilarity(memA.content, memB.content)

    if (sim > 0.85) {
      // Very similar — keep the longer/newer one
      return memB.content.length >= memA.content.length ? memB.content : memA.content
    }

    // Moderately similar — combine both, prioritizing B (newer)
    return `${memB.content}\n[相关历史: ${memA.content.substring(0, 200)}]`
  }

  /**
   * De-duplicate facts within a single batch before saving.
   * Uses Jaccard similarity with a higher threshold to avoid saving near-identical facts.
   */
  private async deduplicateBatch(facts: MemoryEntry[]): Promise<MemoryEntry[]> {
    if (facts.length <= 1) return facts

    const result: MemoryEntry[] = []
    const seen = new Set<number>()

    for (let i = 0; i < facts.length; i++) {
      if (seen.has(i)) continue
      let kept = facts[i]

      for (let j = i + 1; j < facts.length; j++) {
        if (seen.has(j)) continue
        const sim = jaccardSimilarity(facts[i].content, facts[j].content)

        if (sim > 0.85) {
          // Merge: keep the one with higher importance, combine content
          const better = facts[i].importance >= facts[j].importance ? facts[i] : facts[j]
          const worse = facts[i].importance >= facts[j].importance ? facts[j] : facts[i]
          kept = {
            ...better,
            content: this.combineMemoryContent(better, worse),
            importance: Math.min(1, Math.max(better.importance, worse.importance) + 0.05),
          }
          seen.add(j)
          this.stats.mergedThisCycle++
        }
      }
      result.push(kept)
    }

    return result
  }

  // ==================== Forget (Active Forgetting) ====================

  /**
   * Actively forget memories based on a strategy.
   *
   * Strategies:
   *  - 'decay': archive all memories below minImportance
   *  - 'age': archive memories older than maxChapterAge
   *  - 'low_importance': archive the bottom N% by importance
   *  - 'duplicate': find and merge/archive near-duplicate memories
   *  - 'manual': forget specific memory IDs
   */
  async forget(options: {
    strategy: 'decay' | 'age' | 'low_importance' | 'duplicate'
    threshold?: number  // for low_importance: bottom percentile (default 10)
    dryRun?: boolean
  }): Promise<ForgetResult>

  async forget(options: {
    strategy: 'manual'
    memoryIds: string[]
    dryRun?: boolean
  }): Promise<ForgetResult>

  async forget(options: {
    strategy: ForgetResult['reason']
    memoryIds?: string[]
    threshold?: number
    dryRun?: boolean
  }): Promise<ForgetResult> {
    const result: ForgetResult = {
      forgottenIds: [],
      reason: options.strategy,
    }

    switch (options.strategy) {
      case 'decay': {
        const memories = await this.retriever.getRecentMemories(99999, 5000)
        for (const m of memories) {
          if (m.importance < this.config.minImportance) {
            result.forgottenIds.push(m.id)
            if (!options.dryRun) await this.retriever.archiveMemory(m.id)
          }
        }
        break
      }

      case 'age': {
        const memories = await this.retriever.getRecentMemories(99999, 5000)
        for (const m of memories) {
          if (m.source_chapter < this.lastKnownChapter - this.config.maxChapterAge) {
            result.forgottenIds.push(m.id)
            if (!options.dryRun) await this.retriever.archiveMemory(m.id)
          }
        }
        break
      }

      case 'low_importance': {
        const percentile = options.threshold || 10
        const memories = await this.retriever.getRecentMemories(99999, 5000)
        // Sort by importance ascending, take bottom N%
        const sorted = memories.sort((a, b) => a.importance - b.importance)
        const cutoff = Math.floor(sorted.length * percentile / 100)
        for (let i = 0; i < cutoff; i++) {
          result.forgottenIds.push(sorted[i].id)
          if (!options.dryRun) await this.retriever.archiveMemory(sorted[i].id)
        }
        break
      }

      case 'duplicate': {
        const memories = await this.retriever.getRecentMemories(99999, 1000)
        const forgotten = new Set<string>()
        for (let i = 0; i < memories.length; i++) {
          if (forgotten.has(memories[i].id)) continue
          for (let j = i + 1; j < memories.length; j++) {
            if (forgotten.has(memories[j].id)) continue
            const sim = jaccardSimilarity(memories[i].content, memories[j].content)
            if (sim > 0.9) {
              // Keep the one with higher importance, forget the other
              const toForget = memories[i].importance >= memories[j].importance ? memories[j] : memories[i]
              forgotten.add(toForget.id)
              result.forgottenIds.push(toForget.id)
              if (!options.dryRun) await this.retriever.archiveMemory(toForget.id)
            }
          }
        }
        break
      }

      case 'manual': {
        if (options.memoryIds) {
          result.forgottenIds = options.memoryIds
          if (!options.dryRun) {
            for (const id of options.memoryIds) {
              await this.retriever.archiveMemory(id)
            }
          }
        }
        break
      }
    }

    this.stats.forgottenThisCycle = result.forgottenIds.length

    if (options.dryRun) {
      logger.info(`[MemoryLifecycle] Forget dry-run (${options.strategy}): would forget ${result.forgottenIds.length} memories`)
    } else {
      logger.info(`[MemoryLifecycle] Forget (${options.strategy}): forgot ${result.forgottenIds.length} memories`)
    }

    return result
  }

  // ==================== Memory Retrieval ====================

  async getRelevantMemories(
    chapter: number,
    context: string,
    useSemanticSearch: boolean = true
  ): Promise<MemoryEntry[]> {
    const recent = await this.retriever.getRecentMemories(chapter, 10)

    // Update access tracking for retrieved memories
    await this.retriever.recordAccess(recent.map(m => m.id), chapter)

    let semanticMatches: MemoryEntry[] = []
    if (useSemanticSearch) {
      try {
        const hasEmbeddings = await this.retriever.hasEmbeddings()
        if (hasEmbeddings) {
          semanticMatches = await this.retriever.hybridSearch(context, {
            limit: 10,
            chapterMax: chapter,
          })
        } else {
          semanticMatches = await this.retriever.searchByContent(context, 5)
        }
      } catch {
        semanticMatches = await this.retriever.searchByContent(context, 5)
      }
    } else {
      semanticMatches = await this.retriever.searchByContent(context, 5)
    }

    // Update access tracking for semantic matches too
    await this.retriever.recordAccess(semanticMatches.map(m => m.id), chapter)

    const combined = [...recent, ...semanticMatches]
    const unique = combined.filter((m, i, arr) =>
      arr.findIndex(x => x.id === m.id) === i
    )

    return unique.sort((a, b) => b.importance - a.importance).slice(0, 15)
  }

  // ==================== Statistics ====================

  async getConflictStats(): Promise<{ total: number; active: number; archived: number; conflictCount: number }> {
    const all = await this.retriever.getRecentMemories(99999, 10000)
    const activeConflicts = [...this.conflictStore.values()].filter(c => !c.resolved)
    return {
      total: all.length,
      active: all.filter(m => m.importance >= this.config.minImportance).length,
      archived: all.filter(m => m.importance < this.config.minImportance).length,
      conflictCount: activeConflicts.length,
    }
  }

  getLifecycleStats(): LifecycleStats {
    return { ...this.stats }
  }

  async refreshStats(): Promise<void> {
    const all = await this.retriever.getRecentMemories(99999, 10000)
    const active = all.filter(m => m.importance >= this.config.minImportance)
    this.stats.totalMemories = all.length
    this.stats.activeMemories = active.length
    this.stats.archivedMemories = all.length - active.length
    this.stats.avgImportance = all.length > 0
      ? all.reduce((sum, m) => sum + m.importance, 0) / all.length
      : 0
  }

  private resetCycleStats(): void {
    this.stats.decayedThisCycle = 0
    this.stats.mergedThisCycle = 0
    this.stats.forgottenThisCycle = 0
  }

  private createEmptyStats(): LifecycleStats {
    return {
      totalMemories: 0,
      activeMemories: 0,
      archivedMemories: 0,
      conflictMemories: 0,
      decayedThisCycle: 0,
      mergedThisCycle: 0,
      forgottenThisCycle: 0,
      avgImportance: 0,
    }
  }

  // ==================== Conflict Store ====================

  /**
   * Get all unresolved conflicts.
   */
  getUnresolvedConflicts(): ConflictRecord[] {
    return [...this.conflictStore.values()].filter(c => !c.resolved)
  }

  /**
   * Get all conflicts (resolved + unresolved).
   */
  getAllConflicts(): ConflictRecord[] {
    return [...this.conflictStore.values()]
  }

  /**
   * Get a specific conflict by ID.
   */
  getConflict(conflictId: string): ConflictRecord | undefined {
    return this.conflictStore.get(conflictId)
  }

  private async persistConflictStore(): Promise<void> {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const dbPath = this.retriever.getDbPath()
      const dir = path.dirname(dbPath)
      const conflictPath = path.join(dir, 'conflicts.json')
      const data = JSON.stringify([...this.conflictStore.values()], null, 2)
      fs.writeFileSync(conflictPath, data)
    } catch (err) {
      logger.error('[MemoryLifecycle] Failed to persist conflict store: %s', err)
    }
  }

  private async loadConflictStore(): Promise<void> {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const dbPath = this.retriever.getDbPath()
      const dir = path.dirname(dbPath)
      const conflictPath = path.join(dir, 'conflicts.json')

      if (fs.existsSync(conflictPath)) {
        const raw = fs.readFileSync(conflictPath, 'utf-8')
        const records: ConflictRecord[] = JSON.parse(raw)
        for (const record of records) {
          this.conflictStore.set(record.id, record)
        }
        logger.info(`[MemoryLifecycle] Loaded ${this.conflictStore.size} conflict records`)
      }
    } catch {
      // No conflicts file yet — that's fine
    }
  }

  // ==================== Cleanup ====================

  async close(): Promise<void> {
    this.stopDecayCheck()
    await this.persistConflictStore()
  }
}
