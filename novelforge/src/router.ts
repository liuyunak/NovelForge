import { LLMClient, createAgentLLMClient } from './core/llm.js'
import { getProviderManager } from './core/provider-manager.js'
import type { AgentType } from './types/index.js'
import type { AiProvider } from './core/provider-manager.js'
import { logger } from './logger.js'

export type { AgentType }

export interface ModelConfig {
  primary: string
  fallback?: string
  local_fallback?: string
  temperature: number
  max_tokens: number
  cache_enabled?: boolean
  /** Provider id for the primary model */
  providerId?: string
  /** Provider id for the fallback model */
  fallbackProviderId?: string
}

/** Legacy hardcoded model configs — used as fallback when no provider config exists */
const LEGACY_MODEL_CONFIGS: Record<AgentType, ModelConfig> = {
  planner: { primary: 'deepseek-chat', temperature: 0.3, max_tokens: 4096, cache_enabled: true },
  composer: { primary: 'deepseek-chat', temperature: 0.3, max_tokens: 4096, cache_enabled: true },
  'pre-audit': { primary: 'deepseek-chat', temperature: 0.1, max_tokens: 4096 },
  'context-prep': { primary: 'deepseek-chat', temperature: 0.3, max_tokens: 4096 },
  writer: { primary: 'deepseek-chat', temperature: 0.8, max_tokens: 8192, cache_enabled: true },
  'fast-audit': { primary: 'deepseek-chat', temperature: 0.1, max_tokens: 4096 },
  'deep-audit': { primary: 'deepseek-chat', temperature: 0.1, max_tokens: 4096, cache_enabled: true },
  analyst: { primary: 'deepseek-chat', temperature: 0.1, max_tokens: 8192, cache_enabled: true },
  polisher: { primary: 'deepseek-chat', temperature: 0.3, max_tokens: 4096 },
  'memory-update': { primary: 'deepseek-chat', temperature: 0.1, max_tokens: 4096 },
  'style-extractor': { primary: 'deepseek-chat', temperature: 0.1, max_tokens: 4096 },
  'cover-generator': { primary: 'deepseek-chat', temperature: 0.7, max_tokens: 1024 },
  'script-exporter': { primary: 'deepseek-chat', temperature: 0.3, max_tokens: 4096 },
  reviewer: { primary: 'deepseek-chat', temperature: 0.1, max_tokens: 8192, cache_enabled: true },
  'human-approval': { primary: 'none', temperature: 0, max_tokens: 0 },
}

export class ModelRouter {
  private modelConfigs: Record<AgentType, ModelConfig>

  constructor() {
    // Start with legacy configs, will be overridden by provider config if available
    this.modelConfigs = { ...LEGACY_MODEL_CONFIGS }
    this.loadFromProviderManager()
  }

  /** Reload routing from ProviderManager (call after config changes) */
  reloadRouting(): void {
    this.loadFromProviderManager()
  }

  private loadFromProviderManager(): void {
    try {
      const pm = getProviderManager()
      const routes = pm.getAgentRouting()
      if (routes.length === 0) return

      for (const route of routes) {
        if (!route.providerId) continue
        this.modelConfigs[route.agent as AgentType] = {
          primary: route.model,
          fallback: route.fallbackModel,
          temperature: route.temperature,
          max_tokens: route.maxTokens,
          cache_enabled: route.cacheEnabled,
          providerId: route.providerId,
          fallbackProviderId: route.fallbackProviderId,
        }
      }
    } catch {
      // ProviderManager not initialised — keep legacy configs
    }
  }

  async generate(agent: AgentType, systemPrompt: string, userPrompt: string): Promise<string> {
    const modelConfig = this.modelConfigs[agent]

    try {
      const client = this.getClient(agent, 'primary')
      return await client.generate({
        model: modelConfig.primary,
        systemPrompt,
        userPrompt,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.max_tokens,
        cacheEnabled: modelConfig.cache_enabled,
      })
    } catch (error) {
      logger.warn({ agent, err: error }, 'Primary model failed, trying fallback')

      if (modelConfig.fallback) {
        const client = this.getClient(agent, 'fallback')
        return await client.generate({
          model: modelConfig.fallback,
          systemPrompt,
          userPrompt,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.max_tokens,
        })
      }

      throw error
    }
  }

  async generateStream(agent: AgentType, systemPrompt: string, userPrompt: string): Promise<ReadableStream> {
    const modelConfig = this.modelConfigs[agent]
    const client = this.getClient(agent, 'primary')

    return client.generateStream({
      model: modelConfig.primary,
      systemPrompt,
      userPrompt,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.max_tokens,
    })
  }

  getModelConfig(agent: AgentType): ModelConfig {
    return this.modelConfigs[agent]
  }

  /** Get the right LLMClient for this agent and mode (primary vs fallback) */
  private getClient(agent: AgentType, mode: 'primary' | 'fallback'): LLMClient {
    try {
      const pm = getProviderManager()
      const config = this.modelConfigs[agent]
      const providerId = mode === 'primary' ? config.providerId : config.fallbackProviderId

      if (providerId) {
        const provider = pm.getProvider(providerId)
        if (provider?.enabled) {
          return new LLMClient(provider)
        }
      }

      // Try agent-specific resolution through provider manager
      const resolved = pm.resolveModelWithFallback(agent)
      if (resolved && mode === 'primary') {
        return new LLMClient(resolved.provider)
      }
      if (resolved && mode === 'fallback' && resolved.fallbackProvider) {
        return new LLMClient(resolved.fallbackProvider)
      }
    } catch {
      // ProviderManager not available
    }

    // Legacy fallback
    return new LLMClient()
  }
}
