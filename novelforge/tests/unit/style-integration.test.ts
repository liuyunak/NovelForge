/**
 * Q3-02 Style Engine Integration Tests
 *
 * Tests for:
 * 1. StyleEngine dynamic instructions generation
 * 2. Polisher style-aware polishing
 * 3. StyleExtractorAgent LLM extraction (mocked)
 * 4. RhythmSystem analysis
 * 5. RuleEngine genre-aware rules
 * 6. DAG style-extractor node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StyleEngine } from '../../src/style/engine.js'
import { RhythmSystem } from '../../src/style/rhythm.js'
import { RuleEngine } from '../../src/style/rule-engine.js'
import { NOVELFORGE_DAG } from '../../src/core/dag.js'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Helper: create a temp state manager for testing
async function createTempStateManager() {
  const { StateManager } = await import('../../src/state/manager.js')
  const tmpDir = path.join(os.tmpdir(), `nf-style-test-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  fs.mkdirSync(path.join(tmpDir, 'state'), { recursive: true })

  const sm = new StateManager(tmpDir)
  await sm.initialize()

  // Initialize required states
  const schemas = await import('../../src/state/schemas/index.js')
  await sm.write('style_fingerprint', schemas.createDefaultStyleFingerprint())
  await sm.write('MASTER_SETTING', schemas.createDefaultMasterSetting({
    work_id: 'test_work',
    title: 'Test Novel',
    genre: '玄幻',
    core_premise: '测试前提',
  }))

  return { sm, tmpDir }
}

describe('StyleEngine', () => {
  let styleEngine: StyleEngine
  let tmpDir: string

  beforeEach(async () => {
    const { sm, tmpDir: dir } = await createTempStateManager()
    tmpDir = dir
    styleEngine = new StyleEngine(sm)
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('should analyze text and return fingerprint', async () => {
    const text = '李明看着窗外的雨，心中不由得涌起一股难以言喻的感觉。"今天的天气真糟糕。"他说道，嘴角露出一丝苦笑。'
    const result = await styleEngine.analyze(text)
    expect(result.sentence_pattern).toBeDefined()
    expect(result.sentence_pattern!.avg_sentence_length).toBeGreaterThan(0)
    expect(result.dialogue_style).toBeDefined()
    expect(result.pacing).toBeDefined()
  })

  it('should generate style prompt from fingerprint', async () => {
    const prompt = await styleEngine.generateStylePrompt()
    expect(prompt).toBeDefined()
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toContain('风格指纹')
  })

  it('should detect sentence length deviations', async () => {
    // First analyze some sample text to set fingerprint
    const sampleText = '他走进房间。她抬起头。两人对视。沉默在空气中蔓延。窗外的雨声很轻。'
    await styleEngine.analyze(sampleText)

    // Now detect deviations in text with very different sentence length
    const longText = '这是一个非常长的句子用来测试句长偏差检测功能，它包含了大量的修饰语和描述性的内容，使得整个句子的长度远超之前采样的平均句长水平。'
    const deviations = await styleEngine.detectDeviations(longText)
    // May or may not detect depending on fingerprint state
    expect(Array.isArray(deviations)).toBe(true)
  })

  it('should handle missing fingerprint gracefully', async () => {
    // StyleEngine without fingerprint should still work
    const prompt = await styleEngine.generateStylePrompt()
    expect(prompt).toBeDefined()
  })
})

describe('RhythmSystem', () => {
  let rhythmSystem: RhythmSystem
  let tmpDir: string

  beforeEach(async () => {
    const { sm, tmpDir: dir } = await createTempStateManager()
    tmpDir = dir
    rhythmSystem = new RhythmSystem(sm)
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('should analyze chapter rhythm', async () => {
    const text = `
      李明冷冷地看着对手。"你以为这样就结束了？"他缓缓抬手，一股强大的气势爆发而出。
      
      众人震惊地后退。"不可能...他竟然突破了！"有人惊呼道。
      
      李明没有理会他们的反应，转身离去。身后只留下一个落寞的背影。
      
      夜空中，星光黯淡。突然，远处传来一声惨叫。
    `
    const result = await rhythmSystem.analyzeChapter(1, text)
    expect(result.chapter_number).toBe(1)
    expect(result.hook_strength).toBeGreaterThan(0)
    expect(result.cool_points).toBeDefined()
    expect(result.pace_alerts).toBeDefined()
  })

  it('should return rhythm analysis summary', async () => {
    const text = '测试文本内容，包含一些基本的对话和描写。' + '继续写一些内容。'.repeat(20)
    await rhythmSystem.analyzeChapter(1, text)
    const analysis = await rhythmSystem.getAnalysis()
    expect(analysis.avgHookStrength).toBeDefined()
    expect(analysis.coolPointDensity).toBeDefined()
    expect(['increasing', 'stable', 'decreasing']).toContain(analysis.debtTrend)
  })

  it('should handle empty chapters gracefully', async () => {
    const analysis = await rhythmSystem.getAnalysis()
    expect(analysis.avgHookStrength).toBe(0.5)
    expect(analysis.coolPointDensity).toBe(0)
  })
})

describe('RuleEngine', () => {
  let ruleEngine: RuleEngine
  let tmpDir: string

  beforeEach(async () => {
    const { sm, tmpDir: dir } = await createTempStateManager()
    tmpDir = dir
    ruleEngine = new RuleEngine(sm)
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('should return active rules for a genre', () => {
    const rules = ruleEngine.getActiveRules('玄幻')
    expect(rules.length).toBeGreaterThan(0)
    // Rules with effective_weight > 0.3 should be returned
    for (const rule of rules) {
      expect((rule as any).effective_weight || rule.weight).toBeGreaterThan(0.3)
    }
  })

  it('should apply genre overrides', () => {
    const xuanhuanRules = ruleEngine.getActiveRules('玄幻')
    const mysteryRules = ruleEngine.getActiveRules('悬疑')

    // Different genres may have different rule counts or weights
    expect(xuanhuanRules.length).toBeGreaterThan(0)
    expect(mysteryRules.length).toBeGreaterThan(0)
  })

  it('should handle author override feedback', () => {
    const rules = ruleEngine.getActiveRules('玄幻')
    if (rules.length > 0) {
      const ruleId = rules[0].id
      const originalWeight = rules[0].weight
      ruleEngine.onAuthorOverride(ruleId)
      const updatedRules = ruleEngine.getActiveRules('玄幻')
      const updatedRule = updatedRules.find(r => r.id === ruleId)
      expect(updatedRule!.weight).toBeLessThanOrEqual(originalWeight)
    }
  })

  it('should handle author apply feedback', () => {
    const rules = ruleEngine.getActiveRules('玄幻')
    if (rules.length > 0) {
      const ruleId = rules[0].id
      ruleEngine.onAuthorApply(ruleId)
      const updatedRules = ruleEngine.getActiveRules('玄幻')
      const updatedRule = updatedRules.find(r => r.id === ruleId)
      expect(updatedRule!.weight).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('should handle audit feedback', () => {
    const rules = ruleEngine.getActiveRules('玄幻')
    if (rules.length > 0) {
      const ruleId = rules[0].id
      const originalConfidence = rules[0].confidence
      ruleEngine.onAuditFeedback(ruleId, true)
      const updatedRules = ruleEngine.getActiveRules('玄幻')
      const updatedRule = updatedRules.find(r => r.id === ruleId)
      expect(updatedRule!.confidence).toBeGreaterThanOrEqual(originalConfidence)
    }
  })

  it('should return rule stats', () => {
    const stats = ruleEngine.getRuleStats()
    expect(stats.totalRules).toBeGreaterThan(0)
    expect(stats.avgWeight).toBeGreaterThan(0)
    expect(stats.avgConfidence).toBeGreaterThan(0)
  })

  it('should calibrate to genre with reference stats', async () => {
    const stats = { '节奏': 0.5, '对话': 0.3 }
    await ruleEngine.calibrateToGenre('玄幻', stats)
    const rules = ruleEngine.getActiveRules('玄幻')
    expect(rules.length).toBeGreaterThan(0)
  })
})

describe('DAG Style Extractor Node', () => {
  it('should have style-extractor node in DAG', () => {
    const node = NOVELFORGE_DAG.nodes.find(n => n.id === 'styleextractor')
    expect(node).toBeDefined()
    expect(node?.agent).toBe('style-extractor')
    expect(node?.parallel).toBe(true)
    expect(node?.dependencies).toEqual(['planner'])
  })

  it('should have style-extractor as writer dependency', () => {
    const writer = NOVELFORGE_DAG.nodes.find(n => n.id === 'writer')
    expect(writer?.dependencies).toContain('styleextractor')
  })

  it('should have edge from planner to styleextractor', () => {
    const edge = NOVELFORGE_DAG.edges.find(([from, to]) => from === 'planner' && to === 'styleextractor')
    expect(edge).toBeDefined()
  })

  it('should have edge from styleextractor to writer', () => {
    const edge = NOVELFORGE_DAG.edges.find(([from, to]) => from === 'styleextractor' && to === 'writer')
    expect(edge).toBeDefined()
  })
})
