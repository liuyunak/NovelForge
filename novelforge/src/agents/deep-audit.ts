import { z } from 'zod'
import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import type { DeepAuditResult, AuditIssue, AutoFix } from '../types/index.js'
import { logger } from '../logger.js'

const auditIssueSchema = z.object({
  dimension: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  location: z.string(),
  description: z.string(),
  suggestion: z.string(),
  auto_fixable: z.boolean(),
})

const autoFixSchema = z.object({
  location: z.string(),
  original: z.string(),
  fixed: z.string(),
  reason: z.string(),
})

const deepAuditResultSchema = z.object({
  score: z.number(),
  issues: z.array(auditIssueSchema),
  auto_fixes: z.array(autoFixSchema),
  human_decision_required: z.array(z.string()),
})

export class DeepAuditAgent {
  private router: ModelRouter
  private stateManager: StateManager

  constructor(router: ModelRouter, stateManager: StateManager) {
    this.router = router
    this.stateManager = stateManager
  }

  async audit(chapterText: string, chapterNumber: number, fullTextContext?: string): Promise<DeepAuditResult> {
    const masterSetting = await this.stateManager.read('MASTER_SETTING')
    const characters = await this.stateManager.read('characters')

    const systemPrompt = `你是一位专业的小说审计师。请分析以下章节内容，检查15个维度的质量。

审计维度：
1. 角色动机合理性
2. 角色行为一致性
3. 角色对话风格
4. 设定一致性
5. 逻辑合理性
6. 伏笔状态
7. 悬念强度
8. 战力等级
9. 越级合理性
10. 情绪曲线
11. 节奏变化
12. 句式重复
13. 情感空洞
14. 情节逻辑
15. 因果关系

输出JSON格式：
{
  "score": 0-100分,
  "issues": [
    {
      "dimension": "维度名称",
      "severity": "low/medium/high/critical",
      "location": "位置描述",
      "description": "问题描述",
      "suggestion": "修改建议",
      "auto_fixable": true/false
    }
  ],
  "auto_fixes": [
    {
      "location": "位置",
      "original": "原文",
      "fixed": "修改后",
      "reason": "修改原因"
    }
  ],
  "human_decision_required": ["需要人工判断的问题"]
}`

    const fullTextSection = fullTextContext
      ? `\n[最近20章全文参考 - 用于跨章节一致性检查]\n${fullTextContext}\n`
      : ''

    const userPrompt = `作品设定：
${JSON.stringify(masterSetting, null, 2)}

角色列表：
${characters.characters.map((c: any) => `${c.name} (${c.role})`).join(', ')}

当前章节（第${chapterNumber}章）内容：
${chapterText}
${fullTextSection}
请进行深度审计。`

    const result = await this.router.generate('deep-audit', systemPrompt, userPrompt)
    
    try {
      const parsed = JSON.parse(result)
      const validation = deepAuditResultSchema.safeParse(parsed)
      if (!validation.success) {
        logger.warn('DeepAudit response validation failed: %o', validation.error.issues)
        return this.getErrorResult('LLM response failed schema validation')
      }
      return { ...validation.data, parse_error: false }
    } catch (e) {
      logger.warn('DeepAudit response parse error: %s', e instanceof Error ? e.message : e)
      return this.getErrorResult(e instanceof Error ? e.message : 'Unknown parse error')
    }
  }

  private getErrorResult(reason: string): DeepAuditResult {
    return {
      score: -1,
      issues: [{
        dimension: 'parse_error',
        severity: 'critical',
        location: 'deep-audit response',
        description: `DeepAudit LLM response could not be parsed: ${reason}`,
        suggestion: 'Re-run audit or check LLM output quality',
        auto_fixable: false,
      }],
      auto_fixes: [],
      human_decision_required: ['DeepAudit解析失败，需要人工审查该章节'],
      parse_error: true,
    }
  }
}
