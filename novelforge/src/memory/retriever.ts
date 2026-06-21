import initSqlJs, { type Database } from 'sql.js'
import { config } from '../config.js'
import type { MemoryEntry } from '../types/index.js'
import { getEmbeddingService, type EmbeddingService } from './embedding-service.js'
import { logger } from '../logger.js'

export interface EmbeddingSearchResult extends MemoryEntry {
  similarity: number
}

export class MemoryRetriever {
  private db: Database | null = null
  private dbPath: string
  private embeddingService: EmbeddingService

  constructor(dbPath?: string) {
    this.dbPath = dbPath || config.dbPath
    this.embeddingService = getEmbeddingService()
  }

  async initialize(): Promise<void> {
    const SQL = await initSqlJs()
    
    try {
      const fs = await import('fs')
      const path = await import('path')
      
      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath)
        this.db = new SQL.Database(fileBuffer)
      } else {
        this.db = new SQL.Database()
        this.createTables()
        await this.saveToFile()
      }
    } catch {
      this.db = new SQL.Database()
      this.createTables()
    }
  }

  private createTables(): void {
    if (!this.db) return

    this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('character', 'world', 'plot', 'style', 'lesson')),
        source_chapter INTEGER NOT NULL,
        last_accessed_chapter INTEGER,
        access_count INTEGER DEFAULT 0,
        importance REAL DEFAULT 0.5,
        decay_rate REAL DEFAULT 0.01,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'conflict')),
        conflicts_with TEXT,
        embedding BLOB,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    this.db.run('CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_memories_chapter ON memories(source_chapter)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status)')
  }

  async save(entry: Omit<MemoryEntry, 'id'> & { id?: string }): Promise<string> {
    if (!this.db) throw new Error('Database not initialized')

    const id = entry.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    this.db.run(
      `INSERT OR REPLACE INTO memories (id, content, category, source_chapter, importance, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, entry.content, entry.category, entry.source_chapter, entry.importance || 0.5, 'active']
    )

    await this.saveToFile()
    return id
  }

  /**
   * Save a memory entry with its embedding vector.
   * The embedding is generated via the EmbeddingService and stored in the BLOB column.
   */
  async saveWithEmbedding(entry: Omit<MemoryEntry, 'id' | 'embedding'> & { id?: string }): Promise<string> {
    if (!this.db) throw new Error('Database not initialized')

    const id = entry.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Generate embedding for the content
    const embedding = await this.embeddingService.embed(entry.content)
    const embeddingBlob = this.embeddingService.serializeVector(embedding.vector)

    this.db.run(
      `INSERT OR REPLACE INTO memories (id, content, category, source_chapter, importance, status, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, entry.content, entry.category, entry.source_chapter, entry.importance || 0.5, 'active', embeddingBlob]
    )

    await this.saveToFile()
    return id
  }

  /**
   * Batch save memories with embeddings (more efficient than individual calls).
   */
  async saveBatchWithEmbedding(entries: (Omit<MemoryEntry, 'id' | 'embedding'> & { id?: string })[]): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized')

    const ids: string[] = []

    // Generate all embeddings in batch
    const texts = entries.map(e => e.content)
    const embeddings = await this.embeddingService.embedBatch(texts)

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const id = entry.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      ids.push(id)

      const embeddingBlob = this.embeddingService.serializeVector(embeddings[i].vector)

      this.db.run(
        `INSERT OR REPLACE INTO memories (id, content, category, source_chapter, importance, status, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, entry.content, entry.category, entry.source_chapter, entry.importance || 0.5, 'active', embeddingBlob]
      )
    }

    await this.saveToFile()
    return ids
  }

  /**
   * Generate and update embedding for an existing memory by ID.
   */
  async updateEmbedding(memoryId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Get the content
    const results = this.db.exec(
      'SELECT content FROM memories WHERE id = ?',
      [memoryId]
    )

    if (!results.length || !results[0].values.length) {
      throw new Error(`Memory not found: ${memoryId}`)
    }

    const content = results[0].values[0][0] as string
    const embedding = await this.embeddingService.embed(content)
    const embeddingBlob = this.embeddingService.serializeVector(embedding.vector)

    this.db.run(
      'UPDATE memories SET embedding = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [embeddingBlob, memoryId]
    )

    await this.saveToFile()
  }

  /**
   * Semantic search using embedding similarity.
   * Returns memories ranked by cosine similarity to the query embedding.
   */
  async searchByEmbedding(query: string, options?: {
    limit?: number
    minSimilarity?: number
    category?: string
    chapterMax?: number
  }): Promise<EmbeddingSearchResult[]> {
    if (!this.db) throw new Error('Database not initialized')

    const limit = options?.limit || 10
    const minSimilarity = options?.minSimilarity || 0.3

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query)

    // Build SQL query
    let sql = `SELECT id, content, category, source_chapter, importance, embedding
               FROM memories WHERE status = 'active' AND embedding IS NOT NULL`
    const params: (string | number)[] = []

    if (options?.category) {
      sql += ' AND category = ?'
      params.push(options.category)
    }

    if (options?.chapterMax !== undefined) {
      sql += ' AND source_chapter <= ?'
      params.push(options.chapterMax)
    }

    const results = this.db.exec(sql, params)

    if (!results.length || !results[0].values.length) {
      return []
    }

    // Compute similarities
    const scored: EmbeddingSearchResult[] = []

    for (const row of results[0].values) {
      const embeddingBlob = row[5] as Uint8Array | null
      if (!embeddingBlob) continue

      try {
        const vector = this.embeddingService.deserializeVector(Buffer.from(embeddingBlob))
        const similarity = this.embeddingService.cosineSimilarity(queryEmbedding.vector, vector)

        if (similarity >= minSimilarity) {
          scored.push({
            id: row[0] as string,
            content: row[1] as string,
            category: row[2] as MemoryEntry['category'],
            source_chapter: row[3] as number,
            importance: row[4] as number,
            similarity,
          })
        }
      } catch {
        // Skip corrupted embeddings
      }
    }

    // Sort by similarity descending
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, limit)
  }

  /**
   * Hybrid search: combines keyword (LIKE) and embedding (cosine) results.
   * Merges and deduplicates, ranking by a combined score.
   */
  async hybridSearch(query: string, options?: {
    limit?: number
    category?: string
    chapterMax?: number
    keywordWeight?: number
    embeddingWeight?: number
  }): Promise<EmbeddingSearchResult[]> {
    const limit = options?.limit || 10
    const kwWeight = options?.keywordWeight || 0.3
    const embWeight = options?.embeddingWeight || 0.7

    // Run both searches in parallel
    const [keywordResults, embeddingResults] = await Promise.all([
      this.searchByContent(query, limit * 2),
      this.searchByEmbedding(query, { limit: limit * 2, category: options?.category, chapterMax: options?.chapterMax }),
    ])

    // Merge by ID, computing combined scores
    const scoreMap = new Map<string, { entry: MemoryEntry; score: number }>()

    // Add keyword results (normalize by rank)
    for (let i = 0; i < keywordResults.length; i++) {
      const m = keywordResults[i]
      const rankScore = 1 - (i / Math.max(keywordResults.length, 1))
      scoreMap.set(m.id, {
        entry: m,
        score: kwWeight * rankScore,
      })
    }

    // Add/merge embedding results
    for (let i = 0; i < embeddingResults.length; i++) {
      const m = embeddingResults[i]
      const existing = scoreMap.get(m.id)
      if (existing) {
        existing.score += embWeight * m.similarity
      } else {
        scoreMap.set(m.id, {
          entry: { id: m.id, content: m.content, category: m.category, source_chapter: m.source_chapter, importance: m.importance },
          score: embWeight * m.similarity,
        })
      }
    }

    // Convert to sorted results
    const merged: EmbeddingSearchResult[] = []
    for (const [, data] of scoreMap) {
      merged.push({ ...data.entry, similarity: data.score })
    }

    merged.sort((a, b) => b.similarity - a.similarity)
    return merged.slice(0, limit)
  }

  /**
   * Check if embeddings are populated in the database.
   */
  async hasEmbeddings(): Promise<boolean> {
    if (!this.db) return false

    const result = this.db.exec(
      'SELECT COUNT(*) as cnt FROM memories WHERE embedding IS NOT NULL AND status = \'active\''
    )
    if (!result.length || !result[0].values.length) return false
    return (result[0].values[0][0] as number) > 0
  }

  /**
   * Backfill embeddings for all memories that don't have one.
   */
  async backfillEmbeddings(onProgress?: (done: number, total: number) => void): Promise<number> {
    if (!this.db) throw new Error('Database not initialized')

    const result = this.db.exec(
      'SELECT id, content FROM memories WHERE embedding IS NULL AND status = \'active\''
    )

    if (!result.length || !result[0].values.length) return 0

    const rows = result[0].values
    const total = rows.length
    let done = 0

    for (const row of rows) {
      const id = row[0] as string
      const content = row[1] as string

      try {
        const embedding = await this.embeddingService.embed(content)
        const blob = this.embeddingService.serializeVector(embedding.vector)

        this.db.run(
          'UPDATE memories SET embedding = ?, updated_at = datetime(\'now\') WHERE id = ?',
          [blob, id]
        )
      } catch (err) {
        logger.warn(`[MemoryRetriever] Failed to backfill embedding for ${id}: %s`, err)
      }

      done++
      onProgress?.(done, total)

      // Small delay to avoid rate limiting
      if (done % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    await this.saveToFile()
    return done
  }

  async retrieveByCategory(category: string, limit: number = 10): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized')

    const results = this.db.exec(
      `SELECT id, content, category, source_chapter, importance FROM memories
       WHERE category = ? AND status = 'active'
       ORDER BY importance DESC, source_chapter DESC LIMIT ?`,
      [category, limit]
    )

    if (!results.length || !results[0].values.length) return []

    return results[0].values.map((row: any[]) => ({
      id: row[0] as string,
      content: row[1] as string,
      category: row[2] as MemoryEntry['category'],
      source_chapter: row[3] as number,
      importance: row[4] as number,
    }))
  }

  async searchByContent(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized')

    const results = this.db.exec(
      `SELECT id, content, category, source_chapter, importance FROM memories
       WHERE content LIKE ? AND status = 'active'
       ORDER BY importance DESC LIMIT ?`,
      [`%${query}%`, limit]
    )

    if (!results.length || !results[0].values.length) return []

    return results[0].values.map((row: any[]) => ({
      id: row[0] as string,
      content: row[1] as string,
      category: row[2] as MemoryEntry['category'],
      source_chapter: row[3] as number,
      importance: row[4] as number,
    }))
  }

  async getRecentMemories(chapter: number, limit: number = 20): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized')

    const results = this.db.exec(
      `SELECT id, content, category, source_chapter, importance FROM memories
       WHERE source_chapter <= ? AND status = 'active'
       ORDER BY source_chapter DESC, importance DESC LIMIT ?`,
      [chapter, limit]
    )

    if (!results.length || !results[0].values.length) return []

    return results[0].values.map((row: any[]) => ({
      id: row[0] as string,
      content: row[1] as string,
      category: row[2] as MemoryEntry['category'],
      source_chapter: row[3] as number,
      importance: row[4] as number,
    }))
  }

  async archiveOldMemories(olderThanChapter: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized')

    this.db.run(
      `UPDATE memories SET status = 'archived' WHERE source_chapter < ? AND status = 'active'`,
      [olderThanChapter]
    )

    await this.saveToFile()
    return this.db.getRowsModified()
  }

  private async saveToFile(): Promise<void> {
    if (!this.db) return
    
    try {
      const fs = await import('fs')
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
    } catch (err) {
      logger.error('Failed to save database: %s', err)
    }
  }

  // ==================== Lifecycle: Importance & Status Updates ====================

  /**
   * Update a memory's importance and optionally its status.
   */
  async updateImportance(memoryId: string, importance: number, status?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    if (status) {
      this.db.run(
        `UPDATE memories SET importance = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
        [Math.max(0, Math.min(1, importance)), status, memoryId]
      )
    } else {
      this.db.run(
        `UPDATE memories SET importance = ?, updated_at = datetime('now') WHERE id = ?`,
        [Math.max(0, Math.min(1, importance)), memoryId]
      )
    }

    await this.saveToFile()
  }

  /**
   * Archive a single memory by ID.
   */
  async archiveMemory(memoryId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    this.db.run(
      `UPDATE memories SET status = 'archived', updated_at = datetime('now') WHERE id = ?`,
      [memoryId]
    )

    await this.saveToFile()
  }

  /**
   * Mark two memories as conflicting.
   */
  async markConflict(memoryAId: string, memoryBId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    this.db.run(
      `UPDATE memories SET status = 'conflict', conflicts_with = ?, updated_at = datetime('now') WHERE id = ?`,
      [memoryBId, memoryAId]
    )

    this.db.run(
      `UPDATE memories SET status = 'conflict', conflicts_with = ?, updated_at = datetime('now') WHERE id = ?`,
      [memoryAId, memoryBId]
    )

    await this.saveToFile()
  }

  /**
   * Clear conflict status from a memory.
   */
  async clearConflict(memoryId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    this.db.run(
      `UPDATE memories SET status = 'active', conflicts_with = NULL, updated_at = datetime('now') WHERE id = ?`,
      [memoryId]
    )

    await this.saveToFile()
  }

  // ==================== Access Tracking ====================

  /**
   * Record that a set of memories was accessed at the given chapter.
   * Updates access_count and last_accessed_chapter.
   */
  async recordAccess(memoryIds: string[], chapter: number): Promise<void> {
    if (!this.db) return

    for (const id of memoryIds) {
      this.db.run(
        `UPDATE memories
         SET access_count = COALESCE(access_count, 0) + 1,
             last_accessed_chapter = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        [chapter, id]
      )
    }

    // Don't save to file on every access read — save on next write
  }

  // ==================== Get By ID ====================

  /**
   * Retrieve a single memory by its ID.
   */
  async getById(memoryId: string): Promise<MemoryEntry | null> {
    if (!this.db) throw new Error('Database not initialized')

    const results = this.db.exec(
      'SELECT id, content, category, source_chapter, importance FROM memories WHERE id = ?',
      [memoryId]
    )

    if (!results.length || !results[0].values.length) return null

    const row = results[0].values[0]
    return {
      id: row[0] as string,
      content: row[1] as string,
      category: row[2] as MemoryEntry['category'],
      source_chapter: row[3] as number,
      importance: row[4] as number,
    }
  }

  // ==================== Utility ====================

  /** Expose the DB path for conflict store persistence. */
  getDbPath(): string {
    return this.dbPath
  }

  /**
   * Get all active memories (no chapter filter), ordered by importance desc.
   */
  async getAllActive(limit: number = 50): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized')

    const results = this.db.exec(
      `SELECT id, content, category, source_chapter, importance FROM memories
       WHERE status = 'active'
       ORDER BY importance DESC, source_chapter DESC LIMIT ?`,
      [limit]
    )

    if (!results.length || !results[0].values.length) return []

    return results[0].values.map((row: any[]) => ({
      id: row[0] as string,
      content: row[1] as string,
      category: row[2] as MemoryEntry['category'],
      source_chapter: row[3] as number,
      importance: row[4] as number,
    }))
  }

  /**
   * Get memory statistics: total active, by category, by status.
   */
  async getMemoryStats(): Promise<{
    total: number
    active: number
    archived: number
    conflict: number
    byCategory: Record<string, number>
    avgImportance: number
  }> {
    if (!this.db) {
      return { total: 0, active: 0, archived: 0, conflict: 0, byCategory: {}, avgImportance: 0 }
    }

    const statusResult = this.db.exec(
      `SELECT status, COUNT(*) as cnt FROM memories GROUP BY status`
    )
    const categoryResult = this.db.exec(
      `SELECT category, COUNT(*) as cnt FROM memories WHERE status = 'active' GROUP BY category`
    )
    const avgResult = this.db.exec(
      `SELECT AVG(importance) as avg_imp FROM memories WHERE status = 'active'`
    )

    const byStatus: Record<string, number> = { active: 0, archived: 0, conflict: 0 }
    if (statusResult.length && statusResult[0].values.length) {
      for (const row of statusResult[0].values) {
        byStatus[row[0] as string] = row[1] as number
      }
    }

    const byCategory: Record<string, number> = {}
    if (categoryResult.length && categoryResult[0].values.length) {
      for (const row of categoryResult[0].values) {
        byCategory[row[0] as string] = row[1] as number
      }
    }

    let avgImportance = 0
    if (avgResult.length && avgResult[0].values.length && avgResult[0].values[0][0] !== null) {
      avgImportance = avgResult[0].values[0][0] as number
    }

    return {
      total: byStatus.active + byStatus.archived + byStatus.conflict,
      active: byStatus.active || 0,
      archived: byStatus.archived || 0,
      conflict: byStatus.conflict || 0,
      byCategory,
      avgImportance,
    }
  }

  /**
   * Persist a dream execution log to the dream_logs table.
   */
  persistDreamLog(
    triggerChapter: number,
    startChapter: number,
    endChapter: number,
    summary: string
  ): void {
    if (!this.db) return

    // Ensure dream_logs table exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS dream_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_chapter INTEGER NOT NULL,
        chapters_integrated TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    const chaptersIntegrated = `${startChapter}-${endChapter}`
    this.db.run(
      `INSERT INTO dream_logs (trigger_chapter, chapters_integrated, summary)
       VALUES (?, ?, ?)`,
      [triggerChapter, chaptersIntegrated, summary]
    )

    this.saveToFile().catch(err =>
      logger.warn('[MemoryRetriever] Failed to persist dream log: %s', err)
    )
  }

  /**
   * Get all dream logs ordered by trigger chapter descending.
   */
  getDreamLogs(): Array<{
    id: number
    triggerChapter: number
    chaptersIntegrated: string
    summary: string
    createdAt: string
  }> {
    if (!this.db) return []

    // Ensure table exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS dream_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_chapter INTEGER NOT NULL,
        chapters_integrated TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    const results = this.db.exec(
      `SELECT id, trigger_chapter, chapters_integrated, summary, created_at
       FROM dream_logs ORDER BY trigger_chapter DESC`
    )

    if (!results.length || !results[0].values.length) return []

    return results[0].values.map((row: any[]) => ({
      id: row[0] as number,
      triggerChapter: row[1] as number,
      chaptersIntegrated: row[2] as string,
      summary: row[3] as string,
      createdAt: row[4] as string,
    }))
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.saveToFile()
      this.db.close()
      this.db = null
    }
  }
}
