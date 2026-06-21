import { z } from 'zod'

export const forbiddenPatternSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  replacement_suggestion: z.string().optional(),
})

export const sentenceTemplateSchema = z.object({
  id: z.string(),
  template: z.string(),
  category: z.string(),
  examples: z.array(z.string()),
})

export const paragraphPatternSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  description: z.string(),
  detection_method: z.enum(['regex', 'statistical', 'semantic']),
})

export const dialogueRuleSchema = z.object({
  id: z.string(),
  rule: z.string(),
  examples: z.array(z.string()),
  severity: z.enum(['low', 'medium', 'high']),
})

export const aiFingerprintBlacklistSchema = z.object({
  forbidden_patterns: z.array(forbiddenPatternSchema),
  sentence_templates: z.array(sentenceTemplateSchema),
  paragraph_patterns: z.array(paragraphPatternSchema),
  dialogue_rules: z.array(dialogueRuleSchema),
  last_updated: z.string().datetime(),
})

export type AIFingerprintBlacklist = z.infer<typeof aiFingerprintBlacklistSchema>
export type ForbiddenPattern = z.infer<typeof forbiddenPatternSchema>
export type SentenceTemplate = z.infer<typeof sentenceTemplateSchema>

export function createDefaultAIFingerprintBlacklist(): AIFingerprintBlacklist {
  return {
    forbidden_patterns: [
      {
        id: 'fp_001',
        pattern: '不仅如此',
        description: '典型AI过渡词',
        severity: 'high',
        replacement_suggestion: '去掉或用具体描述替代',
      },
      {
        id: 'fp_002',
        pattern: '然而.{0,5}却',
        description: 'AI转折句式',
        severity: 'high',
        replacement_suggestion: '用"可""却"单用',
      },
      {
        id: 'fp_003',
        pattern: '在.{2,10}的过程中',
        description: 'AI过程描述句式',
        severity: 'high',
        replacement_suggestion: '直接描述动作',
      },
    ],
    sentence_templates: [],
    paragraph_patterns: [],
    dialogue_rules: [
      {
        id: 'dr_001',
        rule: '禁止"你说的对""我明白了""这怎么可能"',
        examples: ['你说的对', '我明白了', '这怎么可能'],
        severity: 'medium',
      },
    ],
    last_updated: new Date().toISOString(),
  }
}
