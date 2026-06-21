import { z } from 'zod'

export const styleFingerprintSchema = z.object({
  sentence_pattern: z.object({
    avg_sentence_length: z.number(),
    short_sentence_ratio: z.number().min(0).max(1),
    complex_sentence_ratio: z.number().min(0).max(1),
  }),
  vocabulary: z.object({
    preferred_verbs: z.array(z.string()),
    preferred_nouns: z.array(z.string()),
    filler_word_rate: z.number().min(0).max(1),
  }),
  dialogue_style: z.object({
    tag_preference: z.enum(['道', '说', 'none']),
    action_with_dialogue: z.boolean(),
    avg_dialogue_length: z.number(),
  }),
  rhetoric: z.object({
    metaphor_density: z.number().min(0).max(1),
    preferred_rhetoric: z.array(z.string()),
    sensory_preference: z.array(z.string()),
  }),
  pacing: z.object({
    description_to_action_ratio: z.number(),
    inner_monologue_ratio: z.number().min(0).max(1),
  }),
  metadata: z.object({
    source_chapters: z.number(),
    extraction_date: z.string().datetime(),
    confidence: z.number().min(0).max(1),
  }).optional(),
})

export type StyleFingerprint = z.infer<typeof styleFingerprintSchema>

export function createDefaultStyleFingerprint(): StyleFingerprint {
  return {
    sentence_pattern: {
      avg_sentence_length: 15,
      short_sentence_ratio: 0.5,
      complex_sentence_ratio: 0.3,
    },
    vocabulary: {
      preferred_verbs: [],
      preferred_nouns: [],
      filler_word_rate: 0.02,
    },
    dialogue_style: {
      tag_preference: 'none',
      action_with_dialogue: true,
      avg_dialogue_length: 15,
    },
    rhetoric: {
      metaphor_density: 0.1,
      preferred_rhetoric: ['比喻', '排比'],
      sensory_preference: ['视觉', '听觉'],
    },
    pacing: {
      description_to_action_ratio: 0.3,
      inner_monologue_ratio: 0.1,
    },
    metadata: {
      source_chapters: 0,
      extraction_date: new Date().toISOString(),
      confidence: 0,
    },
  }
}
