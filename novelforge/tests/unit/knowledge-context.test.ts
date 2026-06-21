/**
 * Unit tests for KnowledgeContextBuilder
 *
 * Tests: rule fetching, plot phase detection, character pattern inference, prompt generation
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { KnowledgeContextBuilder } from '../../src/knowledge/knowledge-context.js'
import { StateManager } from '../../src/state/manager.js'
import { CharacterPatternManager } from '../../src/knowledge/character-patterns.js'

const testWorkspacePath = path.join(process.cwd(), 'workspace', 'test_knowledge_novel')

function setupTestWorkspace(): void {
  const stateDir = path.join(testWorkspacePath, 'state')
  fs.mkdirSync(stateDir, { recursive: true })

  // Create MASTER_SETTING.json with genre
  const setting = {
    work_id: 'test_knowledge',
    title: '知识测试小说',
    genre: '玄幻修仙',
    core_premise: '测试核心设定',
  }
  fs.writeFileSync(path.join(stateDir, 'MASTER_SETTING.json'), JSON.stringify(setting, null, 2))

  // Create characters.json with schema-compliant format
  const characters = {
    characters: [
      {
        name: '叶凡',
        role: 'protagonist',
        basic: { background: '修仙者' },
        ocean: { openness: 0.5, conscientiousness: 0.7, extraversion: 0.4, agreeableness: 0.5, neuroticism: 0.3 },
        speech: { style: '沉稳', catchphrases: [], taboo_words: [] },
        behavior_rules: [],
        relationships: [],
        emotional_arc: [],
        growth_milestones: [],
        power: { level: '筑基期', abilities: ['御剑'], limitations: ['灵力不足'] },
      },
      {
        name: '林雪',
        role: 'supporting',
        basic: { background: '医者' },
        ocean: { openness: 0.6, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.8, neuroticism: 0.4 },
        speech: { style: '温柔', catchphrases: [], taboo_words: [] },
        behavior_rules: [],
        relationships: [],
        emotional_arc: [],
        growth_milestones: [],
      },
      {
        name: '魔尊',
        role: 'antagonist',
        basic: { background: '魔道至尊' },
        ocean: { openness: 0.3, conscientiousness: 0.6, extraversion: 0.7, agreeableness: 0.1, neuroticism: 0.5 },
        speech: { style: '威严', catchphrases: [], taboo_words: [] },
        behavior_rules: [],
        relationships: [],
        emotional_arc: [],
        growth_milestones: [],
        power: { level: '无敌', abilities: ['吞噬'], limitations: ['心魔'] },
      },
    ],
    last_updated: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(stateDir, 'characters.json'), JSON.stringify(characters, null, 2))
}

function cleanupTestWorkspace(): void {
  if (fs.existsSync(testWorkspacePath)) {
    fs.rmSync(testWorkspacePath, { recursive: true, force: true })
  }
}

describe('KnowledgeContextBuilder', () => {
  let builder: KnowledgeContextBuilder
  let stateManager: StateManager

  beforeAll(async () => {
    setupTestWorkspace()
    stateManager = new StateManager(testWorkspacePath)
    await stateManager.initialize()
    builder = new KnowledgeContextBuilder(stateManager, path.join(process.cwd(), 'templates'))
  })

  afterAll(() => {
    cleanupTestWorkspace()
  })

  describe('buildKnowledgeContext', () => {
    it('should build context with rules for the genre', async () => {
      const ctx = await builder.buildKnowledgeContext(1)

      expect(ctx.rules).toBeDefined()
      expect(ctx.rules.length).toBeGreaterThan(0)
      expect(ctx.rules[0].category).toBeDefined()
    })

    it('should include template data when available', async () => {
      const ctx = await builder.buildKnowledgeContext(1)

      if (ctx.template) {
        expect(ctx.template.name).toBeDefined()
        expect(Array.isArray(ctx.template.writingTips)).toBe(true)
      }
    })

    it('should detect correct plot phase for early chapters', async () => {
      const ctx = await builder.buildKnowledgeContext(10)

      if (ctx.plotPhase) {
        // Chapter 10/300 = ~3.3%, should be in "建置" phase
        expect(ctx.plotPhase.name).toBe('建置')
      }
    })

    it('should detect correct plot phase for middle chapters', async () => {
      const ctx = await builder.buildKnowledgeContext(150)

      if (ctx.plotPhase) {
        // Chapter 150/300 = 50%, should be in "对抗" phase
        expect(ctx.plotPhase.name).toBe('对抗')
      }
    })

    it('should include character guidance', async () => {
      const ctx = await builder.buildKnowledgeContext(1)

      expect(ctx.characterGuidance).toBeDefined()
      expect(ctx.characterGuidance.length).toBeGreaterThan(0)

      // 魔尊 (antagonist) should get "阴谋型" pattern
      const antagonist = ctx.characterGuidance.find(c => c.name === '魔尊')
      expect(antagonist).toBeDefined()
      if (antagonist) {
        expect(antagonist.pattern).toBe('阴谋型')
      }
    })
  })

  describe('generateKnowledgePrompt', () => {
    it('should generate a non-empty prompt', async () => {
      const ctx = await builder.buildKnowledgeContext(1)
      const prompt = builder.generateKnowledgePrompt(ctx)

      expect(prompt).toBeDefined()
      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).toContain('写作规则')
    })

    it('should include plot phase info', async () => {
      const ctx = await builder.buildKnowledgeContext(10)
      const prompt = builder.generateKnowledgePrompt(ctx)

      if (ctx.plotPhase) {
        expect(prompt).toContain('当前情节阶段')
        expect(prompt).toContain(ctx.plotPhase.name)
      }
    })
  })
})

describe('CharacterPatternManager.inferPattern', () => {
  const manager = new CharacterPatternManager()

  it('should infer 成长型 for protagonist with low power', () => {
    const result = manager.inferPattern({ name: '小明', role: '主角', power: '练气期' })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('成长型')
  })

  it('should infer 无敌型 for protagonist with high power', () => {
    const result = manager.inferPattern({ name: '大帝', role: '主角', power: '无敌' })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('无敌型')
  })

  it('should infer 阴谋型 for villain', () => {
    const result = manager.inferPattern({ name: '暗影', role: '反派' })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('阴谋型')
  })

  it('should infer 导师 for mentor role', () => {
    const result = manager.inferPattern({ name: '老陈', role: '导师' })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('导师')
  })

  it('should infer 红颜 for love interest', () => {
    const result = manager.inferPattern({ name: '小雪', role: '女主' })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('红颜')
  })

  it('should return null for unknown roles', () => {
    const result = manager.inferPattern({ name: '路人甲', role: '路人' })
    expect(result).toBeNull()
  })
})
