import { z } from 'zod'

export const worldviewEntrySchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  relatedCharacters: z.array(z.string()).optional(),
})

export const worldviewSchema = z.object({
  entries: z.array(worldviewEntrySchema),
  last_updated: z.string().datetime().optional(),
})

export type WorldviewEntry = z.infer<typeof worldviewEntrySchema>
export type Worldview = z.infer<typeof worldviewSchema>

export function createDefaultWorldview(): Worldview {
  return {
    entries: [],
  }
}
