import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { StateReader } from '../../../src/state/reader.js'
import { StateWriter } from '../../../src/state/writer.js'
import {
  workingMemorySchema,
  createDefaultWorkingMemory,
} from '../../../src/state/schemas/working-memory.js'

describe('StateReader', () => {
  let tmpDir: string
  let reader: StateReader
  let writer: StateWriter

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelforge-test-reader-'))
    reader = new StateReader(tmpDir)
    writer = new StateWriter(tmpDir)
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should throw when reading non-existent file', async () => {
    await expect(reader.read('working_memory')).rejects.toThrow('File not found')
  })

  it('should read a file that was written', async () => {
    await writer.ensureDirectories()
    const wm = createDefaultWorkingMemory(3)
    await writer.write('working_memory', wm)
    const result = await reader.read('working_memory')
    expect(result.chapter_number).toBe(3)
  })

  it('should validate data against schema on read', async () => {
    await writer.ensureDirectories()
    const filePath = `${tmpDir}/state/working_memory.json`
    fs.writeFileSync(filePath, JSON.stringify({ invalid: 'data' }), 'utf-8')
    await expect(reader.read('working_memory')).rejects.toThrow('Invalid data')
  })

  it('should return cached data on second read', async () => {
    await writer.ensureDirectories()
    const wm = createDefaultWorkingMemory(1)
    await writer.write('working_memory', wm)

    const first = await reader.read('working_memory')
    // Modify file on disk
    const filePath = `${tmpDir}/state/working_memory.json`
    const wm2 = createDefaultWorkingMemory(99)
    fs.writeFileSync(filePath, JSON.stringify(wm2), 'utf-8')

    const second = await reader.read('working_memory')
    // Should return cached (stale) data
    expect(second.chapter_number).toBe(1)
  })

  it('should return fresh data after cache invalidation', async () => {
    await writer.ensureDirectories()
    const wm = createDefaultWorkingMemory(1)
    await writer.write('working_memory', wm)

    await reader.read('working_memory')
    reader.invalidateCache('working_memory')

    const filePath = `${tmpDir}/state/working_memory.json`
    const wm2 = createDefaultWorkingMemory(99)
    fs.writeFileSync(filePath, JSON.stringify(wm2), 'utf-8')

    const fresh = await reader.read('working_memory')
    expect(fresh.chapter_number).toBe(99)
  })

  it('should clear all cache on invalidateCache without key', async () => {
    await writer.ensureDirectories()
    const wm = createDefaultWorkingMemory(1)
    await writer.write('working_memory', wm)

    await reader.read('working_memory')
    reader.invalidateCache()

    const filePath = `${tmpDir}/state/working_memory.json`
    const wm2 = createDefaultWorkingMemory(99)
    fs.writeFileSync(filePath, JSON.stringify(wm2), 'utf-8')

    const fresh = await reader.read('working_memory')
    expect(fresh.chapter_number).toBe(99)
  })

  it('should return true for existing file via exists()', async () => {
    await writer.ensureDirectories()
    await writer.write('working_memory', createDefaultWorkingMemory(1))
    expect(await reader.exists('working_memory')).toBe(true)
  })

  it('should return false for non-existent file via exists()', async () => {
    expect(await reader.exists('working_memory')).toBe(false)
  })

  it('should list all available keys', async () => {
    await writer.ensureDirectories()
    await writer.write('working_memory', createDefaultWorkingMemory(1))
    await writer.write('current_state', {
      fact_channel: { location: '', time: '', alive_characters: [], dead_characters: [], current_events: [] },
      intent_channel: {},
      last_updated: new Date().toISOString(),
    })

    const keys = await reader.listKeys()
    expect(keys).toContain('working_memory')
    expect(keys).toContain('current_state')
  })

  it('should return empty array when state directory does not exist', async () => {
    const keys = await reader.listKeys()
    expect(keys).toEqual([])
  })

  it('should handle corrupted JSON gracefully', async () => {
    await writer.ensureDirectories()
    const filePath = `${tmpDir}/state/working_memory.json`
    fs.writeFileSync(filePath, '{ broken json', 'utf-8')
    await expect(reader.read('working_memory')).rejects.toThrow()
  })
})
