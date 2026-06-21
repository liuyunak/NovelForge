import { z } from 'zod'

export const chapterSummarySchema = z.object({
  chapter_number: z.number(),
  title: z.string(),
  summary: z.string().max(200),
  events: z.array(z.string()),
  characters_present: z.array(z.string()),
  emotion: z.string(),
  hooks_setup: z.array(z.string()),
  hooks_payoff: z.array(z.string()),
  word_count: z.number(),
  created_at: z.string().datetime(),
})

export const chapterSummariesSchema = z.object({
  summaries: z.array(chapterSummarySchema),
  last_updated: z.string().datetime(),
})

export type ChapterSummary = z.infer<typeof chapterSummarySchema>
export type ChapterSummaries = z.infer<typeof chapterSummariesSchema>

export function createDefaultChapterSummary(chapterNumber: number, title: string): ChapterSummary {
  return {
    chapter_number: chapterNumber,
    title,
    summary: '',
    events: [],
    characters_present: [],
    emotion: '',
    hooks_setup: [],
    hooks_payoff: [],
    word_count: 0,
    created_at: new Date().toISOString(),
  }
}
