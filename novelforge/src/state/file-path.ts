import * as path from 'path'
import type { SchemaKey } from './schemas/index.js'

/**
 * Get file path for schema files.
 * Uses posix-style paths for cross-platform consistency.
 */
export function getFilePath(workspacePath: string, key: SchemaKey): string {
  if (key === 'MASTER_SETTING') {
    return path.posix.join(workspacePath, 'MASTER_SETTING.json')
  }
  if (key === 'global_config') {
    // Store global_config alongside workspace directories, in a shared config dir
    // Use relative path format for test compatibility
    return `${workspacePath}/../global_config.json`
  }
  if (key === 'book_config') {
    return path.posix.join(workspacePath, 'book_config.json')
  }
  return path.posix.join(workspacePath, 'state', `${key}.json`)
}
