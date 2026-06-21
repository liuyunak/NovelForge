/**
 * AI Configuration Store — manages multi-provider AI settings.
 */
import { create } from 'zustand'
import type { AiProvider, AgentRoutingEntry } from '../api/client'
import {
  fetchProviders,
  addProvider as apiAddProvider,
  updateProvider as apiUpdateProvider,
  deleteProvider as apiDeleteProvider,
  testProvider as apiTestProvider,
  testProviderById as apiTestProviderById,
  fetchAgentRouting,
  updateAgentRouting as apiUpdateAgentRouting,
  fetchEmbeddingConfig,
  setEmbeddingConfig as apiSetEmbeddingConfig,
} from '../api/client'

interface AiStoreState {
  // Provider state
  providers: AiProvider[]
  isProvidersLoading: boolean
  providersError: string | null

  // Agent routing state
  agentRouting: AgentRoutingEntry[]
  isRoutingLoading: boolean

  // Embedding config
  embeddingProviderId: string | null
  embeddingModel: string | null
  isEmbeddingLoading: boolean

  // UI state
  isSaving: boolean

  // Actions — Providers
  loadProviders: () => Promise<void>
  addProvider: (data: Omit<AiProvider, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AiProvider | null>
  editProvider: (id: string, patch: Partial<AiProvider>) => Promise<AiProvider | null>
  removeProvider: (id: string) => Promise<boolean>
  testConnection: (baseUrl: string, apiKey?: string) => Promise<{ ok: boolean; models: string[]; error?: string }>
  testProviderConnection: (id: string) => Promise<{ ok: boolean; models: string[]; error?: string }>

  // Actions — Routing
  loadAgentRouting: () => Promise<void>
  saveAgentRouting: (entries: AgentRoutingEntry[]) => Promise<void>

  // Actions — Embedding
  loadEmbeddingConfig: () => Promise<void>
  saveEmbeddingConfig: (providerId: string, model: string) => Promise<void>
}

export const useAiStore = create<AiStoreState>((set, get) => ({
  providers: [],
  isProvidersLoading: false,
  providersError: null,
  agentRouting: [],
  isRoutingLoading: false,
  embeddingProviderId: null,
  embeddingModel: null,
  isEmbeddingLoading: false,
  isSaving: false,

  // ==================== Providers ====================

  loadProviders: async () => {
    set({ isProvidersLoading: true, providersError: null })
    try {
      const data = await fetchProviders()
      set({ providers: data.providers, isProvidersLoading: false })
    } catch (err) {
      set({
        providersError: err instanceof Error ? err.message : 'Failed to load providers',
        isProvidersLoading: false,
      })
    }
  },

  addProvider: async (data) => {
    set({ isSaving: true })
    try {
      const result = await apiAddProvider(data)
      set((s) => ({ providers: [...s.providers, result.provider], isSaving: false }))
      return result.provider
    } catch (err) {
      set({ isSaving: false })
      throw err
    }
  },

  editProvider: async (id, patch) => {
    set({ isSaving: true })
    try {
      const result = await apiUpdateProvider(id, patch)
      set((s) => ({
        providers: s.providers.map((p) => (p.id === id ? result.provider : p)),
        isSaving: false,
      }))
      return result.provider
    } catch (err) {
      set({ isSaving: false })
      throw err
    }
  },

  removeProvider: async (id) => {
    try {
      await apiDeleteProvider(id)
      set((s) => ({ providers: s.providers.filter((p) => p.id !== id) }))
      return true
    } catch {
      return false
    }
  },

  testConnection: async (baseUrl, apiKey) => {
    return apiTestProvider(baseUrl, apiKey)
  },

  testProviderConnection: async (id) => {
    return apiTestProviderById(id)
  },

  // ==================== Agent Routing ====================

  loadAgentRouting: async () => {
    set({ isRoutingLoading: true })
    try {
      const data = await fetchAgentRouting()
      set({ agentRouting: data.agentRouting, isRoutingLoading: false })
    } catch {
      set({ isRoutingLoading: false })
    }
  },

  saveAgentRouting: async (entries) => {
    set({ isSaving: true })
    try {
      const data = await apiUpdateAgentRouting(entries)
      set({ agentRouting: data.agentRouting, isSaving: false })
    } catch {
      set({ isSaving: false })
      throw new Error('Failed to save agent routing')
    }
  },

  // ==================== Embedding ====================

  loadEmbeddingConfig: async () => {
    set({ isEmbeddingLoading: true })
    try {
      const data = await fetchEmbeddingConfig()
      set({
        embeddingProviderId: data.embedding?.providerId ?? null,
        embeddingModel: data.embedding?.model ?? null,
        isEmbeddingLoading: false,
      })
    } catch {
      set({ isEmbeddingLoading: false })
    }
  },

  saveEmbeddingConfig: async (providerId, model) => {
    set({ isSaving: true })
    try {
      await apiSetEmbeddingConfig(providerId, model)
      set({ embeddingProviderId: providerId, embeddingModel: model, isSaving: false })
    } catch {
      set({ isSaving: false })
      throw new Error('Failed to save embedding config')
    }
  },
}))
