import { config } from '../config.js'
import { PromptCache } from './prompt-cache.js'
import { getProviderManager, type AiProvider } from './provider-manager.js'
import { logger } from '../logger.js'

export interface GenerateOptions {
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  cacheEnabled?: boolean
}

export interface GenerateResult {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface ChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Multi-provider LLM Client.
 *
 * Routes requests through the ProviderManager. Falls back to
 * environment-configured DeepSeek API when no providers are configured
 * (legacy mode for backward compatibility).
 */
export class LLMClient {
  private promptCache: PromptCache
  private provider: AiProvider | null
  private maxRetries = 3
  private retryDelayMs = 1000

  /**
   * @param provider  Optional specific provider to use (for agent-specific routing).
   *                  If null, uses legacy env-based DeepSeek fallback.
   */
  constructor(provider?: AiProvider) {
    this.promptCache = new PromptCache()
    this.provider = provider || null
  }

  /** Check if an error is retryable (network error, 5xx, 429 rate-limit) */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network/abort errors
      if (error.name === 'AbortError' || error.name === 'TypeError' || error.name === 'FetchError') return true
      const msg = error.message || ''
      // HTTP 5xx server errors
      if (/API error 5\d{2}/.test(msg)) return true
      // HTTP 429 rate-limit
      if (/API error 429/.test(msg)) return true
    }
    return false
  }

  /** Sleep helper for backoff */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async generate(options: GenerateOptions): Promise<string> {
    const { model, systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096, cacheEnabled = false } = options

    const cacheKey = cacheEnabled
      ? this.promptCache.getCacheKey(systemPrompt, userPrompt)
      : null
    const cachedResult = cacheKey ? this.promptCache.get(cacheKey) : null

    if (cachedResult) {
      logger.debug('Cache hit for prompt')
      return cachedResult
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1)
        logger.warn({ attempt, maxRetries: this.maxRetries, delay }, 'LLM retry')
        await this.sleep(delay)
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)

      try {
        const { baseUrl, apiKey } = this.getProviderConfig()
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errBody = await response.text().catch(() => '')
          throw new Error(`API error ${response.status}: ${errBody || response.statusText}`)
        }

        const data = await response.json() as ChatResponse
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Invalid API response: missing choices[0].message.content')
        }
        const content = data.choices[0].message.content

        if (cacheKey) {
          this.promptCache.set(cacheKey, content)
        }

        return content
      } catch (error) {
        lastError = error
        if (!this.isRetryableError(error) || attempt >= this.maxRetries) {
          throw error
        }
        // Continue to next retry
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError
  }

  async generateStream(options: GenerateOptions): Promise<ReadableStream> {
    const { model, systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 } = options
    const { baseUrl, apiKey } = this.getProviderConfig()

    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1)
        logger.warn({ attempt, maxRetries: this.maxRetries, delay }, 'LLM stream retry')
        await this.sleep(delay)
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 300000) // 5 min timeout for streaming

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errBody = await response.text().catch(() => '')
          throw new Error(`API error ${response.status}: ${errBody || response.statusText}`)
        }

        if (!response.body) {
          throw new Error('Response body is null')
        }

        return response.body
      } catch (error) {
        lastError = error
        if (!this.isRetryableError(error) || attempt >= this.maxRetries) {
          throw error
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError
  }

  /**
   * Resolve baseUrl + apiKey from provider or legacy env config.
   */
  private getProviderConfig(): { baseUrl: string; apiKey?: string } {
    if (this.provider) {
      return {
        baseUrl: this.provider.baseUrl,
        apiKey: this.provider.apiKey,
      }
    }

    // Legacy fallback: use DeepSeek env config
    return {
      baseUrl: config.deepseekBaseUrl || 'https://api.deepseek.com/v1',
      apiKey: config.deepseekApiKey,
    }
  }
}

/**
 * Create an LLMClient for a specific agent, resolved through ProviderManager.
 * Falls back to legacy client if no routing config found.
 */
export function createAgentLLMClient(agent: string): LLMClient {
  try {
    const pm = getProviderManager()
    const resolved = pm.resolveModel(agent)
    if (resolved) {
      return new LLMClient(resolved.provider)
    }
  } catch {
    // ProviderManager not initialized yet — fall back
  }
  // Legacy: use env-configured DeepSeek
  return new LLMClient()
}
