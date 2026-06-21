import { z } from 'zod'

export const modelRoutingSchema = z.object({
  primary: z.string(),
  fallback: z.string().optional(),
  local_fallback: z.string().optional(),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number(),
  cache_enabled: z.boolean().optional(),
})

export const globalConfigSchema = z.object({
  model_routing: z.record(modelRoutingSchema),
  memory: z.object({
    full_text_chapters: z.number(),
    dream_interval: z.number(),
    dream_model: z.string(),
  }),
  audit: z.object({
    fast_audit_enabled: z.boolean(),
    deep_audit_threshold: z.number(),
    pass_as_reference: z.boolean(),
  }),
  knowledge: z.object({
    enabled: z.boolean(),
    vector_db_path: z.string(),
    reference_top_k: z.number(),
    style_learning_only: z.boolean(),
  }),
  local_model: z.object({
    enabled: z.boolean(),
    base_url: z.string(),
    model: z.string(),
  }),
  features: z.object({
    cover_generation: z.boolean(),
    script_export: z.boolean(),
    ai_detection: z.boolean(),
    style_transfer: z.boolean(),
  }),
})

export type GlobalConfig = z.infer<typeof globalConfigSchema>
export type ModelRouting = z.infer<typeof modelRoutingSchema>

export function createDefaultGlobalConfig(): GlobalConfig {
  return {
    model_routing: {
      planner: { primary: 'deepseek-v4-flash', temperature: 0.3, max_tokens: 4096, cache_enabled: true },
      writer: { primary: 'local-finetuned', fallback: 'deepseek-v4-pro', temperature: 0.8, max_tokens: 8192, cache_enabled: true },
      deep_audit: { primary: 'deepseek-v4-pro', temperature: 0.1, max_tokens: 4096, cache_enabled: true },
      analyst: { primary: 'deepseek-v4-pro', temperature: 0.1, max_tokens: 8192, cache_enabled: true },
      polisher: { primary: 'local-model', fallback: 'deepseek-v4-flash', temperature: 0.3, max_tokens: 4096 },
      style_extractor: { primary: 'deepseek-v4-flash', temperature: 0.1, max_tokens: 4096 },
      cover_generator: { primary: 'deepseek-v4-flash', temperature: 0.7, max_tokens: 1024 },
    },
    memory: {
      full_text_chapters: 20,
      dream_interval: 10,
      dream_model: 'deepseek-v4-flash',
    },
    audit: {
      fast_audit_enabled: true,
      deep_audit_threshold: 0.7,
      pass_as_reference: true,
    },
    knowledge: {
      enabled: true,
      vector_db_path: './data/knowledge-base/vector-index',
      reference_top_k: 3,
      style_learning_only: true,
    },
    local_model: {
      enabled: false,
      base_url: 'http://127.0.0.1:8080/v1',
      model: 'novelforge-qwen-lora',
    },
    features: {
      cover_generation: true,
      script_export: true,
      ai_detection: true,
      style_transfer: true,
    },
  }
}
