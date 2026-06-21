import NodeCache from 'node-cache'

/**
 * Content tags used for namespace-based cache invalidation.
 * When a user modifies settings, all cached prompts tagged with that
 * namespace are invalidated, regardless of TTL.
 */
export type CacheNamespace = 'characters' | 'worldview' | 'style' | 'plot' | 'outline' | 'master_setting' | 'rules' | 'general'

export class PromptCache {
  private cache: NodeCache
  private defaultTTL: number = 86400 // 24 hours in seconds
  /** Maps namespace tags → set of cache keys for content-aware invalidation */
  private namespaceIndex: Map<CacheNamespace, Set<string>> = new Map()

  constructor(defaultTTL?: number) {
    this.cache = new NodeCache({
      stdTTL: defaultTTL || this.defaultTTL,
      checkperiod: 3600,
      useClones: false,
    })
    // Listen to cache deletions (TTL expiry, manual delete) to clean up namespace index
    this.cache.on('del', (key: string) => {
      for (const [, keys] of this.namespaceIndex) {
        keys.delete(key)
      }
    })
    this.cache.on('expired', (key: string) => {
      for (const [, keys] of this.namespaceIndex) {
        keys.delete(key)
      }
    })
  }

  getCacheKey(systemPrompt: string, userPrompt: string): string {
    return `prompt_${this.hashString(systemPrompt)}_${this.hashString(userPrompt)}`
  }

  get(key: string): string | undefined {
    return this.cache.get(key)
  }

  /**
   * Set a cache entry with optional namespace tags for content-aware invalidation.
   * @param key   Cache key
   * @param value Cached value
   * @param ttl   TTL in seconds (overrides default)
   * @param namespaces  Content tags so we can invalidate by category
   */
  set(key: string, value: string, ttl?: number, namespaces?: CacheNamespace[]): void {
    this.cache.set(key, value, ttl || this.defaultTTL)
    if (namespaces && namespaces.length > 0) {
      for (const ns of namespaces) {
        if (!this.namespaceIndex.has(ns)) {
          this.namespaceIndex.set(ns, new Set())
        }
        this.namespaceIndex.get(ns)!.add(key)
      }
    }
  }

  invalidate(key: string): void {
    this.cache.del(key)
  }

  /**
   * Invalidate all cached prompts belonging to the given content namespace.
   * Called when user modifies characters, worldview, style settings, etc.
   */
  invalidateNamespace(ns: CacheNamespace): void {
    const keys = this.namespaceIndex.get(ns)
    if (keys) {
      for (const key of keys) {
        this.cache.del(key)
      }
      this.namespaceIndex.delete(ns)
    }
  }

  invalidateAll(): void {
    this.cache.flushAll()
    this.namespaceIndex.clear()
  }

  getStats(): { keys: number; hits: number; misses: number; namespaces: number } {
    return {
      keys: this.cache.keys().length,
      hits: this.cache.getStats().hits,
      misses: this.cache.getStats().misses,
      namespaces: this.namespaceIndex.size,
    }
  }

  private hashString(str: string): string {
    // 使用 FNV-1a hash 减少碰撞率
    let hash1 = 0x811c9dc5 // FNV offset basis
    let hash2 = 0x01000193 // FNV prime
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash1 ^= char
      hash1 = (hash1 * 0x01000193) >>> 0
      hash2 ^= char
      hash2 = (hash2 * 0x01000193) >>> 0
    }
    
    // 组合两个hash值以降低碰撞率
    return ((hash1 * 0x45d9f3b) ^ hash2).toString(36)
  }
}
