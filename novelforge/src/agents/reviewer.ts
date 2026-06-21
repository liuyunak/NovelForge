import { z } from 'zod'
import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import { FullTextMemory } from '../memory/full-text-memory.js'
import { logger } from '../logger.js'

const reviewResultSchema = z.object({
  healthReport: z.object({
    consistencyScore: z.number(),
    rhythmScore: z.number(),
    hookHealth: z.enum(['良好', '一般', '较差']),
    stallWarnings: z.array(z.string()),
    issues: z.array(z.object({
      type: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      description: z.string(),
    })).optional(),
  }),
  readerSimulation: z.object({
    engagementCurve: z.array(z.number()),
    abandonRiskPoints: z.array(z.string()),
    satisfactionHits: z.array(z.string()),
    wouldContinue: z.boolean().default(true),
  }),
  recommendations: z.array(z.string()).optional(),
})

export interface ReviewIssue {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
}

export interface ReviewResult {
  healthReport: {
    consistencyScore: number
    rhythmScore: number
    hookHealth: '良好' | '一般' | '较差'
    stallWarnings: string[]
    issues?: ReviewIssue[]
  }
  readerSimulation: {
    engagementCurve: number[]
    abandonRiskPoints: string[]
    satisfactionHits: string[]
    wouldContinue: boolean
  }
  recommendations?: string[]
}

export class ReviewerAgent {
  private router: ModelRouter
  private stateManager: StateManager
  private fullTextMemory: FullTextMemory

  constructor(router: ModelRouter, stateManager: StateManager, fullTextMemory: FullTextMemory) {
    this.router = router
    this.stateManager = stateManager
    this.fullTextMemory = fullTextMemory
  }

  async review(chapterText?: string, chapterPlan?: any): Promise<ReviewResult> {
    const masterSetting = await this.stateManager.read('MASTER_SETTING')
    
    // Use provided chapter text or fetch from memory
    const recentText = chapterText || await this.fullTextMemory.getRecentChapters(5)

    const systemPrompt = `你是一位专业的小说评审员。请对以下小说内容进行健康评估和读者模拟。

输出JSON格式：
{
  "healthReport": {
    "consistencyScore": 0-100,
    "rhythmScore": 0-100,
    "hookHealth": "良好/一般/较差",
    "stallWarnings": ["停滞警告"],
    "issues": [{"type": "问题类型", "severity": "low/medium/high", "description": "描述"}]
  },
  "readerSimulation": {
    "engagementCurve": [0-1的数组],
    "abandonRiskPoints": ["弃书风险点"],
    "satisfactionHits": ["满意点"],
    "wouldContinue": true/false
  },
  "recommendations": ["改进建议"]
}`

    const userPrompt = `作品信息：
标题: ${masterSetting?.title || '未知'}
题材: ${masterSetting?.genre || '未知'}
${chapterPlan ? `章节: ${chapterPlan.chapter_number} - ${chapterPlan.title || ''}` : ''}

${chapterText ? `待评审内容：\n${chapterText}` : '最近内容：\n' + recentText.slice(-3000)}

请进行全面评审。`

    const result = await this.router.generate('planner', systemPrompt, userPrompt)
    
    try {
      const parsed = JSON.parse(result)
      const validation = reviewResultSchema.safeParse(parsed)
      if (!validation.success) {
        logger.warn({ issues: validation.error.issues }, 'Reviewer response validation failed')
        return this.getDefaultResult()
      }
      return validation.data
    } catch (e) {
      logger.warn({ error: e instanceof Error ? e.message : String(e) }, 'Reviewer response parse error')
      return this.getDefaultResult()
    }
  }

  private getDefaultResult(): ReviewResult {
    return {
      healthReport: {
        consistencyScore: 70,
        rhythmScore: 70,
        hookHealth: '一般',
        stallWarnings: [],
      },
      readerSimulation: {
        engagementCurve: [0.8, 0.75, 0.7, 0.65, 0.7],
        abandonRiskPoints: [],
        satisfactionHits: [],
        wouldContinue: true,
      },
    }
  }
}
