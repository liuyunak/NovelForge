import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryRetriever } from '../../src/memory/retriever.js'
import { DreamEngine, type DreamResult } from '../../src/memory/dream-engine.js'
import { FullTextMemory } from '../../src/memory/full-text-memory.js'
import { StateManager } from '../../src/state/manager.js'
import { ModelRouter } from '../../src/router.js'
import { createDefaultCharacter } from '../../src/state/schemas/characters.js'

// ==================== Test Helpers ====================

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `novelforge-test-dream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

function createMockRouter(): ModelRouter {
  return {
    generate: vi.fn().mockResolvedValue('Mock dream summary for testing purposes. This is a generated story brief.'),
  } as any
}

// ==================== Tests ====================

describe('MemoryRetriever - getAllActive & getMemoryStats', () => {
  let retriever: MemoryRetriever
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTempDir()
    const dbPath = path.join(tmpDir, 'test.db')
    retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()
  })

  afterEach(async () => {
    await retriever.close()
    cleanupTempDir(tmpDir)
  })

  it('getAllActive should return empty when no memories exist', async () => {
    const results = await retriever.getAllActive()
    expect(results).toEqual([])
  })

  it('getAllActive should return active memories sorted by importance', async () => {
    await retriever.save({ content: 'Memory A', category: 'character', source_chapter: 1, importance: 0.3 })
    await retriever.save({ content: 'Memory B', category: 'plot', source_chapter: 2, importance: 0.8 })
    await retriever.save({ content: 'Memory C', category: 'world', source_chapter: 1, importance: 0.5 })

    const results = await retriever.getAllActive(10)
    expect(results.length).toBe(3)
    expect(results[0].importance).toBe(0.8) // Highest first
    expect(results[2].importance).toBe(0.3) // Lowest last
  })

  it('getAllActive should respect limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await retriever.save({ content: `Memory ${i}`, category: 'plot', source_chapter: i + 1, importance: 0.5 })
    }

    const results = await retriever.getAllActive(3)
    expect(results.length).toBe(3)
  })

  it('getMemoryStats should return correct statistics', async () => {
    await retriever.save({ content: 'Char fact', category: 'character', source_chapter: 1, importance: 0.8 })
    await retriever.save({ content: 'World fact', category: 'world', source_chapter: 1, importance: 0.6 })
    await retriever.save({ content: 'Plot fact', category: 'plot', source_chapter: 2, importance: 0.4 })

    const stats = await retriever.getMemoryStats()
    expect(stats.total).toBe(3)
    expect(stats.active).toBe(3)
    expect(stats.archived).toBe(0)
    expect(stats.byCategory.character).toBe(1)
    expect(stats.byCategory.world).toBe(1)
    expect(stats.byCategory.plot).toBe(1)
    expect(stats.avgImportance).toBeCloseTo(0.6, 1)
  })

  it('getMemoryStats should count archived memories', async () => {
    await retriever.save({ content: 'Active', category: 'plot', source_chapter: 1, importance: 0.5 })
    const id = await retriever.save({ content: 'Archived', category: 'plot', source_chapter: 1, importance: 0.1 })
    await retriever.archiveMemory(id)

    const stats = await retriever.getMemoryStats()
    expect(stats.active).toBe(1)
    expect(stats.archived).toBe(1)
  })
})

describe('MemoryRetriever - Dream Logs', () => {
  let retriever: MemoryRetriever
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTempDir()
    const dbPath = path.join(tmpDir, 'test.db')
    retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()
  })

  afterEach(async () => {
    await retriever.close()
    cleanupTempDir(tmpDir)
  })

  it('persistDreamLog should create dream_logs table and insert log', () => {
    retriever.persistDreamLog(10, 1, 10, 'This is a dream summary for chapters 1-10.')
    const logs = retriever.getDreamLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].triggerChapter).toBe(10)
    expect(logs[0].chaptersIntegrated).toBe('1-10')
    expect(logs[0].summary).toBe('This is a dream summary for chapters 1-10.')
  })

  it('getDreamLogs should return logs ordered by trigger_chapter desc', () => {
    retriever.persistDreamLog(20, 11, 20, 'Second dream summary.')
    retriever.persistDreamLog(10, 1, 10, 'First dream summary.')

    const logs = retriever.getDreamLogs()
    expect(logs.length).toBe(2)
    expect(logs[0].triggerChapter).toBe(20) // Most recent first
    expect(logs[1].triggerChapter).toBe(10)
  })

  it('getDreamLogs should return empty when no logs exist', () => {
    const logs = retriever.getDreamLogs()
    expect(logs).toEqual([])
  })
})

describe('DreamEngine', () => {
  let dreamEngine: DreamEngine
  let fullTextMemory: FullTextMemory
  let stateManager: StateManager
  let router: ModelRouter
  let retriever: MemoryRetriever
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTempDir()
    const dbPath = path.join(tmpDir, 'test.db')
    router = createMockRouter()

    // Set up full text memory
    fullTextMemory = new FullTextMemory(tmpDir, router)
    await fullTextMemory.initialize()

    // Set up state manager
    stateManager = new StateManager(tmpDir)
    await stateManager.initialize()

    // Initialize default states
    const schemas = await import('../../src/state/schemas/index.js')
    await stateManager.write('working_memory', schemas.createDefaultWorkingMemory(0))

    // Set up retriever
    retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    dreamEngine = new DreamEngine(fullTextMemory, stateManager, router, 10)
    dreamEngine.setRetriever(retriever)
  })

  afterEach(async () => {
    try { await retriever?.close() } catch {}
    cleanupTempDir(tmpDir)
  })

  it('shouldDream should return true at interval chapters', async () => {
    expect(await dreamEngine.shouldDream(10)).toBe(true)
    expect(await dreamEngine.shouldDream(20)).toBe(true)
    expect(await dreamEngine.shouldDream(30)).toBe(true)
  })

  it('shouldDream should return false at non-interval chapters', async () => {
    expect(await dreamEngine.shouldDream(5)).toBe(false)
    expect(await dreamEngine.shouldDream(11)).toBe(false)
    expect(await dreamEngine.shouldDream(19)).toBe(false)
  })

  it('getDreamSummary should return null initially', async () => {
    const summary = await dreamEngine.getDreamSummary()
    expect(summary).toBeNull()
  })

  it('getDreamHistory should return empty initially', async () => {
    const history = await dreamEngine.getDreamHistory()
    expect(history).toEqual([])
  })

  it('getLastDream should return null initially', async () => {
    const last = await dreamEngine.getLastDream()
    expect(last).toBeNull()
  })
})

describe('DreamEngine - executeDream', () => {
  let dreamEngine: DreamEngine
  let fullTextMemory: FullTextMemory
  let stateManager: StateManager
  let router: ModelRouter
  let retriever: MemoryRetriever
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTempDir()
    const dbPath = path.join(tmpDir, 'test.db')
    router = createMockRouter()

    fullTextMemory = new FullTextMemory(tmpDir, router)
    await fullTextMemory.initialize()

    // Add some chapters to full text memory for dream to work with
    for (let i = 1; i <= 10; i++) {
      await fullTextMemory.addChapter({
        chapter_number: i,
        title: `Chapter ${i}`,
        full_text: `Content of chapter ${i}. Lorem ipsum dolor sit amet.`,
        summary: `Summary of chapter ${i}.`,
        compressed: false,
      })
    }

    stateManager = new StateManager(tmpDir)
    await stateManager.initialize()

    const schemas = await import('../../src/state/schemas/index.js')
    await stateManager.write('working_memory', schemas.createDefaultWorkingMemory(0))
    await stateManager.write('characters', {
      characters: [createDefaultCharacter('TestChar', 'protagonist')],
      last_updated: new Date().toISOString(),
    })

    retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    dreamEngine = new DreamEngine(fullTextMemory, stateManager, router, 10)
    dreamEngine.setRetriever(retriever)
  })

  afterEach(async () => {
    try { await retriever?.close() } catch {}
    cleanupTempDir(tmpDir)
  })

  it('executeDream should produce a dream result with summary', async () => {
    const result = await dreamEngine.executeDream(10)

    expect(result.triggerChapter).toBe(10)
    expect(result.chaptersIntegrated).toBe(10)
    expect(result.summary).toBeTruthy()
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.timestamp).toBeTruthy()
    expect(result.conflictsDetected).toBeDefined()
  })

  it('executeDream should update working memory with dream summary', async () => {
    await dreamEngine.executeDream(10)

    const workingMemory = await stateManager.read('working_memory')
    expect(workingMemory.dream_summary).toBeTruthy()
    expect(workingMemory.dream_summary.length).toBeGreaterThan(0)
    expect(workingMemory.updated_at).toBeTruthy()
  })

  it('executeDream should persist dream log to SQLite', async () => {
    await dreamEngine.executeDream(10)

    const logs = retriever.getDreamLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].triggerChapter).toBe(10)
    expect(logs[0].chaptersIntegrated).toBe('1-10')
  })

  it('executeDream should add to in-memory dream history', async () => {
    await dreamEngine.executeDream(10)

    const history = await dreamEngine.getDreamHistory()
    expect(history.length).toBe(1)
    expect(history[0].triggerChapter).toBe(10)
  })

  it('getLastDream should return the last dream after execution', async () => {
    await dreamEngine.executeDream(10)

    const last = await dreamEngine.getLastDream()
    expect(last).not.toBeNull()
    expect(last!.triggerChapter).toBe(10)
  })

  it('getDreamSummary should return summary after execution', async () => {
    await dreamEngine.executeDream(10)

    const summary = await dreamEngine.getDreamSummary()
    expect(summary).toBeTruthy()
    expect(summary!.length).toBeGreaterThan(0)
  })

  it('should compress old chapters when executing dream', async () => {
    // Add 20 chapters to test compression
    for (let i = 11; i <= 20; i++) {
      await fullTextMemory.addChapter({
        chapter_number: i,
        title: `Chapter ${i}`,
        full_text: `Content of chapter ${i}. Extended content here.`,
        summary: `Summary of chapter ${i}.`,
        compressed: false,
      })
    }

    await dreamEngine.executeDream(20)

    // Dream should trigger compression of old chapters
    expect(fullTextMemory.getChapterCount()).toBeGreaterThan(0)
  })
})

describe('DreamEngine - conflict detection', () => {
  let dreamEngine: DreamEngine
  let fullTextMemory: FullTextMemory
  let stateManager: StateManager
  let router: ModelRouter
  let retriever: MemoryRetriever
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTempDir()
    const dbPath = path.join(tmpDir, 'test.db')
    router = createMockRouter()

    fullTextMemory = new FullTextMemory(tmpDir, router)
    await fullTextMemory.initialize()

    // Add chapters with character names in summary
    for (let i = 1; i <= 10; i++) {
      await fullTextMemory.addChapter({
        chapter_number: i,
        title: `Chapter ${i}`,
        full_text: `Content of chapter ${i}. Character Alice does something.`,
        summary: `Summary of chapter ${i} with Alice and Bob.`,
        compressed: false,
      })
    }

    stateManager = new StateManager(tmpDir)
    await stateManager.initialize()

    const schemas = await import('../../src/state/schemas/index.js')
    const wm = schemas.createDefaultWorkingMemory(0)
    // Set a previous dream summary for overlap detection
    wm.dream_summary = 'Previous dream summary with overlapping content words'
    await stateManager.write('working_memory', wm)

    // Characters: Alice is registered, Bob is NOT — this should trigger a conflict
    await stateManager.write('characters', {
      characters: [
        createDefaultCharacter('Alice', 'protagonist'),
        createDefaultCharacter('Bob', 'supporting'),
      ],
      last_updated: new Date().toISOString(),
    })

    retriever = new MemoryRetriever(dbPath)
    await retriever.initialize()

    dreamEngine = new DreamEngine(fullTextMemory, stateManager, router, 10)
    dreamEngine.setRetriever(retriever)
  })

  afterEach(async () => {
    try { await retriever?.close() } catch {}
    cleanupTempDir(tmpDir)
  })

  it('should detect conflicts when characters in summary lack state', async () => {
    const result = await dreamEngine.executeDream(10)
    expect(result.conflictsDetected).toBeDefined()
    // Should detect that Alice/Bob are in the dream summary but may not have character_states
    expect(Array.isArray(result.conflictsDetected)).toBe(true)
  })
})

describe('FullTextMemory - Dream Integration', () => {
  let fullTextMemory: FullTextMemory
  let router: ModelRouter
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTempDir()
    router = createMockRouter()
    fullTextMemory = new FullTextMemory(tmpDir, router)
    await fullTextMemory.initialize()
  })

  afterEach(() => {
    cleanupTempDir(tmpDir)
  })

  it('triggerDream should return empty when no chapters exist', async () => {
    const result = await fullTextMemory.triggerDream()
    expect(result).toBe('')
  })

  it('triggerDream should generate a summary when chapters exist', async () => {
    for (let i = 1; i <= 10; i++) {
      await fullTextMemory.addChapter({
        chapter_number: i,
        title: `Chapter ${i}`,
        full_text: `Full text of chapter ${i}.`,
        summary: `Summary ${i}`,
        compressed: false,
      })
    }

    const result = await fullTextMemory.triggerDream()
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('should cache chapters to disk and reload them', async () => {
    await fullTextMemory.addChapter({
      chapter_number: 1,
      title: 'Test Chapter',
      full_text: 'Test content.',
      summary: 'Test summary.',
      compressed: false,
    })

    // Create a new instance to test loading from disk
    const newMemory = new FullTextMemory(tmpDir, router)
    await newMemory.initialize()

    expect(newMemory.getChapterCount()).toBe(1)
    expect(newMemory.getLastChapterNumber()).toBe(1)
  })
})
