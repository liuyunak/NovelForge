import { z } from 'zod'

export const learnedRuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  category: z.string(),
  correction_count: z.number(),
  current_weight: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(['suggested', 'weak', 'medium', 'strong', 'hard']),
  source: z.enum(['author_override', 'pattern_detection', 'manual']),
  examples: z.array(z.object({
    chapter: z.number(),
    original: z.string(),
    corrected: z.string(),
  })),
  created_at: z.string().datetime(),
  last_updated: z.string().datetime(),
})

export const learnedRulesSchema = z.object({
  rules: z.array(learnedRuleSchema),
  last_updated: z.string().datetime(),
})

export type LearnedRule = z.infer<typeof learnedRuleSchema>
export type LearnedRules = z.infer<typeof learnedRulesSchema>

export function createDefaultLearnedRule(pattern: string, category: string): LearnedRule {
  return {
    id: `rule_${Date.now()}`,
    pattern,
    category,
    correction_count: 0,
    current_weight: 0.3,
    confidence: 0.5,
    status: 'suggested',
    source: 'pattern_detection',
    examples: [],
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  }
}
