import { z } from 'zod'

export const bookConfigSchema = z.object({
  model_override: z.record(z.any()).optional(),
  style_override: z.record(z.any()).optional(),
  audit_override: z.record(z.any()).optional(),
  rhythm_override: z.record(z.any()).optional(),
  target_reader: z.object({
    age_range: z.string(),
    gender_preference: z.string(),
    genre_experience: z.string(),
    abandon_threshold: z.string(),
  }).optional(),
  custom_settings: z.record(z.any()).optional(),
  // Owner of this workspace — used by checkOwnership() for access control.
  // Set on creation; legacy workspaces without it are treated as unowned.
  ownerUserId: z.string().optional(),
  last_updated: z.string().datetime(),
})

export type BookConfig = z.infer<typeof bookConfigSchema>

export function createDefaultBookConfig(): BookConfig {
  return {
    last_updated: new Date().toISOString(),
  }
}
