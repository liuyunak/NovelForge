import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { RollbackManager } from '../../../src/state/rollback.js'

describe('RollbackManager', () => {
  let tmpDir: string
  let rm: RollbackManager

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelforge-test-rollback-'))

    // Setup workspace structure
    const stateDir = path.join(tmpDir, 'state')
    const versionsDir = path.join(tmpDir, 'versions')
    const chaptersDir = path.join(tmpDir, 'chapters')
    const sheetsDir = path.join(tmpDir, 'sheets')
    fs.mkdirSync(stateDir, { recursive: true })
    fs.mkdirSync(versionsDir, { recursive: true })
    fs.mkdirSync(chaptersDir, { recursive: true })
    fs.mkdirSync(sheetsDir, { recursive: true })

    // Create state files
    fs.writeFileSync(path.join(tmpDir, 'MASTER_SETTING.json'), JSON.stringify({ title: 'Test' }), 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'book_config.json'), JSON.stringify({}), 'utf-8')
    const stateFiles = ['working_memory', 'current_state', 'characters', 'plot_threads',
      'particle_ledger', 'chapter_summaries', 'rhythm_map', 'power_system', 'learned_rules',
      'ai_fingerprint_blacklist']
    for (const f of stateFiles) {
      fs.writeFileSync(path.join(stateDir, `${f}.json`), JSON.stringify({}), 'utf-8')
    }

    // Create chapter and sheet files
    fs.writeFileSync(path.join(chaptersDir, 'chapter_003.md'), '# Chapter 3', 'utf-8')
    fs.writeFileSync(path.join(sheetsDir, 'chapter_003.json'), JSON.stringify({ chapter: 3 }), 'utf-8')

    rm = new RollbackManager(tmpDir)
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should fail rollback when no snapshot exists', async () => {
    const result = await rm.rollbackChapter(1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('No snapshot found')
  })

  it('should fail rollback to previous when no snapshots', async () => {
    const result = await rm.rollbackToPrevious()
    expect(result.success).toBe(false)
    expect(result.message).toContain('No previous snapshot')
  })

  it('should delete chapter data files', async () => {
    await rm.deleteChapterData(3)
    expect(fs.existsSync(path.join(tmpDir, 'chapters', 'chapter_003.md'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'sheets', 'chapter_003.json'))).toBe(false)
  })

  it('should not throw when deleting non-existent chapter data', async () => {
    await expect(rm.deleteChapterData(99)).resolves.not.toThrow()
  })

  it('should handle deleteChapterData with padded chapter numbers', async () => {
    // Create files with padded format
    fs.writeFileSync(path.join(tmpDir, 'chapters', 'chapter_001.md'), '# Chapter 1', 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'sheets', 'chapter_001.json'), JSON.stringify({ chapter: 1 }), 'utf-8')

    await rm.deleteChapterData(1)
    expect(fs.existsSync(path.join(tmpDir, 'chapters', 'chapter_001.md'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'sheets', 'chapter_001.json'))).toBe(false)
  })

  it('should return restoredChapter in result even on failure', async () => {
    const result = await rm.rollbackChapter(5)
    expect(result.restoredChapter).toBe(5)
    expect(result.success).toBe(false)
  })

  it('should include error message on failure', async () => {
    const result = await rm.rollbackChapter(999)
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })

  it('should fail rollbackToPrevious with only one snapshot', async () => {
    // Create exactly one snapshot manually
    const snapshotDir = path.join(tmpDir, 'versions', 'snapshot_test')
    fs.mkdirSync(snapshotDir, { recursive: true })
    fs.writeFileSync(path.join(snapshotDir, 'snapshot.json'), JSON.stringify({
      id: 'snapshot_test', name: 'Ch 1', chapter: 1,
      timestamp: new Date().toISOString(), files: [],
    }), 'utf-8')

    const result = await rm.rollbackToPrevious()
    expect(result.success).toBe(false)
  })

  it('should return chapter 0 when no snapshots for rollbackToPrevious', async () => {
    const result = await rm.rollbackToPrevious()
    expect(result.restoredChapter).toBe(0)
  })
})
