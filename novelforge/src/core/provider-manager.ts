/**
 * AI Provider Manager — Multi-provider configuration system.
 *
 * Supports any OpenAI-compatible API backend:
 *   - OpenAI / DeepSeek / Moonshot / Zhipu (cloud)
 *   - Ollama (local, http://localhost:11434/v1)
 *   - llama.cpp server (local, http://127.0.0.1:8080/v1)
 *   - LM Studio (local, http://127.0.0.1:1234/v1)
 *
 * All of these speak the same /v1/chat/completions protocol.
 */

import fs from 'node:fs'
import path from 'node:path'
import { logger } from '../logger.js'

// ==================== Types ====================

export type ProviderType = 'openai-compatible'

export interface AiProvider {
  id: string
  name: string
  type: ProviderType
  baseUrl: string           // e.g. "https://api.openai.com/v1"
  apiKey?: string           // optional for local models
  models: string[]          // e.g. ["gpt-4o", "gpt-4o-mini"]
  enabled: boolean
  isLocal: boolean          // true = no auth needed, local network
  createdAt: string         // ISO timestamp
  updatedAt: string         // ISO timestamp
}

export interface AgentRoutingEntry {
  agent: string             // e.g. "writer", "planner"
  providerId: string        // which provider to use
  model: string             // which model on that provider
  fallbackProviderId?: string
  fallbackModel?: string
  temperature: number
  maxTokens: number
  cacheEnabled?: boolean
}

export interface ProviderConfig {
  version: 1
  providers: AiProvider[]
  agentRouting: AgentRoutingEntry[]
  embeddingProviderId?: string   // which provider to use for embeddings
  embeddingModel?: string        // which model for embeddings
}

// ==================== Default Presets ====================

const PRESET_PROVIDERS: Omit<AiProvider, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    enabled: false,
    isLocal: false,
  },
  {
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini', 'o4-mini'],
    enabled: false,
    isLocal: false,
  },
  {
    name: 'Ollama',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: undefined,
    models: ['qwen3', 'llama3.2', 'deepseek-r1', 'mistral'],
    enabled: false,
    isLocal: true,
  },
  {
    name: 'llama.cpp',
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8080/v1',
    apiKey: undefined,
    models: ['local-model'],
    enabled: false,
    isLocal: true,
  },
  {
    name: 'LM Studio',
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: undefined,
    models: ['local-model'],
    enabled: false,
    isLocal: true,
  },
]

const DEFAULT_AGENT_ROUTING: AgentRoutingEntry[] = [
  { agent: 'planner', providerId: '', model: 'deepseek-chat', temperature: 0.3, maxTokens: 4096, cacheEnabled: true },
  { agent: 'composer', providerId: '', model: 'deepseek-chat', temperature: 0.3, maxTokens: 4096, cacheEnabled: true },
  { agent: 'pre-audit', providerId: '', model: 'deepseek-chat', temperature: 0.1, maxTokens: 4096 },
  { agent: 'context-prep', providerId: '', model: 'deepseek-chat', temperature: 0.3, maxTokens: 4096 },
  { agent: 'writer', providerId: '', model: 'deepseek-chat', temperature: 0.8, maxTokens: 8192, cacheEnabled: true },
  { agent: 'fast-audit', providerId: '', model: 'deepseek-chat', temperature: 0.1, maxTokens: 4096 },
  { agent: 'deep-audit', providerId: '', model: 'deepseek-chat', temperature: 0.1, maxTokens: 4096, cacheEnabled: true },
  { agent: 'analyst', providerId: '', model: 'deepseek-chat', temperature: 0.1, maxTokens: 8192, cacheEnabled: true },
  { agent: 'polisher', providerId: '', model: 'deepseek-chat', temperature: 0.3, maxTokens: 4096 },
  { agent: 'memory-update', providerId: '', model: 'deepseek-chat', temperature: 0.1, maxTokens: 4096 },
  { agent: 'style-extractor', providerId: '', model: 'deepseek-chat', temperature: 0.1, maxTokens: 4096 },
  { agent: 'cover-generator', providerId: '', model: 'deepseek-chat', temperature: 0.7, maxTokens: 1024 },
  { agent: 'script-exporter', providerId: '', model: 'deepseek-chat', temperature: 0.3, maxTokens: 4096 },
  { agent: 'reviewer', providerId: '', model: 'deepseek-chat', temperature: 0.1, maxTokens: 8192, cacheEnabled: true },
  { agent: 'human-approval', providerId: '', model: 'none', temperature: 0, maxTokens: 0 },
]

// ==================== ProviderManager ====================

export class ProviderManager {
  private configPath: string
  private config: ProviderConfig
  private ready: boolean = false

  constructor(storageDir: string) {
    this.configPath = path.join(storageDir, 'ai-providers.json')
    this.config = { version: 1, providers: [], agentRouting: [] }
  }

  /**
   * Load provider config from disk, or initialise with presets.
   */
  async initialize(): Promise<void> {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw) as ProviderConfig

        // Validate version
        if (parsed.version !== 1) {
          throw new Error(`Unsupported config version: ${parsed.version}`)
        }

        this.config = parsed
        logger.info('[ProviderManager] Loaded %d providers from %s', parsed.providers.length, this.configPath)
      } else {
        // First run — write presets
        this.config = {
          version: 1,
          providers: PRESET_PROVIDERS.map(p => ({
            ...p,
            id: this.generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })),
          agentRouting: [...DEFAULT_AGENT_ROUTING],
        }
        this.save()
        logger.info('[ProviderManager] Initialised with %d preset providers', this.config.providers.length)
      }
      this.ready = true
    } catch (err) {
      logger.error('[ProviderManager] Failed to initialise: %s', err)
      // Fall back to empty config so the app doesn't crash
      this.config = { version: 1, providers: [], agentRouting: [] }
      this.ready = true
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (err) {
      logger.error('[ProviderManager] Failed to save config: %s', err)
    }
  }

  // ==================== Provider CRUD ====================

  getProviders(): AiProvider[] {
    return this.config.providers
  }

  getEnabledProviders(): AiProvider[] {
    return this.config.providers.filter(p => p.enabled)
  }

  getProvider(id: string): AiProvider | undefined {
    return this.config.providers.find(p => p.id === id)
  }

  addProvider(partial: Omit<AiProvider, 'id' | 'createdAt' | 'updatedAt'>): AiProvider {
    const now = new Date().toISOString()
    const provider: AiProvider = {
      ...partial,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    }
    this.config.providers.push(provider)
    this.save()
    logger.info('[ProviderManager] Added provider: %s (%s)', provider.name, provider.id)
    return provider
  }

  updateProvider(id: string, patch: Partial<Omit<AiProvider, 'id' | 'createdAt'>>): AiProvider | null {
    const idx = this.config.providers.findIndex(p => p.id === id)
    if (idx === -1) return null

    this.config.providers[idx] = {
      ...this.config.providers[idx],
      ...patch,
      id, // ensure id cannot be changed
      updatedAt: new Date().toISOString(),
    }
    this.save()
    logger.info('[ProviderManager] Updated provider: %s', id)
    return this.config.providers[idx]
  }

  deleteProvider(id: string): boolean {
    const idx = this.config.providers.findIndex(p => p.id === id)
    if (idx === -1) return false

    this.config.providers.splice(idx, 1)
    // Also clean up agent routing referencing this provider
    this.config.agentRouting = this.config.agentRouting.map(r => ({
      ...r,
      providerId: r.providerId === id ? '' : r.providerId,
      fallbackProviderId: r.fallbackProviderId === id ? undefined : r.fallbackProviderId,
    }))
    if (this.config.embeddingProviderId === id) {
      this.config.embeddingProviderId = undefined
    }
    this.save()
    logger.info('[ProviderManager] Deleted provider: %s', id)
    return true
  }

  /**
   * Test connectivity to a provider by calling its /v1/models endpoint.
   */
  async testProvider(baseUrl: string, apiKey?: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      // Normalize: ensure exactly one trailing "/v1" before appending path
      const normalized = baseUrl.replace(/\/+$/, '')
      const url = normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`
      const resp = await fetch(url, { headers, signal: controller.signal })
      clearTimeout(timeout)

      if (!resp.ok) {
        return { ok: false, models: [], error: `HTTP ${resp.status}: ${resp.statusText}` }
      }

      const data = await resp.json() as { data?: Array<{ id: string }> }
      const models = (data.data || []).map(m => m.id).filter(Boolean)
      return { ok: true, models }
    } catch (err) {
      return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ==================== Agent Routing ====================

  getAgentRouting(): AgentRoutingEntry[] {
    return this.config.agentRouting
  }

  getAgentRoute(agent: string): AgentRoutingEntry | undefined {
    return this.config.agentRouting.find(r => r.agent === agent)
  }

  updateAgentRouting(entries: AgentRoutingEntry[]): void {
    // Merge: update existing, add new
    for (const entry of entries) {
      const idx = this.config.agentRouting.findIndex(r => r.agent === entry.agent)
      if (idx >= 0) {
        this.config.agentRouting[idx] = entry
      } else {
        this.config.agentRouting.push(entry)
      }
    }
    this.save()
    logger.info('[ProviderManager] Updated agent routing for %d agents', entries.length)
  }

  // ==================== Embedding Provider ====================

  getEmbeddingProvider(): { providerId: string; model: string } | null {
    if (this.config.embeddingProviderId && this.config.embeddingModel) {
      return {
        providerId: this.config.embeddingProviderId,
        model: this.config.embeddingModel,
      }
    }
    return null
  }

  setEmbeddingProvider(providerId: string, model: string): void {
    this.config.embeddingProviderId = providerId
    this.config.embeddingModel = model
    this.save()
  }

  /**
   * Resolve a model name to its provider.
   * Returns the provider + actual model name to call.
   */
  resolveModel(agent: string): {
    provider: AiProvider
    model: string
    temperature: number
    maxTokens: number
    cacheEnabled?: boolean
  } | null {
    const route = this.getAgentRoute(agent)
    if (!route || !route.providerId) return null

    const provider = this.getProvider(route.providerId)
    if (!provider || !provider.enabled) return null

    return {
      provider,
      model: route.model,
      temperature: route.temperature,
      maxTokens: route.maxTokens,
      cacheEnabled: route.cacheEnabled,
    }
  }

  resolveModelWithFallback(agent: string): {
    provider: AiProvider
    model: string
    temperature: number
    maxTokens: number
    cacheEnabled?: boolean
    fallbackProvider?: AiProvider
    fallbackModel?: string
  } | null {
    const route = this.getAgentRoute(agent)
    if (!route || !route.providerId) return null

    const provider = this.getProvider(route.providerId)
    if (!provider || !provider.enabled) return null

    let fallbackProvider: AiProvider | undefined
    let fallbackModel: string | undefined
    if (route.fallbackProviderId) {
      const fb = this.getProvider(route.fallbackProviderId)
      if (fb?.enabled) {
        fallbackProvider = fb
        fallbackModel = route.fallbackModel
      }
    }

    return {
      provider,
      model: route.model,
      temperature: route.temperature,
      maxTokens: route.maxTokens,
      cacheEnabled: route.cacheEnabled,
      fallbackProvider,
      fallbackModel,
    }
  }

  // ==================== Helpers ====================

  private generateId(): string {
    return `provider_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }

  isReady(): boolean {
    return this.ready
  }
}

// Singleton
let instance: ProviderManager | null = null

export function getProviderManager(): ProviderManager {
  if (!instance) {
    throw new Error('ProviderManager not initialised. Call initProviderManager() first.')
  }
  return instance
}

export function initProviderManager(storageDir: string): ProviderManager {
  instance = new ProviderManager(storageDir)
  return instance
}
