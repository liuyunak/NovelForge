import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { StateManager } from '../../../src/state/manager.js'
import {
  createDefaultWorkingMemory,
} from '../../../src/state/schemas/working-memory.js'
import {
  createDefaultCurrentState,
} from '../../../src/state/schemas/current-state.js'
import {
  createDefaultCharacter,
} from '../../../src/state/schemas/characters.js'

describe('StateManager', () => {
  let tmpDir: string
  let manager: StateManager

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelforge-test-mgr-'))
    manager = new StateManager(tmpDir)
    await manager.initialize()
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  // --- Basic read/write ---
  it('should write and read back data', async () => {
    const wm = createDefaultWorkingMemory(7)
    await manager.write('working_memory', wm)
    const result = await manager.read('working_memory')
    expect(result.chapter_number).toBe(7)
  })

  it('should throw on validation failure during write', async () => {
    await expect(manager.write('working_memory', { invalid: true } as any))
      .rejects.toThrow('Validation failed')
  })

  it('should throw when reading non-existent key', async () => {
    await expect(manager.read('working_memory')).rejects.toThrow('File not found')
  })

  // --- exists ---
  it('should return true for existing key', async () => {
    await manager.write('working_memory', createDefaultWorkingMemory(1))
    expect(await manager.exists('working_memory')).toBe(true)
  })

  it('should return false for non-existing key', async () => {
    expect(await manager.exists('working_memory')).toBe(false)
  })

  // --- listKeys ---
  it('should list all written keys', async () => {
    await manager.write('working_memory', createDefaultWorkingMemory(1))
    await manager.write('current_state', createDefaultCurrentState())

    const keys = await manager.listKeys()
    expect(keys).toContain('working_memory')
    expect(keys).toContain('current_state')
  })

  it('should return empty array when no keys written', async () => {
    const keys = await manager.listKeys()
    expect(keys).toEqual([])
  })

  // --- patch ---
  it('should patch existing data with partial updates', async () => {
    const wm = createDefaultWorkingMemory(1)
    await manager.write('working_memory', wm)

    await manager.patch('working_memory', {
      chapter_number: 10,
      summary: 'Updated summary',
    })

    const result = await manager.read('working_memory')
    expect(result.chapter_number).toBe(10)
    expect(result.summary).toBe('Updated summary')
  })

  it('should patch preserves unmentioned fields', async () => {
    const wm = createDefaultWorkingMemory(1)
    wm.recent_events = ['event_a', 'event_b']
    await manager.write('working_memory', wm)

    await manager.patch('working_memory', { chapter_number: 5 })

    const result = await manager.read('working_memory')
    expect(result.recent_events).toEqual(['event_a', 'event_b'])
  })

  it('should throw when patching non-existent key', async () => {
    await expect(manager.patch('working_memory', { chapter_number: 1 }))
      .rejects.toThrow('File not found')
  })

  it('should throw when patching with invalid data', async () => {
    await manager.write('working_memory', createDefaultWorkingMemory(1))
    // updated_at must be datetime string
    await expect(manager.patch('working_memory', { updated_at: 'not-a-date' } as any))
      .rejects.toThrow('Validation failed')
  })

  // --- data consistency ---
  it('should maintain data integrity across multiple writes', async () => {
    for (let i = 1; i <= 5; i++) {
      await manager.write('working_memory', createDefaultWorkingMemory(i))
      const result = await manager.read('working_memory')
      expect(result.chapter_number).toBe(i)
    }
  })

  it('should handle MASTER_SETTING correctly', async () => {
    const ms = {
      work_id: 'novel_test', title: '测试小说', genre: '玄幻',
      target_audience: { age: '20', preference: '男频', reading_scenario: '手机' },
      core_premise: 'p', core_conflict: 'c', selling_point: 's', ending_direction: 'e',
      world_rules: [], golden_finger: { type: 'none', description: '', limitations: [] },
      created_at: new Date().toISOString(), version: '1.0',
    }
    await manager.write('MASTER_SETTING', ms)
    const result = await manager.read('MASTER_SETTING')
    expect(result.work_id).toBe('novel_test')
    expect(result.title).toBe('测试小说')
  })

  it('should handle characters key correctly', async () => {
    const chars = {
      characters: [
        createDefaultCharacter('主角', 'protagonist'),
      ],
      last_updated: new Date().toISOString(),
    }
    await manager.write('characters', chars)
    const result = await manager.read('characters')
    expect(result.characters).toHaveLength(1)
    expect(result.characters[0].name).toBe('主角')
  })

  it('should handle book_config correctly', async () => {
    const bc = { last_updated: new Date().toISOString(), custom_settings: { theme: 'dark' } }
    await manager.write('book_config', bc)
    const result = await manager.read('book_config')
    expect(result.custom_settings).toEqual({ theme: 'dark' })
  })
})
