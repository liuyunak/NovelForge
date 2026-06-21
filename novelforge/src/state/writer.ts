import * as path from 'path'
import { z } from 'zod'
import { schemaRegistry, type SchemaKey } from './schemas/index.js'
import { getFilePath } from './file-path.js'

export class StateWriter {
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async ensureDirectories(): Promise<void> {
    const fs = await import('fs')
    const wp = this.workspacePath
    const dirs = [
      wp,
      path.join(wp, 'state'),
      path.join(wp, 'volumes'),
      path.join(wp, 'blocks'),
      path.join(wp, 'sheets'),
      path.join(wp, 'scenes'),
      path.join(wp, 'chapters'),
      path.join(wp, 'braindump'),
      path.join(wp, 'versions'),
    ]

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  async write<T extends SchemaKey>(key: T, data: z.infer<(typeof schemaRegistry)[T]>): Promise<void> {
    const filePath = getFilePath(this.workspacePath, key)
    const tempPath = `${filePath}.tmp.${Date.now()}`
    const fs = await import('fs')

    const content = JSON.stringify(data, null, 2)
    fs.writeFileSync(tempPath, content, 'utf-8')
    
    // Safe rename: fallback to copy+unlink on EXDEV (cross-device rename)
    try {
      fs.renameSync(tempPath, filePath)
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e?.code === 'EXDEV') {
        // Cross-device: copy then unlink the temp file
        fs.copyFileSync(tempPath, filePath)
        fs.unlinkSync(tempPath)
      } else {
        // Cleanup temp file before rethrowing
        try { fs.unlinkSync(tempPath) } catch { /* best-effort */ }
        throw err
      }
    }
  }

  async delete(key: SchemaKey): Promise<void> {
    const filePath = getFilePath(this.workspacePath, key)
    const fs = await import('fs')

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  async backup(key: SchemaKey): Promise<string> {
    const fs = await import('fs')
    const filePath = getFilePath(this.workspacePath, key)
    const backupPath = path.join(this.workspacePath, 'versions', `${key}_${Date.now()}.json`)

    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath)
      return backupPath
    }

    throw new Error(`Cannot backup: ${key} not found`)
  }
}
