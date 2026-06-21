import { z } from 'zod'
import { schemaRegistry, type SchemaKey } from './schemas/index.js'
import { StateReader } from './reader.js'
import { StateWriter } from './writer.js'

export class StateManager {
  private reader: StateReader
  private writer: StateWriter
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.reader = new StateReader(workspacePath)
    this.writer = new StateWriter(workspacePath)
  }

  async initialize(): Promise<void> {
    await this.writer.ensureDirectories()
  }

  async read<T extends SchemaKey>(key: T): Promise<z.infer<(typeof schemaRegistry)[T]>> {
    return this.reader.read(key)
  }

  async write<T extends SchemaKey>(key: T, data: z.infer<(typeof schemaRegistry)[T]>): Promise<void> {
    const schema = schemaRegistry[key]
    const result = schema.safeParse(data)
    
    if (!result.success) {
      throw new Error(`Validation failed for ${key}: ${result.error.message}`)
    }
    
    await this.writer.write(key, result.data)
    this.reader.invalidateCache(key)
  }

  async patch<T extends SchemaKey>(
    key: T,
    patches: Partial<z.infer<(typeof schemaRegistry)[T]>>
  ): Promise<void> {
    const current = await this.read(key)
    const merged = { ...current, ...patches } as z.infer<(typeof schemaRegistry)[T]>
    await this.write(key, merged)
  }

  async exists(key: SchemaKey): Promise<boolean> {
    return this.reader.exists(key)
  }

  async listKeys(): Promise<SchemaKey[]> {
    return this.reader.listKeys()
  }
}
