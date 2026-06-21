import { z } from 'zod'

export const hookSchema = z.object({
  content: z.string(),
  setup_chapter: z.number(),
  expected_payoff: z.number(),
  type: z.string().optional(),
})

export const characterStateSchema = z.object({
  power: z.string().optional(),
  location: z.string().optional(),
  items: z.array(z.string()).optional(),
  mood: z.string().optional(),
  status: z.string().optional(),
})

export const workingMemorySchema = z.object({
  chapter_number: z.number(),
  summary: z.string(),
  character_states: z.record(characterStateSchema),
  hot_hooks: z.array(hookSchema),
  recent_events: z.array(z.string()),
  dream_summary: z.string().optional(),
  updated_at: z.string().datetime(),
})

export type WorkingMemory = z.infer<typeof workingMemorySchema>
export type Hook = z.infer<typeof hookSchema>
export type CharacterState = z.infer<typeof characterStateSchema>

export function createDefaultWorkingMemory(chapterNumber: number): WorkingMemory {
  return {
    chapter_number: chapterNumber,
    summary: '',
    character_states: {},
    hot_hooks: [],
    recent_events: [],
    updated_at: new Date().toISOString(),
  }
}
