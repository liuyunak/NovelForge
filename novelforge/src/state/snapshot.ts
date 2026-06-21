import * as fs from 'fs'
import * as path from 'path'

/**
 * Safe rename that falls back to copy + unlink when EXDEV occurs
 * (cross-device rename is not supported by the OS).
 */
function safeRename(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e?.code === 'EXDEV') {
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
    } else {
      throw err
    }
  }
}

export interface Snapshot {
  id: string
  name: string
  chapter: number
  timestamp: string
  files: string[]
}

export class SnapshotManager {
  private workspacePath: string
  private versionsPath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.versionsPath = path.join(workspacePath, 'versions')
  }

  async ensureDirectories(): Promise<void> {
    if (!fs.existsSync(this.versionsPath)) {
      fs.mkdirSync(this.versionsPath, { recursive: true })
    }
  }

  async createSnapshot(chapter: number, name?: string): Promise<Snapshot> {
    await this.ensureDirectories()
    
    const snapshotId = `snapshot_${Date.now()}`
    const snapshotDir = path.join(this.versionsPath, snapshotId)
    fs.mkdirSync(snapshotDir, { recursive: true })

    const filesToBackup = [
      'MASTER_SETTING.json',
      'book_config.json',
      'state/working_memory.json',
      'state/current_state.json',
      'state/characters.json',
      'state/plot_threads.json',
      'state/particle_ledger.json',
      'state/chapter_summaries.json',
      'state/rhythm_map.json',
      'state/power_system.json',
      'state/learned_rules.json',
      'state/ai_fingerprint_blacklist.json',
    ]

    const backedUpFiles: string[] = []

    for (const file of filesToBackup) {
      const srcPath = path.join(this.workspacePath, file)
      const destPath = path.join(snapshotDir, path.basename(file))
      
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath)
        backedUpFiles.push(file)
      }
    }

    const snapshot: Snapshot = {
      id: snapshotId,
      name: name || `Chapter ${chapter}`,
      chapter,
      timestamp: new Date().toISOString(),
      files: backedUpFiles,
    }

    fs.writeFileSync(
      path.join(snapshotDir, 'snapshot.json'),
      JSON.stringify(snapshot, null, 2)
    )

    return snapshot
  }

  async listSnapshots(): Promise<Snapshot[]> {
    await this.ensureDirectories()
    
    const snapshots: Snapshot[] = []
    const entries = fs.readdirSync(this.versionsPath, { withFileTypes: true })
    
    for (const entry of entries) {
      // Only process directories (snapshots), skip files like branches.json
      if (!entry.isDirectory()) continue
      
      const snapshotJsonPath = path.join(this.versionsPath, entry.name, 'snapshot.json')
      if (fs.existsSync(snapshotJsonPath)) {
        try {
          const content = fs.readFileSync(snapshotJsonPath, 'utf-8')
          snapshots.push(JSON.parse(content))
        } catch {
          // Skip corrupted snapshot files
        }
      }
    }
    
    return snapshots.sort((a, b) => b.chapter - a.chapter)
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshotDir = path.join(this.versionsPath, snapshotId)
    
    if (!fs.existsSync(snapshotDir)) {
      throw new Error(`Snapshot not found: ${snapshotId}`)
    }

    const snapshotJsonPath = path.join(snapshotDir, 'snapshot.json')
    let snapshot: Snapshot
    try {
      snapshot = JSON.parse(fs.readFileSync(snapshotJsonPath, 'utf-8'))
    } catch (err) {
      throw new Error(`Failed to parse snapshot file: ${snapshotJsonPath}`)
    }

    // Atomic restore: copy all files to a staging directory first,
    // then rename them into place atomically to prevent partial-restore corruption.
    const stagingDir = path.join(this.workspacePath, 'versions', `.restore_${snapshotId}`)
    try {
      // Ensure clean staging directory
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true })
      }
      fs.mkdirSync(stagingDir, { recursive: true })

      // Collect existing files' backups for rollback
      const rollbackFiles: Array<{ destPath: string; backupPath: string }> = []

      for (const file of snapshot.files) {
        const srcPath = path.join(snapshotDir, path.basename(file))
        const destPath = path.join(this.workspacePath, file)
        // Copy snapshot file to staging first
        const stagingPath = path.join(stagingDir, path.basename(file))

        if (!fs.existsSync(srcPath)) continue

        // Backup existing file if present
        if (fs.existsSync(destPath)) {
          const backupPath = path.join(stagingDir, `.bak_${path.basename(file)}`)
          fs.copyFileSync(destPath, backupPath)
          rollbackFiles.push({ destPath, backupPath })
        }

        // Copy snapshot → staging
        fs.copyFileSync(srcPath, stagingPath)
      }

      // All files staged successfully — now atomically move staging files into place
      for (const file of snapshot.files) {
        const destPath = path.join(this.workspacePath, file)
        const stagingPath = path.join(stagingDir, path.basename(file))

        if (!fs.existsSync(stagingPath)) continue

        // Ensure destination directories exist
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        // Atomic rename from staging → destination
        safeRename(stagingPath, destPath)
      }

      // Clean up staging directory
      fs.rmSync(stagingDir, { recursive: true, force: true })
    } catch (err) {
      // Restore failed — roll back any files that were already moved
      for (const { destPath, backupPath } of
        (() => {
          try {
            const rollbackFiles: Array<{ destPath: string; backupPath: string }> = []
            const stagingDir = path.join(this.workspacePath, 'versions', `.restore_${snapshotId}`)
            if (fs.existsSync(stagingDir)) {
              const bakFiles = fs.readdirSync(stagingDir).filter(f => f.startsWith('.bak_'))
              for (const bakFile of bakFiles) {
                const backupPath = path.join(stagingDir, bakFile)
                const originalName = bakFile.replace('.bak_', '')
                const destPath = path.join(this.workspacePath, 'state', originalName)
                if (fs.existsSync(backupPath)) {
                  rollbackFiles.push({ destPath, backupPath })
                }
              }
            }
            return rollbackFiles
          } catch { return [] }
        })()
      ) {
        try { fs.copyFileSync(backupPath, destPath) } catch { /* best-effort rollback */ }
      }
      // Cleanup
      try {
        const stagingDir2 = path.join(this.workspacePath, 'versions', `.restore_${snapshotId}`)
        if (fs.existsSync(stagingDir2)) fs.rmSync(stagingDir2, { recursive: true, force: true })
      } catch { /* best-effort */ }
      throw new Error(`Snapshot restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshotDir = path.join(this.versionsPath, snapshotId)
    
    if (fs.existsSync(snapshotDir)) {
      fs.rmSync(snapshotDir, { recursive: true })
    }
  }
}
