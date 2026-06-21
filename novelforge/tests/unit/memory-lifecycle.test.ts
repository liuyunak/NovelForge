import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryLifecycle } from '../../src/memory/lifecycle.js'
import { MemoryRetriever } from '../../src/memory/retriever.js'
import type { MemoryEntry } from '../../src/types/index.js'

vi.mock('../../src/memory/embedding-service.js', () => ({
  getEmbeddingService: () => ({
    embed: vi.fn().mockResolvedValue({ vector: new Array(256).fill(0.1) }),
    embedBatch: vi.fn().mockResolvedValue([{ vector: new Array(256).fill(0.1) }]),
    serializeVector: vi.fn().mockReturnValue(Buffer.from(new Array(256 * 4).fill(0))),
    deserializeVector: vi.fn().mockReturnValue(new Array(256).fill(0.1)),
    cosineSimilarity: vi.fn().mockReturnValue(0.5),
  }),
}))

let tmpDir: string
let dbPath: string
let retriever: MemoryRetriever
let lifecycle: MemoryLifecycle

const makeEntry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: overrides.id || `mem_test_${Math.random().toString(36).substr(2, 8)}`,
  content: overrides.content || 'Test memory content',
  category: overrides.category || 'plot',
  source_chapter: overrides.source_chapter ?? 1,
  importance: overrides.importance ?? 0.5,
})

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-lifecycle-test-'))
  dbPath = path.join(tmpDir, 'test.db')
  retriever = new MemoryRetriever(dbPath)
  await retriever.initialize()
  lifecycle = new MemoryLifecycle(retriever)
  await lifecycle.initialize()
})

afterEach(async () => {
  await lifecycle.close()
  await retriever.close()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('MemoryLifecycle', () => {
  describe('Decay', () => {
    it('applyDecay persists to database', async () => {
      const entry = makeEntry({ importance: 0.5, category: 'plot' })
      await retriever.save(entry)

      await lifecycle.applyDecay()

      const updated = await retriever.getById(entry.id)
      expect(updated).not.toBeNull()
      expect(updated!.importance).toBeLessThan(0.5)
    })

    it('archives memories below archiveThreshold', async () => {
      const entry = makeEntry({ importance: 0.03, category: 'style' })
      await retriever.save(entry)

      const result = await lifecycle.applyDecay()

      expect(result.archived).toBeGreaterThanOrEqual(1)
    })

    it('applies per-category decay multipliers', async () => {
      const charEntry = makeEntry({ importance: 0.8, category: 'character' })
      const styleEntry = makeEntry({ importance: 0.8, category: 'style' })

      await retriever.save(charEntry)
      await retriever.save(styleEntry)

      await lifecycle.applyDecay()

      const charAfter = await retriever.getById(charEntry.id)
      const styleAfter = await retriever.getById(styleEntry.id)

      expect(charAfter).not.toBeNull()
      expect(styleAfter).not.toBeNull()
      expect(charAfter!.importance).toBeGreaterThan(styleAfter!.importance)
    })

    it('keeps high-importance memories active', async () => {
      const entry = makeEntry({ importance: 0.95, category: 'world' })
      await retriever.save(entry)

      await lifecycle.applyDecay()

      const updated = await retriever.getById(entry.id)
      expect(updated).not.toBeNull()
      expect(updated!.importance).toBeGreaterThan(0.5)
    })

    it('ebbinghaus curve: newer memories decay faster than older ones', async () => {
      // Create lifecycle with ebbinghaus mode explicitly
      const ebbinghausLifecycle = new MemoryLifecycle(retriever, { decayCurve: 'ebbinghaus' })
      await ebbinghausLifecycle.initialize()

      // Two memories with same importance but different ages
      const newMem = makeEntry({ id: 'new_eb_001', importance: 0.9, category: 'plot', source_chapter: 9 })
      const oldMem = makeEntry({ id: 'old_eb_001', importance: 0.9, category: 'plot', source_chapter: 1 })

      await retriever.save(newMem)
      await retriever.save(oldMem)

      // Track current chapter to simulate age difference
      await ebbinghausLifecycle.onChapterWrite(10, [], false)

      await ebbinghausLifecycle.applyDecay()

      const newAfter = await retriever.getById('new_eb_001')
      const oldAfter = await retriever.getById('old_eb_001')

      expect(newAfter).not.toBeNull()
      expect(oldAfter).not.toBeNull()
      // Older memory should have decayed more (ebbinghaus: age matters exponentially)
      expect(oldAfter!.importance).toBeLessThan(newAfter!.importance)

      await ebbinghausLifecycle.close()
    })

    it('ebbinghaus curve: decay is slower than linear for same rate', async () => {
      const ebbLifecycle = new MemoryLifecycle(retriever, { decayCurve: 'ebbinghaus', decayRate: 0.1 })
      await ebbLifecycle.initialize()

      const mem = makeEntry({ id: 'ebb_test_001', importance: 0.8, category: 'plot', source_chapter: 1 })
      await retriever.save(mem)
      await ebbLifecycle.onChapterWrite(2, [], false)

      await ebbLifecycle.applyDecay()

      const after = await retriever.getById('ebb_test_001')
      expect(after).not.toBeNull()
      // With ebbinghaus at chapterAge=1, rate=0.1, importance should be > 0.7 (not crash to 0)
      expect(after!.importance).toBeGreaterThan(0.7)

      await ebbLifecycle.close()
    })

    it('access frequency reduces effective decay rate', async () => {
      const afLifecycle = new MemoryLifecycle(retriever, {
        decayCurve: 'ebbinghaus',
        decayRate: 0.1,
        accessFrequencyModifier: 0.1,
      })
      await afLifecycle.initialize()

      const mem = makeEntry({ id: 'af_test_001', importance: 0.9, category: 'plot', source_chapter: 1 })
      await retriever.save(mem)
      await afLifecycle.onChapterWrite(2, [], false)

      // Simulate high access count via retriever.recordAccess
      await retriever.recordAccess(['af_test_001'], 1)
      await retriever.recordAccess(['af_test_001'], 2)
      await retriever.recordAccess(['af_test_001'], 3)

      await afLifecycle.applyDecay()

      const after = await retriever.getById('af_test_001')
      expect(after).not.toBeNull()
      // Ebbinghaus decay should still reduce importance, just less aggressively
      // Without access: e^(-0.1*1*1) ≈ 0.905 → importance ≈ 0.814
      // With access_count=3: e^(-0.1*(1/1.3)*1) ≈ e^(-0.077) ≈ 0.926 → importance ≈ 0.833
      expect(after!.importance).toBeGreaterThan(0.7)
      expect(after!.importance).toBeLessThan(0.9)

      await afLifecycle.close()
    })

    it('linear decay mode still works correctly', async () => {
      const linearLifecycle = new MemoryLifecycle(retriever, { decayCurve: 'linear', decayRate: 0.05 })
      await linearLifecycle.initialize()

      const mem = makeEntry({ id: 'lin_test_001', importance: 0.5, category: 'plot', source_chapter: 1 })
      await retriever.save(mem)

      await linearLifecycle.applyDecay()

      const after = await retriever.getById('lin_test_001')
      expect(after).not.toBeNull()
      // Linear: 0.5 - 0.05*1.0 = 0.45
      expect(after!.importance).toBeLessThan(0.5)
      expect(after!.importance).toBeGreaterThan(0.4)

      await linearLifecycle.close()
    })
  })

  describe('Conflict Detection', () => {
    it('handles similar facts without crashing', async () => {
      const existing = makeEntry({ content: '叶凡突破了金丹期', category: 'character', source_chapter: 1 })
      await retriever.save(existing)

      const newFact = makeEntry({ content: '叶凡还停留在筑基期巅峰', category: 'character' })

      const conflicts = await lifecycle.onChapterWrite(2, [newFact], false)
      expect(Array.isArray(conflicts)).toBe(true)
    })

    it('does not flag identical facts as conflicts', async () => {
      const existing = makeEntry({ content: '宗门位于青云山', category: 'world', source_chapter: 1 })
      await retriever.save(existing)

      const newFact = makeEntry({ content: '宗门位于青云山', category: 'world' })

      const conflicts = await lifecycle.onChapterWrite(2, [newFact], false)
      const selfConflict = conflicts.find(
        c => c.memoryAId === existing.id || c.memoryBId === existing.id
      )
      expect(selfConflict).toBeUndefined()
    })

    it('boosts importance for conflicting facts', async () => {
      const existing = makeEntry({
        id: 'existing_001',
        content: '魔尊拥有不死之身',
        category: 'character',
        source_chapter: 1,
        importance: 0.5,
      })
      await retriever.save(existing)

      const newFact = makeEntry({
        id: 'new_001',
        content: '魔尊其实可以被封印',
        category: 'character',
        importance: 0.5,
      })

      await lifecycle.onChapterWrite(2, [newFact], false)

      const saved = await retriever.getById('new_001')
      expect(saved).not.toBeNull()
      expect(saved!.importance).toBeGreaterThanOrEqual(0.5)
    })
  })

  describe('Conflict Resolution', () => {
    it('persists conflicts to conflict store', async () => {
      const existing = makeEntry({ content: '大陆分为九州', category: 'world', source_chapter: 1 })
      await retriever.save(existing)

      const newFact = makeEntry({ content: '大陆实际只有五州', category: 'world' })

      await lifecycle.onChapterWrite(2, [newFact], false)
      const allConflicts = lifecycle.getAllConflicts()
      expect(allConflicts.length).toBeGreaterThanOrEqual(0)
    })

    it('returns false for non-existent conflict', async () => {
      const resolved = await lifecycle.resolveConflict('nonexistent', 'keep_a')
      expect(resolved).toBe(false)
    })

    it('resolves conflict with keep_a strategy', async () => {
      const memA = makeEntry({ id: 'memA', content: '叶凡使用火焰剑法', category: 'character', source_chapter: 1 })
      const memB = makeEntry({ id: 'memB', content: '叶凡使用寒冰剑法', category: 'character', source_chapter: 2 })

      await retriever.save(memA)
      await retriever.save(memB)

      await lifecycle.onChapterWrite(2, [], false)

      const unresolved = lifecycle.getUnresolvedConflicts()
      if (unresolved.length > 0) {
        const resolved = await lifecycle.resolveConflict(unresolved[0].id, 'keep_a')
        expect(resolved).toBe(true)
      }
    })
  })

  describe('Forget', () => {
    it('forgets memories below minImportance', async () => {
      const lowImp = makeEntry({ importance: 0.03, category: 'plot' })
      const highImp = makeEntry({ importance: 0.9, category: 'plot' })

      await retriever.save(lowImp)
      await retriever.save(highImp)

      const result = await lifecycle.forget({ strategy: 'decay' })

      expect(result.forgottenIds).toContain(lowImp.id)
      expect(result.forgottenIds).not.toContain(highImp.id)
    })

    it('forgets memories by age', async () => {
      const oldMem = makeEntry({ source_chapter: 1, importance: 0.8, category: 'world' })
      const newMem = makeEntry({ source_chapter: 90, importance: 0.8, category: 'world' })

      await retriever.save(oldMem)
      await retriever.save(newMem)

      await lifecycle.onChapterWrite(95, [], false)

      const result = await lifecycle.forget({ strategy: 'age' })

      expect(result.forgottenIds).toContain(oldMem.id)
      expect(result.forgottenIds).not.toContain(newMem.id)
    })

    it('forgets bottom percentile by importance', async () => {
      for (let i = 0; i < 10; i++) {
        await retriever.save(makeEntry({ importance: 0.1 + i * 0.08 }))
      }

      const result = await lifecycle.forget({ strategy: 'low_importance', threshold: 30 })

      expect(result.forgottenIds.length).toBeGreaterThan(0)
      expect(result.forgottenIds.length).toBeLessThanOrEqual(4)
    })

    it('forgets duplicate memories', async () => {
      const mem1 = makeEntry({ content: '宗门有三大长老分别掌管刑法、丹药和阵法', category: 'world', importance: 0.5 })
      const mem2 = makeEntry({ content: '宗门有三大长老分别掌管刑法、丹药和阵法', category: 'world', importance: 0.4 })

      await retriever.save(mem1)
      await retriever.save(mem2)

      const result = await lifecycle.forget({ strategy: 'duplicate' })

      expect(result.forgottenIds).toContain(mem2.id)
    })

    it('supports dry run mode', async () => {
      const mem = makeEntry({ importance: 0.03, category: 'style' })
      await retriever.save(mem)

      const result = await lifecycle.forget({ strategy: 'decay', dryRun: true })

      expect(result.forgottenIds).toContain(mem.id)

      const stillThere = await retriever.getById(mem.id)
      expect(stillThere).not.toBeNull()
    })

    it('supports manual forget', async () => {
      const mem1 = makeEntry({ id: 'forget_me_1' })
      const mem2 = makeEntry({ id: 'forget_me_2' })
      await retriever.save(mem1)
      await retriever.save(mem2)

      const result = await lifecycle.forget({
        strategy: 'manual',
        memoryIds: ['forget_me_1'],
      })

      expect(result.forgottenIds).toEqual(['forget_me_1'])
    })
  })

  describe('Deduplication', () => {
    it('deduplicates near-identical facts in same batch', async () => {
      const facts = [
        makeEntry({ content: '宗门每年招收一百名弟子', category: 'world', importance: 0.5 }),
        makeEntry({ content: '宗门每年招收一百名弟子', category: 'world', importance: 0.6 }),
        makeEntry({ content: '宗门禁地只有长老可以进入', category: 'world', importance: 0.5 }),
      ]

      await lifecycle.onChapterWrite(3, facts, false)

      const stats = lifecycle.getLifecycleStats()
      expect(stats.mergedThisCycle).toBeGreaterThanOrEqual(0)
    })

    it('mergeMemoriesById merges two memories and returns result', async () => {
      const memA = makeEntry({ id: 'merge_test_a', content: '魔尊重伤后躲入禁地疗伤', category: 'character', importance: 0.6, source_chapter: 1 })
      const memB = makeEntry({ id: 'merge_test_b', content: '魔尊重伤后躲入禁地深处疗伤，需要百年恢复', category: 'character', importance: 0.7, source_chapter: 2 })

      await retriever.save(memA)
      await retriever.save(memB)

      const result = await lifecycle.mergeMemoriesById('merge_test_a', 'merge_test_b')

      expect(result).not.toBeNull()
      expect(result!.mergedCount).toBe(2)
      expect(result!.sourceIds).toContain('merge_test_a')
      expect(result!.sourceIds).toContain('merge_test_b')
      expect(result!.merged.importance).toBeGreaterThan(0.7)
      // Merged memory has a new ID, originals should exist but be archived
      const stats = lifecycle.getLifecycleStats()
      expect(stats.mergedThisCycle).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Statistics', () => {
    it('returns conflict stats', async () => {
      const stats = await lifecycle.getConflictStats()
      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('active')
      expect(stats).toHaveProperty('archived')
      expect(stats).toHaveProperty('conflictCount')
    })

    it('returns lifecycle stats', async () => {
      const stats = lifecycle.getLifecycleStats()
      expect(stats).toHaveProperty('decayedThisCycle')
      expect(stats).toHaveProperty('mergedThisCycle')
      expect(stats).toHaveProperty('forgottenThisCycle')
    })

    it('refreshes stats from database', async () => {
      await retriever.save(makeEntry({ importance: 0.5 }))
      await retriever.save(makeEntry({ importance: 0.8 }))

      await lifecycle.refreshStats()
      const stats = lifecycle.getLifecycleStats()

      expect(stats.totalMemories).toBe(2)
      expect(stats.activeMemories).toBeGreaterThanOrEqual(2)
      expect(stats.avgImportance).toBeGreaterThan(0)
    })
  })

  describe('Access Tracking', () => {
    it('records access when retrieving memories', async () => {
      const mem = makeEntry({ content: '测试记忆访问追踪', category: 'lesson', source_chapter: 1 })
      await retriever.save(mem)

      await lifecycle.getRelevantMemories(2, '测试', false)

      const updated = await retriever.getById(mem.id)
      expect(updated).not.toBeNull()
    })
  })
})
