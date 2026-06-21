import { z } from 'zod'
import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import { logger } from '../logger.js'

const sceneCardSchema = z.object({
  scene_number: z.number(),
  location: z.string(),
  time: z.string(),
  atmosphere: z.string(),
  characters_present: z.array(z.string()),
  pov_character: z.string(),
  scene_goal: z.string(),
  scene_conflict: z.string(),
  key_beats: z.array(z.string()),
  hooks_connection: z.array(z.string()),
  word_count_estimate: z.number(),
})

const chapterPlanSchema = z.object({
  chapter_number: z.number(),
  title: z.string(),
  word_count_target: z.number(),
  core_event: z.string(),
  characters_in: z.array(z.string()),
  hooks_to_setup: z.array(z.object({
    content: z.string(),
    expected_payoff_chapter: z.number(),
  })),
  hooks_to_payoff: z.array(z.string()),
  subplot_touch: z.record(z.string()),
  satisfaction_preview: z.string(),
  scenes: z.array(sceneCardSchema),
})

export interface ChapterPlan {
  chapter_number: number
  title: string
  word_count_target: number
  core_event: string
  characters_in: string[]
  hooks_to_setup: { content: string; expected_payoff_chapter: number }[]
  hooks_to_payoff: string[]
  subplot_touch: Record<string, string>
  satisfaction_preview: string
  scenes: SceneCard[]
}

export interface SceneCard {
  scene_number: number
  location: string
  time: string
  atmosphere: string
  characters_present: string[]
  pov_character: string
  scene_goal: string
  scene_conflict: string
  key_beats: string[]
  hooks_connection: string[]
  word_count_estimate: number
}

export class PlannerAgent {
  private router: ModelRouter
  private stateManager: StateManager

  constructor(router: ModelRouter, stateManager: StateManager) {
    this.router = router
    this.stateManager = stateManager
  }

  async plan(currentChapter: number): Promise<ChapterPlan> {
    const masterSetting = await this.stateManager.read('MASTER_SETTING')
    const workingMemory = await this.stateManager.read('working_memory')
    const characters = await this.stateManager.read('characters')

    const systemPrompt = `你是一位专业的网文规划师。请根据以下信息生成章节规划。

输出JSON格式：
{
  "chapter_number": 章节号,
  "title": 章节标题,
  "word_count_target": 目标字数(3000),
  "core_event": 核心事件,
  "characters_in": ["出场角色"],
  "hooks_to_setup": [{"content": "钩子内容", "expected_payoff_chapter": 回收章节}],
  "hooks_to_payoff": ["本章回收的钩子"],
  "subplot_touch": {"支线名": "推进内容"},
  "satisfaction_preview": "爽点预览",
  "scenes": [场景卡数组]
}

场景卡格式：
{
  "scene_number": 场景号,
  "location": 地点,
  "time": 时间,
  "atmosphere": 氛围,
  "characters_present": ["出场角色"],
  "pov_character": 视角角色,
  "scene_goal": 场景目标,
  "scene_conflict": 场景冲突,
  "key_beats": ["关键节拍"],
  "hooks_connection": ["钩子关联"],
  "word_count_estimate": 预估字数
}`

    const userPrompt = `作品设定：
${JSON.stringify(masterSetting, null, 2)}

当前状态：
${JSON.stringify(workingMemory, null, 2)}

角色列表：
${characters.characters.map((c: any) => `${c.name} (${c.role})`).join(', ')}

当前章节：第${currentChapter}章

请生成本章的详细规划。`

    const result = await this.router.generate('planner', systemPrompt, userPrompt)
    
    try {
      const parsed = JSON.parse(result)
      const validation = chapterPlanSchema.safeParse(parsed)
      if (!validation.success) {
        logger.warn({ errors: validation.error.issues }, 'Planner response validation failed')
        return this.getDefaultPlan(currentChapter)
      }
      return validation.data
    } catch (e) {
      logger.warn({ error: e instanceof Error ? e.message : e }, 'Planner response parse error')
      return this.getDefaultPlan(currentChapter)
    }
  }

  private getDefaultPlan(chapterNumber: number): ChapterPlan {
    return {
      chapter_number: chapterNumber,
      title: `Chapter ${chapterNumber}`,
      word_count_target: 3000,
      core_event: '待规划',
      characters_in: [],
      hooks_to_setup: [],
      hooks_to_payoff: [],
      subplot_touch: {},
      satisfaction_preview: '',
      scenes: [],
    }
  }
}
