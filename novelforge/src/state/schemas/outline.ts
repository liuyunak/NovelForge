import { z } from 'zod'

export const outlineItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  chapterRange: z.object({
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  }).optional(),
  beats: z.array(z.string()).optional(),
  status: z.enum(['planned', 'in_progress', 'completed']).optional(),
})

export const outlineSchema = z.object({
  outlines: z.array(outlineItemSchema),
  last_updated: z.string().datetime().optional(),
})

export type OutlineItem = z.infer<typeof outlineItemSchema>
export type Outline = z.infer<typeof outlineSchema>

export function createDefaultOutline(): Outline {
  return {
    outlines: [],
  }
}
