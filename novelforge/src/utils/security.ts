/**
 * Shared security validation utilities.
 *
 * Provides reusable helpers for URL / SSRF validation used across API routes
 * (setup, config, finetune, etc.) to keep protection logic consistent.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Context } from 'hono'
import { getCurrentUserId, isAuthConfigured } from '../middleware/auth.js'
import { logger } from '../logger.js'

/**
 * Validate a workspace/route ID — only alphanumerics, underscore, hyphen,
 * and must not contain path traversal sequences.
 */
export function validateId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && !id.includes('..')
}

/**
 * Check workspace ownership: verify the requesting user owns the workspace.
 * Returns null if owned, or an error Response if not owned / not found.
 *
 * Shared across workspace, pipeline, and DPO routes to ensure consistent
 * access control.
 */
export function checkOwnership(c: Context, workspaceId: string): Response | null {
  const userId = getCurrentUserId(c)

  // If auth is not configured (setup mode), skip ownership check
  if (!isAuthConfigured()) {
    const bookConfigPath = path.join(process.cwd(), 'workspace', workspaceId, 'book_config.json')
    if (!fs.existsSync(bookConfigPath)) {
      return c.json({ error: 'Workspace not found' }, 404) as unknown as Response
    }
    return null
  }

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401) as unknown as Response
  }

  const bookConfigPath = path.join(process.cwd(), 'workspace', workspaceId, 'book_config.json')
  if (!fs.existsSync(bookConfigPath)) {
    return c.json({ error: 'Workspace not found' }, 404) as unknown as Response
  }

  try {
    const config = JSON.parse(fs.readFileSync(bookConfigPath, 'utf-8'))
    if (config.ownerUserId && config.ownerUserId !== userId) {
      logger.warn(
        { workspaceId, ownerUserId: config.ownerUserId, requestUserId: userId },
        'Workspace ownership check failed'
      )
      return c.json({ error: 'Forbidden — you do not own this workspace' }, 403) as unknown as Response
    }
    // If ownerUserId is not set (legacy workspace), allow access
    return null
  } catch {
    return c.json({ error: 'Failed to read workspace config' }, 500) as unknown as Response
  }
}

/**
 * Validate that a URL string is safe for outbound requests.
 *
 * Rules:
 *  - Must be a valid URL.
 *  - Protocol must be http or https.
 *  - Hostname must not be a private/loopback/link-local address.
 *
 * @returns `{ ok: true }` if safe, otherwise `{ ok: false, error }`.
 */
export function validateExternalUrl(
  rawUrl: string
): { ok: true } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, error: 'Invalid URL format' }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'Only http and https URLs are allowed' }
  }

  // Block private/reserved IP ranges and loopback to prevent SSRF
  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '[::1]',
    '169.254.', // link-local
    '10.',
    '172.16.',
    '172.17.',
    '172.18.',
    '172.19.',
    '172.20.',
    '172.21.',
    '172.22.',
    '172.23.',
    '172.24.',
    '172.25.',
    '172.26.',
    '172.27.',
    '172.28.',
    '172.29.',
    '172.30.',
    '172.31.',
    '192.168.',
    '::1',
    'fc00:',
    'fd00:',
    'fe80:',
  ]

  const hostname = parsed.hostname.toLowerCase()
  if (blockedHosts.some(h => hostname === h || hostname.startsWith(h))) {
    return { ok: false, error: 'Internal network addresses are not allowed' }
  }

  return { ok: true }
}

/**
 * Validate a provider name. Allows alphanumerics, spaces, hyphens, underscores,
 * and common CJK characters. Max length 64.
 */
export function validateProviderName(name: unknown): string | null {
  if (typeof name !== 'string' || name.length === 0 || name.length > 64) {
    return null
  }
  // Allow letters (incl. CJK), digits, spaces, hyphen, underscore, dot, parentheses
  if (!/^[\p{L}\p{N} _\-.()]+$/u.test(name)) {
    return null
  }
  return name
}

/**
 * Validate a list of model ID strings. Each must match HuggingFace-style identifier
 * rules (alphanumeric, /, -, _, .) and be at most 200 chars.
 */
export function validateModelList(models: unknown): string[] | null {
  if (!Array.isArray(models)) return null
  if (models.length > 100) return null
  const result: string[] = []
  for (const m of models) {
    if (typeof m !== 'string' || m.length === 0 || m.length > 200) return null
    if (!/^[a-zA-Z0-9A-Za-z0-9_\-\.\/:]+$/.test(m)) return null
    result.push(m)
  }
  return result
}
