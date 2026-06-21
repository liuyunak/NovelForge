import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { StateWriter } from '../../../src/state/writer.js'
import {
  createDefaultWorkingMemory,
} from '../../../src/state/schemas/working-memory.js'

describe('StateWriter', () => {
  let tmpDir: string
  let writer: StateWriter

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelforge-test-writer-'))
    writer = new StateWriter(tmpDir)
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should create all required directories on ensureDirectories', async () => {
    await writer.ensureDirectories()
    const expectedDirs = ['state', 'volumes', 'blocks', 'sheets', 'scenes', 'chapters', 'braindump', 'versions']
    for (const dir of expectedDirs) {
      expect(fs.existsSync(path.join(tmpDir, dir))).toBe(true)
    }
  })

  it('should be idempotent on multiple ensureDirectories calls', async () => {
    await writer.ensureDirectories()
    await writer.ensureDirectories()
    // Should not throw
    expect(fs.existsSync(path.join(tmpDir, 'state'))).toBe(true)
  })

  it('should write a file to the correct path', async () => {
    await writer.ensureDirectories()
    const wm = createDefaultWorkingMemory(5)
    await writer.write('working_memory', wm)

    const filePath = path.join(tmpDir, 'state', 'working_memory.json')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(content.chapter_number).toBe(5)
  })

  it('should write MASTER_SETTING to root level', async () => {
    await writer.ensureDirectories()
    await writer.write('MASTER_SETTING', {
      work_id: 'test', title: 'test', genre: '玄幻',
      target_audience: { age: '20', preference: '男频', reading_scenario: '手机' },
      core_premise: 'p', core_conflict: 'c', selling_point: 's', ending_direction: 'e',
      world_rules: [], golden_finger: { type: 'none', description: '', limitations: [] },
      created_at: new Date().toISOString(), version: '1.0',
    })
    expect(fs.existsSync(path.join(tmpDir, 'MASTER_SETTING.json'))).toBe(true)
  })

  it('should write book_config to root level', async () => {
    await writer.ensureDirectories()
    await writer.write('book_config', { last_updated: new Date().toISOString() })
    expect(fs.existsSync(path.join(tmpDir, 'book_config.json'))).toBe(true)
  })

  it('should overwrite existing file', async () => {
    await writer.ensureDirectories()
    await writer.write('working_memory', createDefaultWorkingMemory(1))
    await writer.write('working_memory', createDefaultWorkingMemory(2))

    const filePath = path.join(tmpDir, 'state', 'working_memory.json')
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(content.chapter_number).toBe(2)
  })

  it('should not leave temp files after write', async () => {
    await writer.ensureDirectories()
    await writer.write('working_memory', createDefaultWorkingMemory(1))

    const stateDir = path.join(tmpDir, 'state')
    const files = fs.readdirSync(stateDir)
    const tmpFiles = files.filter(f => f.endsWith('.tmp'))
    expect(tmpFiles).toHaveLength(0)
  })

  it('should write pretty-printed JSON', async () => {
    await writer.ensureDirectories()
    await writer.write('working_memory', createDefaultWorkingMemory(1))

    const filePath = path.join(tmpDir, 'state', 'working_memory.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    expect(raw).toContain('\n')
    expect(raw).toContain('  ')
  })

  it('should delete an existing file', async () => {
    await writer.ensureDirectories()
    await writer.write('working_memory', createDefaultWorkingMemory(1))
    expect(fs.existsSync(path.join(tmpDir, 'state', 'working_memory.json'))).toBe(true)

    await writer.delete('working_memory')
    expect(fs.existsSync(path.join(tmpDir, 'state', 'working_memory.json'))).toBe(false)
  })

  it('should not throw when deleting non-existent file', async () => {
    await expect(writer.delete('working_memory')).resolves.not.toThrow()
  })

  it('should create a backup of an existing file', async () => {
    await writer.ensureDirectories()
    const wm = createDefaultWorkingMemory(3)
    await writer.write('working_memory', wm)

    const backupPath = await writer.backup('working_memory')
    expect(fs.existsSync(backupPath)).toBe(true)
    expect(backupPath).toContain('versions')
    expect(backupPath).toContain('working_memory_')

    const backupContent = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))
    expect(backupContent.chapter_number).toBe(3)
  })

  it('should throw when backing up non-existent file', async () => {
    await writer.ensureDirectories()
    await expect(writer.backup('working_memory')).rejects.toThrow('not found')
  })

  it('should handle concurrent writes to different keys', async () => {
    await writer.ensureDirectories()
    await Promise.all([
      writer.write('working_memory', createDefaultWorkingMemory(1)),
      writer.write('current_state', {
        fact_channel: { location: '', time: '', alive_characters: [], dead_characters: [], current_events: [] },
        intent_channel: {},
        last_updated: new Date().toISOString(),
      }),
    ])
    expect(fs.existsSync(path.join(tmpDir, 'state', 'working_memory.json'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'state', 'current_state.json'))).toBe(true)
  })
})
