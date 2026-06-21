/**
 * Embedding Service for NovelForge
 *
 * Generates vector embeddings using the configured embedding provider.
 * Falls back to DeepSeek env config or a hash-based pseudo-embedding.
 */
import { logger } from '../logger.js'
import { config } from '../config.js'
import { getProviderManager } from '../core/provider-manager.js'

export interface EmbeddingResult {
  vector: number[]
  model: string
  dimension: number
}

export class EmbeddingService {
  private baseUrl: string
  private apiKey: string
  private model: string
  private cache: Map<string, number[]>
  private cacheMaxSize: number

  constructor() {
    this.cache = new Map()
    this.cacheMaxSize = 5000

    // Try to use configured embedding provider first
    const resolved = this.resolveEmbeddingConfig()
    this.baseUrl = resolved.baseUrl
    this.apiKey = resolved.apiKey
    this.model = resolved.model
  }

  private resolveEmbeddingConfig(): { baseUrl: string; apiKey: string; model: string } {
    try {
      const pm = getProviderManager()
      const ep = pm.getEmbeddingProvider()
      if (ep) {
        const provider = pm.getProvider(ep.providerId)
        if (provider?.enabled) {
          return {
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey || '',
            model: ep.model,
          }
        }
      }
    } catch {
      // ProviderManager not initialised
    }

    // Fallback to DeepSeek env config
    return {
      baseUrl: config.deepseekBaseUrl || 'https://api.deepseek.com/v1',
      apiKey: config.deepseekApiKey || '',
      model: 'deepseek-vector',
    }
  }

  /**
   * Generate embedding vector for a single text.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache first
    const cacheKey = this.hashText(text)
    if (this.cache.has(cacheKey)) {
      return {
        vector: this.cache.get(cacheKey)!,
        model: this.model,
        dimension: this.cache.get(cacheKey)!.length,
      }
    }

    // Truncate long texts
    const truncated = text.length > 32000 ? text.substring(0, 32000) : text

    try {
      // If no API key and no real embedding endpoint, skip API call entirely
      if (!this.apiKey && !this.isLocalEndpoint()) {
        throw new Error('No embedding API configured')
      }

      const url = this.baseUrl.endsWith('/v1')
        ? `${this.baseUrl}/embeddings`
        : `${this.baseUrl}/v1/embeddings`

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          input: truncated,
          encoding_format: 'float',
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        throw new Error(`Embedding API error ${response.status}: ${errBody}`)
      }

      const data = await response.json() as {
        data: { embedding: number[]; index: number }[]
        model: string
      }

      const vector = data.data[0].embedding
      this.addToCache(cacheKey, vector)

      return {
        vector,
        model: data.model || this.model,
        dimension: vector.length,
      }
    } catch (error: unknown) {
      // Fallback: hash-based pseudo-embedding
      logger.warn('[EmbeddingService] API call failed, using fallback hash embedding:', error)
      const fallback = this.generateFallbackEmbedding(truncated)
      this.addToCache(cacheKey, fallback)
      return {
        vector: fallback,
        model: 'fallback-hash',
        dimension: fallback.length,
      }
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = []
    const batchSize = 20
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch.map(text => this.embed(text)))
      results.push(...batchResults)
    }
    return results
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
    }
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  serializeVector(vector: number[]): Buffer {
    const buffer = Buffer.alloc(vector.length * 4)
    for (let i = 0; i < vector.length; i++) {
      buffer.writeFloatLE(vector[i], i * 4)
    }
    return buffer
  }

  deserializeVector(buffer: Buffer): number[] {
    const vector: number[] = []
    for (let i = 0; i < buffer.length; i += 4) {
      vector.push(buffer.readFloatLE(i))
    }
    return vector
  }

  private isLocalEndpoint(): boolean {
    return this.baseUrl.includes('127.0.0.1') || this.baseUrl.includes('localhost')
  }

  private hashText(text: string): string {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return `${text.length}_${Math.abs(hash)}`
  }

  private generateFallbackEmbedding(text: string): number[] {
    const dimension = 256
    const vector = new Array<number>(dimension).fill(0)
    for (let i = 0; i < text.length - 1; i++) {
      const bigram = text.charCodeAt(i) * 256 + text.charCodeAt(i + 1)
      const idx = bigram % dimension
      vector[idx] += 1
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] /= norm
      }
    }
    return vector
  }

  private addToCache(key: string, vector: number[]): void {
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, vector)
  }

  clearCache(): void {
    this.cache.clear()
  }
}

let embeddingServiceInstance: EmbeddingService | null = null

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService()
  }
  return embeddingServiceInstance
}
