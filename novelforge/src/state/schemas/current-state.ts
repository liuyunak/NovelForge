import { z } from 'zod'

export const factChannelSchema = z.object({
  location: z.string(),
  time: z.string(),
  alive_characters: z.array(z.string()),
  dead_characters: z.array(z.string()),
  current_events: z.array(z.string()),
})

export const intentChannelSchema = z.object({
  preferred_style: z.string().optional(),
  tone: z.string().optional(),
  pacing_preference: z.string().optional(),
  custom_rules: z.array(z.string()).optional(),
})

export const currentStateSchema = z.object({
  fact_channel: factChannelSchema,
  intent_channel: intentChannelSchema,
  last_updated: z.string().datetime(),
})

export type CurrentState = z.infer<typeof currentStateSchema>
export type FactChannel = z.infer<typeof factChannelSchema>
export type IntentChannel = z.infer<typeof intentChannelSchema>

export function createDefaultCurrentState(): CurrentState {
  return {
    fact_channel: {
      location: '',
      time: '',
      alive_characters: [],
      dead_characters: [],
      current_events: [],
    },
    intent_channel: {},
    last_updated: new Date().toISOString(),
  }
}
