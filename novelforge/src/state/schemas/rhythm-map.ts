import { z } from 'zod'

export const chapterRhythmSchema = z.object({
  chapter_number: z.number(),
  hook_strength: z.number().min(0).max(1),
  cool_points: z.array(z.object({
    type: z.string(),
    intensity: z.number().min(0).max(1),
    paragraph: z.number(),
  })),
  micro_payoffs: z.number(),
  emotional_curve: z.array(z.number()),
  pace_alerts: z.array(z.string()),
  reading_debt_snapshot: z.number(),
})

export const rhythmMapSchema = z.object({
  chapters: z.array(chapterRhythmSchema),
  overall_metrics: z.object({
    avg_hook_strength: z.number(),
    avg_cool_point_density: z.number(),
    total_payoffs: z.number(),
    debt_trend: z.enum(['increasing', 'stable', 'decreasing']),
  }),
  last_updated: z.string().datetime(),
})

export type RhythmMap = z.infer<typeof rhythmMapSchema>
export type ChapterRhythm = z.infer<typeof chapterRhythmSchema>

export function createDefaultChapterRhythm(chapterNumber: number): ChapterRhythm {
  return {
    chapter_number: chapterNumber,
    hook_strength: 0.5,
    cool_points: [],
    micro_payoffs: 0,
    emotional_curve: [],
    pace_alerts: [],
    reading_debt_snapshot: 0,
  }
}
