import { z } from 'zod'
import { schemaRegistry, type SchemaKey } from './schemas/index.js'
import { getFilePath } from './file-path.js'

export class StateReader {
  private workspacePath: string
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  /** Cache TTL in milliseconds — entries older than this are re-read from disk */
  private readonly cacheTTL: number = 30_000 // 30 seconds

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async read<T extends SchemaKey>(key: T): Promise<z.infer<(typeof schemaRegistry)[T]>> {
    const cached = this.cache.get(key)
    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached.data
    }

    const filePath = getFilePath(this.workspacePath, key)
    const fs = await import('fs')

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    let data: unknown
    try {
      data = JSON.parse(content)
    } catch (err) {
      throw new Error(`Failed to parse state file for ${key}: ${filePath}`)
    }

    const schema = schemaRegistry[key]
    const result = schema.safeParse(data)

    if (!result.success) {
      throw new Error(`Invalid data for ${key}: ${result.error.message}`)
    }

    this.cache.set(key, { data: result.data, timestamp: Date.now() })
    return result.data
  }

  async exists(key: SchemaKey): Promise<boolean> {
    const filePath = getFilePath(this.workspacePath, key)
    const fs = await import('fs')
    return fs.existsSync(filePath)
  }

  async listKeys(): Promise<SchemaKey[]> {
    const fs = await import('fs')
    const stateDir = `${this.workspacePath}/state`

    if (!fs.existsSync(stateDir)) {
      return []
    }

    const files = fs.readdirSync(stateDir)
    const keys: SchemaKey[] = []

    for (const file of files) {
      if (file.endsWith('.json')) {
        const key = file.replace('.json', '') as SchemaKey
        if (key in schemaRegistry) {
          keys.push(key)
        }
      }
    }

    return keys
  }

  invalidateCache(key?: SchemaKey): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }
}
