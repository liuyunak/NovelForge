import { describe, it, expect } from 'vitest'
import { getFilePath } from '../../../src/state/file-path.js'

describe('getFilePath', () => {
  const ws = '/test/workspace'

  it('should return correct path for MASTER_SETTING', () => {
    expect(getFilePath(ws, 'MASTER_SETTING')).toBe('/test/workspace/MASTER_SETTING.json')
  })

  it('should return correct path for global_config', () => {
    expect(getFilePath(ws, 'global_config')).toBe('/test/workspace/../global_config.json')
  })

  it('should return correct path for book_config', () => {
    expect(getFilePath(ws, 'book_config')).toBe('/test/workspace/book_config.json')
  })

  it('should return state/ subdirectory for regular keys', () => {
    expect(getFilePath(ws, 'working_memory')).toBe('/test/workspace/state/working_memory.json')
    expect(getFilePath(ws, 'characters')).toBe('/test/workspace/state/characters.json')
    expect(getFilePath(ws, 'current_state')).toBe('/test/workspace/state/current_state.json')
    expect(getFilePath(ws, 'plot_threads')).toBe('/test/workspace/state/plot_threads.json')
  })

  it('should handle all known schema keys without throwing', () => {
    const keys = [
      'MASTER_SETTING', 'global_config', 'book_config',
      'working_memory', 'current_state', 'characters', 'plot_threads',
      'particle_ledger', 'chapter_summaries', 'rhythm_map',
      'power_system', 'learned_rules', 'ai_fingerprint_blacklist',
      'style_fingerprint',
    ] as const
    for (const key of keys) {
      expect(() => getFilePath(ws, key)).not.toThrow()
    }
  })

  it('should produce paths ending in .json', () => {
    const path = getFilePath(ws, 'characters')
    expect(path.endsWith('.json')).toBe(true)
  })
})
