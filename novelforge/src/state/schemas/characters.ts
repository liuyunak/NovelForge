import { z } from 'zod'

export const oceanSchema = z.object({
  openness: z.number().min(0).max(1),
  conscientiousness: z.number().min(0).max(1),
  extraversion: z.number().min(0).max(1),
  agreeableness: z.number().min(0).max(1),
  neuroticism: z.number().min(0).max(1),
})

export const relationshipSchema = z.object({
  target: z.string(),
  type: z.string(),
  description: z.string(),
  emotional_state: z.string().optional(),
})

export const growthMilestoneSchema = z.object({
  chapter: z.number(),
  event: z.string(),
  impact: z.string(),
})

export const characterSchema = z.object({
  name: z.string(),
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']),
  basic: z.object({
    age: z.number().optional(),
    gender: z.string().optional(),
    appearance: z.string().optional(),
    background: z.string(),
  }),
  ocean: oceanSchema,
  speech: z.object({
    style: z.string(),
    catchphrases: z.array(z.string()),
    taboo_words: z.array(z.string()),
  }),
  behavior_rules: z.array(z.string()),
  relationships: z.array(relationshipSchema),
  emotional_arc: z.array(z.object({
    chapter: z.number(),
    emotion: z.string(),
    trigger: z.string(),
  })),
  growth_milestones: z.array(growthMilestoneSchema),
  power: z.object({
    level: z.string(),
    abilities: z.array(z.string()),
    limitations: z.array(z.string()),
  }).optional(),
})

export const charactersSchema = z.object({
  characters: z.array(characterSchema),
  last_updated: z.string().datetime(),
})

export type Character = z.infer<typeof characterSchema>
export type Characters = z.infer<typeof charactersSchema>
export type Ocean = z.infer<typeof oceanSchema>
export type Relationship = z.infer<typeof relationshipSchema>

export function createDefaultCharacter(name: string, role: Character['role']): Character {
  return {
    name,
    role,
    basic: {
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
      catchphrases: [],
      taboo_words: [],
    },
    behavior_rules: [],
    relationships: [],
    emotional_arc: [],
    growth_milestones: [],
  }
}
