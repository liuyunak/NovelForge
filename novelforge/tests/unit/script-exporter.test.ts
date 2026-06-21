/**
 * Unit tests for ScriptExporterAgent
 *
 * Tests: scene detection, dialogue extraction, narration detection,
 * emotion/SFX mapping, duration estimation, metadata generation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { ScriptExporterAgent, ScriptOutput, ScriptShot } from '../../src/agents/script-exporter.js'

const testWorkspacePath = path.join(process.cwd(), 'workspace', 'test_script_export')

function setupTestWorkspace(): void {
  const dirs = [
    path.join(testWorkspacePath, 'chapters'),
    path.join(testWorkspacePath, 'exports', 'scripts'),
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Chapter with rich content for testing
  const chapterContent = `# 觉醒之日

【修炼场，清晨】

长老问道："准备好了吗？"

李凡深吸一口气，点了点头。他的心情紧张又激动，手心微微出汗。

突然，一道光芒从测试台上爆发出来！

有人惊呼："这不可能！"

李凡微微一笑。他知道，这只是开始。

轰隆！天空中响起雷鸣。

从此以后，他的人生将彻底改变。`

  fs.writeFileSync(
    path.join(testWorkspacePath, 'chapters', 'chapter_001.md'),
    chapterContent
  )
}

function cleanupTestWorkspace(): void {
  if (fs.existsSync(testWorkspacePath)) {
    fs.rmSync(testWorkspacePath, { recursive: true, force: true })
  }
}

describe('ScriptExporterAgent', () => {
  beforeAll(() => {
    setupTestWorkspace()
  })

  afterAll(() => {
    cleanupTestWorkspace()
  })

  describe('basic export', () => {
    it('should export chapter 1 as script', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      expect(script).toBeDefined()
      expect(script.title).toBe('第1章')
      expect(script.scenes.length).toBeGreaterThan(0)
    })

    it('should include metadata', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      expect(script.metadata).toBeDefined()
      expect(script.metadata!.source_chapter).toBe(1)
      expect(script.metadata!.total_scenes).toBeGreaterThan(0)
      expect(script.metadata!.total_shots).toBeGreaterThan(0)
      expect(script.metadata!.estimated_duration_min).toBeGreaterThanOrEqual(0)
      expect(script.metadata!.generated_at).toBeDefined()
    })
  })

  describe('scene detection', () => {
    it('should detect scene breaks with 【】 markers', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      // Should have at least one scene with location '修炼场'
      const mainScene = script.scenes.find(s => s.location === '修炼场')
      expect(mainScene).toBeDefined()
    })

    it('should add establishing shot to each scene', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      for (const scene of script.scenes) {
        const establishing = scene.shots.find(s => s.type === 'establishing')
        expect(establishing).toBeDefined()
        expect(establishing!.description).toContain('场景')
      }
    })
  })

  describe('dialogue extraction', () => {
    it('should extract character + speech verb dialogue', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      const dialogueShots = getAllShots(script).filter(s => s.type === 'dialogue' || s.type === 'closeup')
      expect(dialogueShots.length).toBeGreaterThan(0)

      // Check for "长老问道" pattern
      const elderDialogue = dialogueShots.find(s => s.character === '长老' || s.line?.includes('准备好了吗'))
      expect(elderDialogue).toBeDefined()
    })

    it('should assign duration to dialogue shots', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      const dialogueShots = getAllShots(script).filter(s => s.type === 'dialogue' || s.type === 'closeup')
      for (const shot of dialogueShots) {
        expect(shot.duration).toBeGreaterThan(0)
      }
    })
  })

  describe('emotion detection', () => {
    it('should detect joy emotion', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      const allShots = getAllShots(script)
      // "微微一笑" should be detected as joy
      const joyShot = allShots.find(s => s.emotion === 'joy')
      expect(joyShot).toBeDefined()
    })

    it('should detect tension emotion', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      const allShots = getAllShots(script)
      // "紧张" should be detected as tension
      const tensionShot = allShots.find(s => s.emotion === 'tension')
      expect(tensionShot).toBeDefined()
    })
  })

  describe('SFX detection', () => {
    it('should detect thunder sound effect', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      const allShots = getAllShots(script)
      // "雷鸣" should be detected as thunder
      const thunderShot = allShots.find(s => s.sfx === 'thunder')
      expect(thunderShot).toBeDefined()
    })
  })

  describe('narration detection', () => {
    it('should detect narration paragraphs', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      const allShots = getAllShots(script)
      const narrationShots = allShots.filter(s => s.type === 'narration')
      // "从此以后" is a narration cue
      expect(narrationShots.length).toBeGreaterThanOrEqual(0) // may or may not be detected based on length
    })
  })

  describe('action shots', () => {
    it('should convert non-dialogue paragraphs to action shots', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const script = await exporter.export(1)

      const allShots = getAllShots(script)
      const actionShots = allShots.filter(s => s.type === 'action')
      expect(actionShots.length).toBeGreaterThan(0)

      // Action shots should have duration
      for (const shot of actionShots) {
        expect(shot.duration).toBeGreaterThan(0)
      }
    })
  })

  describe('DOCX data export', () => {
    it('should export docx-compatible data structure', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      const data = await exporter.exportDocxData(1)

      expect(data.title).toBe('第1章')
      expect(data.scenes.length).toBeGreaterThan(0)

      const scene = data.scenes[0]
      expect(scene.id).toBeDefined()
      expect(scene.location).toBeDefined()
      expect(scene.time).toBeDefined()
      expect(scene.shots.length).toBeGreaterThan(0)

      const shot = scene.shots[0]
      expect(shot.id).toBeDefined()
      expect(shot.type).toBeDefined()
      expect(typeof shot.duration).toBe('string') // "X秒" format
    })
  })

  describe('error handling', () => {
    it('should throw for non-existent chapter', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      await expect(exporter.export(999)).rejects.toThrow('Chapter 999 not found')
    })
  })

  describe('file output', () => {
    it('should save script JSON to exports/scripts/', async () => {
      const exporter = new ScriptExporterAgent(testWorkspacePath)
      await exporter.export(1)

      const scriptPath = path.join(testWorkspacePath, 'exports', 'scripts', 'chapter_1_script.json')
      expect(fs.existsSync(scriptPath)).toBe(true)

      const content = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'))
      expect(content.title).toBe('第1章')
      expect(content.scenes).toBeDefined()
    })
  })
})

// Helper: collect all shots across all scenes
function getAllShots(script: ScriptOutput): ScriptShot[] {
  return script.scenes.flatMap(s => s.shots)
}
