import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SnapshotManager } from '../../../src/state/snapshot.js'

describe('SnapshotManager', () => {
  let tmpDir: string
  let sm: SnapshotManager

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelforge-test-snap-'))
    sm = new SnapshotManager(tmpDir)

    // Setup a minimal workspace structure for snapshot testing
    const stateDir = path.join(tmpDir, 'state')
    fs.mkdirSync(stateDir, { recursive: true })

    // Create some state files that snapshots reference
    fs.writeFileSync(path.join(tmpDir, 'MASTER_SETTING.json'), JSON.stringify({ title: 'Test Novel', version: '1.0' }), 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'book_config.json'), JSON.stringify({ last_updated: new Date().toISOString() }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'working_memory.json'), JSON.stringify({ chapter_number: 3 }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'current_state.json'), JSON.stringify({ fact_channel: { location: 'test' } }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'characters.json'), JSON.stringify({ characters: [] }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'plot_threads.json'), JSON.stringify({ subplots: [] }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'particle_ledger.json'), JSON.stringify({ items: [] }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'chapter_summaries.json'), JSON.stringify({ summaries: [] }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'rhythm_map.json'), JSON.stringify({ chapters: [] }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'power_system.json'), JSON.stringify({ realm_hierarchy: [] }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'learned_rules.json'), JSON.stringify({ rules: [] }), 'utf-8')
    fs.writeFileSync(path.join(stateDir, 'ai_fingerprint_blacklist.json'), JSON.stringify({ forbidden_patterns: [] }), 'utf-8')

    await sm.ensureDirectories()
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should create a snapshot with backed up files', async () => {
    const snap = await sm.createSnapshot(3, 'Test snapshot')
    expect(snap.id).toMatch(/^snapshot_/)
    expect(snap.chapter).toBe(3)
    expect(snap.name).toBe('Test snapshot')
    expect(snap.files.length).toBeGreaterThan(0)

    // Verify files exist in snapshot directory
    const snapDir = path.join(tmpDir, 'versions', snap.id)
    expect(fs.existsSync(snapDir)).toBe(true)
    expect(fs.existsSync(path.join(snapDir, 'snapshot.json'))).toBe(true)
  })

  it('should back up only existing files', async () => {
    const snap = await sm.createSnapshot(1)
    // MASTER_SETTING.json exists, so it should be in backed up files
    expect(snap.files).toContain('MASTER_SETTING.json')
  })

  it('should list all snapshots sorted by chapter descending', async () => {
    await sm.createSnapshot(1, 'Chapter 1')
    await sm.createSnapshot(5, 'Chapter 5')
    await sm.createSnapshot(3, 'Chapter 3')

    const snapshots = await sm.listSnapshots()
    expect(snapshots).toHaveLength(3)
    expect(snapshots[0].chapter).toBe(5)
    expect(snapshots[1].chapter).toBe(3)
    expect(snapshots[2].chapter).toBe(1)
  })

  it('should restore a snapshot correctly', async () => {
    // Modify a file, then restore from snapshot
    const snap = await sm.createSnapshot(3, 'Pre-modification')
    const wmPath = path.join(tmpDir, 'state', 'working_memory.json')
    fs.writeFileSync(wmPath, JSON.stringify({ chapter_number: 99 }), 'utf-8')

    await sm.restoreSnapshot(snap.id)

    const restored = JSON.parse(fs.readFileSync(wmPath, 'utf-8'))
    expect(restored.chapter_number).toBe(3)
  })

  it('should throw when restoring non-existent snapshot', async () => {
    await expect(sm.restoreSnapshot('non_existent_snapshot')).rejects.toThrow('Snapshot not found')
  })

  it('should delete a snapshot', async () => {
    const snap = await sm.createSnapshot(1)
    const snapDir = path.join(tmpDir, 'versions', snap.id)
    expect(fs.existsSync(snapDir)).toBe(true)

    await sm.deleteSnapshot(snap.id)
    expect(fs.existsSync(snapDir)).toBe(false)
  })

  it('should not throw when deleting non-existent snapshot', async () => {
    await expect(sm.deleteSnapshot('non_existent')).resolves.not.toThrow()
  })

  it('should create snapshot metadata file', async () => {
    const snap = await sm.createSnapshot(1)
    const metaPath = path.join(tmpDir, 'versions', snap.id, 'snapshot.json')
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    expect(meta.id).toBe(snap.id)
    expect(meta.chapter).toBe(1)
    expect(meta.timestamp).toBeDefined()
  })

  it('should handle empty workspace gracefully', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelforge-test-empty-'))
    const emptySm = new SnapshotManager(emptyDir)
    await emptySm.ensureDirectories()

    const snap = await emptySm.createSnapshot(1)
    // No files exist, so backed up files should be empty
    expect(snap.files).toHaveLength(0)
    expect(snap.id).toBeDefined()

    fs.rmSync(emptyDir, { recursive: true })
  })

  it('should return empty list when no snapshots exist', async () => {
    const snapshots = await sm.listSnapshots()
    expect(snapshots).toEqual([])
  })

  it('should handle restore with files in nested directories', async () => {
    const stateDir = path.join(tmpDir, 'state')
    // Create an additional file
    fs.writeFileSync(path.join(stateDir, 'extra.json'), JSON.stringify({ extra: true }), 'utf-8')

    const snap = await sm.createSnapshot(1)
    await sm.restoreSnapshot(snap.id)
    // The extra file should still exist (not touched by restore)
    expect(fs.existsSync(path.join(stateDir, 'extra.json'))).toBe(true)
  })

  it('should use default name when name not provided', async () => {
    const snap = await sm.createSnapshot(7)
    expect(snap.name).toBe('Chapter 7')
  })
})
