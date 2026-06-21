/**
 * Setup Wizard API — First-run configuration.
 * 
 * When NovelForge starts without a JWT_SECRET, it enters "setup mode".
 * The setup wizard guides the user through:
 *   1. Creating an admin account
 *   2. Configuring AI providers
 *   3. Finalizing initialization
 * 
 * After setup completes, the server generates a secure JWT_SECRET
 * and restarts with full authentication enabled.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { sign } from 'hono/jwt'
import type { JwtVariables } from 'hono/jwt'

const setupRouter = new Hono()

// ==================== Validation ====================

const setupSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
  providerName: z.string().optional(),
  providerType: z.enum(['deepseek', 'openai', 'ollama', 'llama-cpp', 'lm-studio', 'custom']).optional(),
  providerBaseUrl: z.string().optional(),
  providerApiKey: z.string().optional(),
  providerModel: z.string().optional(),
})

// ==================== Helpers ====================

const ENV_PATH = path.join(process.cwd(), '.env')
const USERS_PATH = path.join(process.cwd(), 'data', 'users.json')

function generateJwtSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return { hash, salt }
}

function saveEnvVar(key: string, value: string): void {
  let content = ''
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8')
  }
  
  const lines = content.split('\n')
  const keyEq = key + '='
  let found = false
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(keyEq) || lines[i].startsWith('#' + keyEq)) {
      lines[i] = `${key}=${value}`
      found = true
      break
    }
  }
  
  if (!found) {
    lines.push(`${key}=${value}`)
  }
  
  // Ensure data dir exists
  const dir = path.dirname(ENV_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  // Atomic write: write to temp file first, then rename to prevent corruption
  const tmpPath = `${ENV_PATH}.tmp.${Date.now()}`
  fs.writeFileSync(tmpPath, lines.join('\n'))
  fs.renameSync(tmpPath, ENV_PATH)
}

function saveAdminUser(username: string, passwordHash: string, salt: string): string {
  const userId = crypto.randomUUID()
  const dir = path.dirname(USERS_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  const users = {
    users: [{
      userId,
      username,
      passwordHash,
      salt,
      role: 'admin',
      createdAt: new Date().toISOString(),
    }],
  }
  
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2))
  return userId
}

async function generateToken(userId: string, username: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return await sign({
    userId,
    username,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  }, secret)
}

// ==================== Routes ====================

/**
 * GET /api/setup/status
 * Check if setup is needed and return current configuration status.
 */
setupRouter.get('/status', (c) => {
  const jwtSecret = process.env.JWT_SECRET
  const needsSetup = !jwtSecret || jwtSecret === 'novelforge-dev-secret-change-in-production'
  
  const hasUsers = fs.existsSync(USERS_PATH)
  const hasEnv = fs.existsSync(ENV_PATH)
  
  return c.json({
    needsSetup,
    hasUsers,
    hasEnv,
    step: needsSetup ? 'setup' : 'ready',
  })
})

/**
 * POST /api/setup/initialize
 * Complete the first-run setup. Creates admin user, saves config, generates JWT secret.
 */
setupRouter.post('/initialize', async (c) => {
  // Guard: prevent replay attack — reject if setup is already complete
  const existingSecret = process.env.JWT_SECRET
  if (existingSecret && existingSecret !== 'novelforge-dev-secret-change-in-production') {
    return c.json({
      success: false,
      error: 'Setup has already been completed. This endpoint is only available during initial configuration.',
    }, 409)
  }
  
  const body = await c.req.json().catch(() => ({}))
  const validation = setupSchema.safeParse(body)
  
  if (!validation.success) {
    return c.json({
      success: false,
      error: 'Invalid setup data',
      details: validation.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    }, 400)
  }
  
  const { username, password, providerName, providerType, providerBaseUrl, providerApiKey, providerModel } = validation.data
  
  try {
    // 1. Generate and save JWT secret
    const jwtSecret = generateJwtSecret()
    saveEnvVar('JWT_SECRET', jwtSecret)
    
    // 2. Create admin user
    const { hash, salt } = hashPassword(password)
    const userId = saveAdminUser(username, hash, salt)
    
    // 3. Save AI provider config if provided
    if (providerName && providerType) {
      saveEnvVar('DEFAULT_PROVIDER_NAME', providerName)
      saveEnvVar('DEFAULT_PROVIDER_TYPE', providerType)
      if (providerBaseUrl) saveEnvVar('DEFAULT_PROVIDER_BASE_URL', providerBaseUrl)
      if (providerModel) saveEnvVar('DEFAULT_PROVIDER_MODEL', providerModel)
      // Map provider type to correct env variable name
      const apiKeyEnvMap: Record<string, string> = {
        deepseek: 'DEEPSEEK_API_KEY',
        openai: 'OPENAI_API_KEY',
        claude: 'CLAUDE_API_KEY',
      }
      const apiKeyEnvName = apiKeyEnvMap[providerType] || 'DEEPSEEK_API_KEY'
      if (providerApiKey) saveEnvVar(apiKeyEnvName, providerApiKey)
    }
    
    // 4. Generate auth token for immediate login
    const token = await generateToken(userId, username, jwtSecret)
    
    return c.json({
      success: true,
      token,
      user: { userId, username, role: 'admin' },
      message: 'Setup complete! The server will apply new settings on next restart.',
    })
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err))
    return c.json({
      success: false,
      error: e.message || 'Setup failed',
    }, 500)
  }
})

/**
 * POST /api/setup/test-provider
 * Test an AI provider connection without saving it.
 */
setupRouter.post('/test-provider', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { baseUrl, apiKey } = body as { baseUrl?: string; apiKey?: string }
  
  if (!baseUrl) {
    return c.json({ ok: false, error: 'baseUrl is required' }, 400)
  }
  
  // SSRF prevention: only allow http/https schemes
  let testUrl: URL
  try {
    testUrl = new URL(baseUrl)
  } catch {
    return c.json({ ok: false, error: 'Invalid URL format' }, 400)
  }
  if (!['http:', 'https:'].includes(testUrl.protocol)) {
    return c.json({ ok: false, error: 'Only http and https URLs are allowed' }, 400)
  }
  // Block private/reserved IP ranges to prevent internal network access
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '169.254.', '10.', '172.16.', '192.168.']
  if (blockedHosts.some(h => testUrl.hostname === h || testUrl.hostname.startsWith(h))) {
    return c.json({ ok: false, error: 'Internal network addresses are not allowed' }, 400)
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    const normalized = baseUrl.replace(/\/+$/, '')
    const url = normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`
    
    const response = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timeout)
    
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return c.json({ ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` })
    }
    
    const data = await response.json() as any
    const models: string[] = (data.data || []).map((m: any) => m.id).filter(Boolean)
    
    return c.json({ ok: true, models })
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err))
    return c.json({ ok: false, error: e.message || 'Connection failed' })
  }
})

export { setupRouter }
