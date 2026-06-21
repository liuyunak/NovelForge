import { z } from 'zod'

export const itemChangeLogSchema = z.object({
  chapter: z.number(),
  action: z.enum(['acquired', 'lost', 'used', 'given', 'stolen', 'destroyed']),
  from: z.string().optional(),
  to: z.string().optional(),
  quantity_change: z.number().optional(),
  description: z.string(),
})

export const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string(),
  quantity: z.number(),
  owner: z.string(),
  location: z.string().optional(),
  importance: z.number().min(0).max(1),
  change_log: z.array(itemChangeLogSchema),
})

export const particleLedgerSchema = z.object({
  items: z.array(itemSchema),
  last_updated: z.string().datetime(),
})

export type ParticleLedger = z.infer<typeof particleLedgerSchema>
export type Item = z.infer<typeof itemSchema>
export type ItemChangeLog = z.infer<typeof itemChangeLogSchema>

export function createDefaultParticleLedger(): ParticleLedger {
  return {
    items: [],
    last_updated: new Date().toISOString(),
  }
}
