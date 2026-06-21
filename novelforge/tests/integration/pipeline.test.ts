import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { StateManager } from '../../src/state/manager.js'
import { createDefaultMasterSetting } from '../../src/state/schemas/index.js'

/**
 * Integration tests for Pipeline and StateManager.
 */
describe('Pipeline Integration', () => {
  let tmpDir: string
  let workspacePath: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-pipeline-int-'))
    workspacePath = path.join(tmpDir, 'test_novel')
    fs.mkdirSync(workspacePath, { recursive: true })
    fs.mkdirSync(path.join(workspacePath, 'state'), { recursive: true })
    fs.mkdirSync(path.join(workspacePath, 'chapters'), { recursive: true })
  })

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  it('should create workspace and write master setting', async () => {
    const stateManager = new StateManager(workspacePath)
    await stateManager.initialize()

    const masterSetting = createDefaultMasterSetting({
      work_id: 'test_novel',
      title: '测试小说',
      genre: '玄幻修仙',
      core_premise: '主角重生修仙',
    })

    await stateManager.write('MASTER_SETTING', masterSetting)

    const read = await stateManager.read('MASTER_SETTING')
    expect(read).toBeDefined()
    expect(read.title).toBe('测试小说')
    expect(read.genre).toBe('玄幻修仙')
  })

  it('should persist state across StateManager instances', async () => {
    const stateManager = new StateManager(workspacePath)
    await stateManager.initialize()

    await stateManager.write('MASTER_SETTING', createDefaultMasterSetting({
      work_id: 'test_persist',
      title: '持久化测试',
      genre: '都市异能',
      core_premise: '测试前提',
    }))

    // New instance should read same state
    const stateManager2 = new StateManager(workspacePath)
    await stateManager2.initialize()
    const read = await stateManager2.read('MASTER_SETTING')
    expect(read.title).toBe('持久化测试')
    expect(read.work_id).toBe('test_persist')
  })

  it('should handle characters state', async () => {
    const stateManager = new StateManager(workspacePath)
    await stateManager.initialize()

    const defaultChar = (overrides: Record<string, unknown> = {}) => ({
      name: '未知',
      role: 'supporting' as const,
      basic: {
        age: 25,
        gender: '未知',
        appearance: '',
        background: '',
      },
      ocean: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      speech: {
        style: '',
        catchphrases: [] as string[],
        taboo_words: [] as string[],
      },
      behavior_rules: [] as string[],
      relationships: [] as { target: string; type: string; description: string }[],
      emotional_arc: [] as { chapter: number; emotion: string; trigger: string }[],
      growth_milestones: [] as { chapter: number; event: string; impact: string }[],
      power: {
        level: '凡人',
        abilities: [] as string[],
        limitations: [] as string[],
      },
      ...overrides,
    })

    await stateManager.write('characters', {
      characters: [
        defaultChar({ name: '主角A', role: 'protagonist', power: { level: '练气期', abilities: [], limitations: [] } }),
        defaultChar({ name: '反派B', role: 'antagonist', power: { level: '筑基期', abilities: [], limitations: [] } }),
      ],
      last_updated: new Date().toISOString(),
    })

    const read = await stateManager.read('characters')
    expect(read.characters).toHaveLength(2)
    expect(read.characters[0].name).toBe('主角A')
  })
})
