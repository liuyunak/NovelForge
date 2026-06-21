/**
 * Tenant Manager — Single-tenant & Multi-tenant database isolation.
 * 
 * Single-tenant mode (default for open-source users):
 *   One user = one instance. Uses a single SQLite database.
 * 
 * Multi-tenant mode (for SaaS deployments):
 *   Multiple users share one server. Each user gets an isolated
 *   workspace and database, separated by userId.
 * 
 * Mode is controlled by TENANT_MODE env var:
 *   TENANT_MODE=single  (default, open-source)
 *   TENANT_MODE=multi   (SaaS mode)
 */
import * as path from 'node:path'
import * as fs from 'node:fs'

export type TenantMode = 'single' | 'multi'

export interface TenantInfo {
  userId: string
  username: string
  workspacePath: string
  dbPath: string
  createdAt: string
}

class TenantManager {
  private mode: TenantMode
  private baseDataDir: string
  private baseWorkspaceDir: string

  constructor() {
    this.mode = (process.env.TENANT_MODE as TenantMode) || 'single'
    this.baseDataDir = path.resolve(process.cwd(), 'data')
    this.baseWorkspaceDir = path.resolve(process.cwd(), 'workspace')
  }

  getMode(): TenantMode {
    return this.mode
  }

  /**
   * Get the database path for a tenant.
   * Single-tenant: data/novelforge.db
   * Multi-tenant:  data/tenants/{userId}/novelforge.db
   */
  getDbPath(userId?: string): string {
    if (this.mode === 'single' || !userId) {
      return path.join(this.baseDataDir, 'novelforge.db')
    }
    const dir = path.join(this.baseDataDir, 'tenants', sanitizeUserId(userId))
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'novelforge.db')
  }

  /**
   * Get the workspace directory for a tenant.
   * Single-tenant: workspace/
   * Multi-tenant:  workspace/tenants/{userId}/
   */
  getWorkspacePath(userId?: string): string {
    if (this.mode === 'single' || !userId) {
      return this.baseWorkspaceDir
    }
    const dir = path.join(this.baseWorkspaceDir, 'tenants', sanitizeUserId(userId))
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  /**
   * Get the AI providers config path for a tenant.
   */
  getProviderConfigPath(userId?: string): string {
    if (this.mode === 'single' || !userId) {
      return path.join(this.baseDataDir, 'ai-providers.json')
    }
    const dir = path.join(this.baseDataDir, 'tenants', sanitizeUserId(userId!))
    return path.join(dir, 'ai-providers.json')
  }

  /**
   * Initialize tenant directories and data.
   */
  initTenant(userId: string, username: string): TenantInfo {
    const workspacePath = this.getWorkspacePath(userId)
    const dbPath = this.getDbPath(userId)

    // Ensure directories exist
    fs.mkdirSync(workspacePath, { recursive: true })
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    return {
      userId,
      username,
      workspacePath,
      dbPath,
      createdAt: new Date().toISOString(),
    }
  }

  /**
   * List all tenants (multi-tenant mode only).
   */
  listTenants(): TenantInfo[] {
    if (this.mode !== 'multi') return []

    const tenantsDir = path.join(this.baseDataDir, 'tenants')
    if (!fs.existsSync(tenantsDir)) return []

    return fs.readdirSync(tenantsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const workspacePath = this.getWorkspacePath(d.name)
        const dbPath = this.getDbPath(d.name)
        return {
          userId: d.name,
          username: d.name, // In multi-tenant, look up from users.json
          workspacePath,
          dbPath,
          createdAt: '',
        }
      })
  }
}

// ==================== Helpers ====================

/**
 * Sanitize a userId for use in filesystem paths.
 * Uses base64url encoding to preserve uniqueness, preventing collisions
 * that occur when different userIds (e.g. "user/a" and "user_b") map to
 * the same sanitized name ("user_a").
 *
 * The encoded result is safe for use in directory names across all platforms.
 */
function sanitizeUserId(id: string): string {
  // Encode to base64url to preserve uniqueness, then strip padding
  const encoded = Buffer.from(id, 'utf-8').toString('base64url')
  return encoded
}

// ==================== Singleton ====================

let instance: TenantManager | null = null

export function getTenantManager(): TenantManager {
  if (!instance) {
    instance = new TenantManager()
  }
  return instance
}
