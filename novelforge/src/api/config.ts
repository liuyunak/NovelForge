/**
 * AI Config API — Multi-provider configuration management.
 *
 * Endpoints:
 *   GET    /api/config/providers          — List all providers
 *   POST   /api/config/providers          — Add a new provider
 *   PUT    /api/config/providers/:id      — Update a provider
 *   DELETE /api/config/providers/:id      — Delete a provider
 *   POST   /api/config/providers/test     — Test provider connectivity
 *   POST   /api/config/providers/:id/test — Test a saved provider
 *   GET    /api/config/agent-routing      — List agent routing
 *   PUT    /api/config/agent-routing      — Update agent routing (bulk)
 *   GET    /api/config/embedding          — Get embedding provider config
 *   PUT    /api/config/embedding          — Set embedding provider config
 */
import { Hono } from 'hono'
import { getProviderManager, type AiProvider } from '../core/provider-manager.js'
import { logger } from '../logger.js'
import {
  validateExternalUrl,
  validateModelList,
  validateProviderName,
} from '../utils/security.js'

export const configRouter = new Hono()

// ==================== Provider CRUD ====================

/** List all providers (apiKey masked for security) */
configRouter.get('/providers', (c) => {
  try {
    const pm = getProviderManager()
    const providers = pm.getProviders().map(p => ({
      ...p,
      apiKey: p.apiKey ? p.apiKey.slice(0, 3) + '***' + p.apiKey.slice(-4) : undefined,
    }))
    return c.json({ providers })
  } catch (err) {
    logger.error('[ConfigAPI] GET /providers failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/** Add a new provider */
configRouter.post('/providers', async (c) => {
  try {
    const body = await c.req.json()
    const { name, type, baseUrl, apiKey, models, enabled, isLocal } = body

    if (!name || !baseUrl) {
      return c.json({ error: 'name and baseUrl are required' }, 400)
    }

    // Validate name
    const safeName = validateProviderName(name)
    if (!safeName) {
      return c.json({ error: 'Invalid provider name' }, 400)
    }

    // Validate baseUrl — block SSRF for remote providers
    if (!isLocal) {
      const urlCheck = validateExternalUrl(baseUrl)
      if (!urlCheck.ok) {
        return c.json({ error: urlCheck.error }, 400)
      }
    } else {
      // For local providers, only validate URL format
      try {
        new URL(baseUrl)
      } catch {
        return c.json({ error: 'Invalid baseUrl format' }, 400)
      }
    }

    // Validate models list if provided
    const safeModels = models ? validateModelList(models) : null
    if (models && !safeModels) {
      return c.json({ error: 'Invalid models list' }, 400)
    }

    // Validate apiKey length if provided
    if (apiKey !== undefined && apiKey !== null) {
      if (typeof apiKey !== 'string' || apiKey.length > 500) {
        return c.json({ error: 'Invalid apiKey' }, 400)
      }
    }

    const pm = getProviderManager()
    const provider = pm.addProvider({
      name: safeName,
      type: type || 'openai-compatible',
      baseUrl,
      apiKey: apiKey || undefined,
      models: safeModels ?? ['default'],
      enabled: enabled !== undefined ? !!enabled : true,
      isLocal: isLocal !== undefined ? !!isLocal : false,
    })

    return c.json({ provider }, 201)
  } catch (err) {
    logger.error('[ConfigAPI] POST /providers failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/** Update a provider */
configRouter.put('/providers/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const pm = getProviderManager()
    const existing = pm.getProvider(id)
    if (!existing) {
      return c.json({ error: 'Provider not found' }, 404)
    }

    // Filter out fields that shouldn't be directly updated
    const allowedFields: (keyof AiProvider)[] = ['name', 'type', 'baseUrl', 'apiKey', 'models', 'enabled', 'isLocal']
    const patch: Partial<AiProvider> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (patch as any)[key] = body[key]
      }
    }

    // Validate name if being updated
    if (patch.name !== undefined) {
      const safeName = validateProviderName(patch.name)
      if (!safeName) {
        return c.json({ error: 'Invalid provider name' }, 400)
      }
      patch.name = safeName
    }

    // Validate baseUrl if being updated — apply SSRF check based on
    // the *resulting* isLocal flag (patch or existing value).
    if (patch.baseUrl !== undefined) {
      const effectiveIsLocal = patch.isLocal !== undefined ? patch.isLocal : existing.isLocal
      if (!effectiveIsLocal) {
        const urlCheck = validateExternalUrl(patch.baseUrl)
        if (!urlCheck.ok) {
          return c.json({ error: urlCheck.error }, 400)
        }
      } else {
        try {
          new URL(patch.baseUrl)
        } catch {
          return c.json({ error: 'Invalid baseUrl format' }, 400)
        }
      }
    }

    // Validate models list if being updated
    if (patch.models !== undefined) {
      const safeModels = validateModelList(patch.models)
      if (!safeModels) {
        return c.json({ error: 'Invalid models list' }, 400)
      }
      patch.models = safeModels
    }

    // Validate apiKey length if being updated
    if (patch.apiKey !== undefined && patch.apiKey !== null) {
      if (typeof patch.apiKey !== 'string' || patch.apiKey.length > 500) {
        return c.json({ error: 'Invalid apiKey' }, 400)
      }
    }

    const updated = pm.updateProvider(id, patch)
    if (!updated) {
      return c.json({ error: 'Provider not found' }, 404)
    }

    return c.json({ provider: updated })
  } catch (err) {
    logger.error('[ConfigAPI] PUT /providers/:id failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/** Delete a provider */
configRouter.delete('/providers/:id', (c) => {
  try {
    const id = c.req.param('id')
    const pm = getProviderManager()
    const deleted = pm.deleteProvider(id)

    if (!deleted) {
      return c.json({ error: 'Provider not found' }, 404)
    }

    return c.json({ success: true })
  } catch (err) {
    logger.error('[ConfigAPI] DELETE /providers/:id failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/** Test provider connectivity (by providing connection details) */
configRouter.post('/providers/test', async (c) => {
  try {
    const body = await c.req.json()
    const { baseUrl, apiKey } = body

    if (!baseUrl) {
      return c.json({ error: 'baseUrl is required' }, 400)
    }

    // SSRF prevention: reject internal/private network targets
    const urlCheck = validateExternalUrl(baseUrl)
    if (!urlCheck.ok) {
      return c.json({ ok: false, error: urlCheck.error }, 400)
    }

    const pm = getProviderManager()
    const result = await pm.testProvider(baseUrl, apiKey)
    return c.json(result)
  } catch (err) {
    logger.error('[ConfigAPI] POST /providers/test failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/** Test a saved provider by id */
configRouter.post('/providers/:id/test', async (c) => {
  try {
    const id = c.req.param('id')
    const pm = getProviderManager()
    const provider = pm.getProvider(id)

    if (!provider) {
      return c.json({ error: 'Provider not found' }, 404)
    }

    // SSRF prevention: skip for explicitly local providers
    if (!provider.isLocal) {
      const urlCheck = validateExternalUrl(provider.baseUrl)
      if (!urlCheck.ok) {
        return c.json({ ok: false, error: urlCheck.error }, 400)
      }
    }

    const result = await pm.testProvider(provider.baseUrl, provider.apiKey)
    return c.json(result)
  } catch (err) {
    logger.error('[ConfigAPI] POST /providers/:id/test failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ==================== Agent Routing ====================

/** Get agent routing config */
configRouter.get('/agent-routing', (c) => {
  try {
    const pm = getProviderManager()
    return c.json({ agentRouting: pm.getAgentRouting() })
  } catch (err) {
    logger.error('[ConfigAPI] GET /agent-routing failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/** Update agent routing (bulk) */
configRouter.put('/agent-routing', async (c) => {
  try {
    const body = await c.req.json()
    const { agentRouting } = body

    if (!Array.isArray(agentRouting)) {
      return c.json({ error: 'agentRouting must be an array' }, 400)
    }

    const pm = getProviderManager()
    pm.updateAgentRouting(agentRouting)

    return c.json({ agentRouting: pm.getAgentRouting() })
  } catch (err) {
    logger.error('[ConfigAPI] PUT /agent-routing failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ==================== Embedding Config ====================

/** Get embedding provider config */
configRouter.get('/embedding', (c) => {
  try {
    const pm = getProviderManager()
    const ep = pm.getEmbeddingProvider()
    return c.json({ embedding: ep })
  } catch (err) {
    logger.error('[ConfigAPI] GET /embedding failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/** Set embedding provider config */
configRouter.put('/embedding', async (c) => {
  try {
    const body = await c.req.json()
    const { providerId, model } = body

    if (!providerId || !model) {
      return c.json({ error: 'providerId and model are required' }, 400)
    }

    const pm = getProviderManager()
    pm.setEmbeddingProvider(providerId, model)

    return c.json({ embedding: pm.getEmbeddingProvider() })
  } catch (err) {
    logger.error('[ConfigAPI] PUT /embedding failed: %s', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
