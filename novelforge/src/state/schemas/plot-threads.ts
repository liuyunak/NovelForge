import { z } from 'zod'

export const subplotSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  progress: z.number().min(0).max(1),
  milestones: z.array(z.object({
    chapter: z.number(),
    event: z.string(),
    completed: z.boolean(),
  })),
  status: z.enum(['active', 'paused', 'resolved']),
})

export const plotHookSchema = z.object({
  id: z.string(),
  content: z.string(),
  type: z.enum(['setup', 'payoff', 'cliffhanger']),
  setup_chapter: z.number(),
  expected_payoff_chapter: z.number().optional(),
  actual_payoff_chapter: z.number().optional(),
  status: z.enum(['active', 'overdue', 'resolved']),
  strength: z.number().min(0).max(1),
})

export const plotThreadsSchema = z.object({
  subplots: z.array(subplotSchema),
  hooks: z.array(plotHookSchema),
  reading_debt: z.object({
    current: z.number(),
    target: z.number(),
    trend: z.enum(['increasing', 'stable', 'decreasing']),
  }),
  last_updated: z.string().datetime(),
})

export type PlotThreads = z.infer<typeof plotThreadsSchema>
export type Subplot = z.infer<typeof subplotSchema>
export type PlotHook = z.infer<typeof plotHookSchema>

export function createDefaultPlotThreads(): PlotThreads {
  return {
    subplots: [],
    hooks: [],
    reading_debt: {
      current: 0,
      target: 0,
      trend: 'stable',
    },
    last_updated: new Date().toISOString(),
  }
}
