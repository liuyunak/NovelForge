import * as path from 'path'
import { SnapshotManager } from './snapshot.js'
import { StateManager } from './manager.js'

export interface RollbackResult {
  success: boolean
  restoredChapter: number
  message: string
}

export class RollbackManager {
  private snapshotManager: SnapshotManager
  private stateManager: StateManager
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.snapshotManager = new SnapshotManager(workspacePath)
    this.stateManager = new StateManager(workspacePath)
  }

  async rollbackChapter(chapterNumber: number): Promise<RollbackResult> {
    const snapshots = await this.snapshotManager.listSnapshots()
    
    const targetSnapshot = snapshots.find(s => s.chapter === chapterNumber)
    
    if (!targetSnapshot) {
      return {
        success: false,
        restoredChapter: chapterNumber,
        message: `No snapshot found for chapter ${chapterNumber}`,
      }
    }

    try {
      await this.snapshotManager.restoreSnapshot(targetSnapshot.id)
      
      return {
        success: true,
        restoredChapter: chapterNumber,
        message: `Successfully rolled back to chapter ${chapterNumber} snapshot`,
      }
    } catch (error) {
      return {
        success: false,
        restoredChapter: chapterNumber,
        message: `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  async rollbackToPrevious(): Promise<RollbackResult> {
    const snapshots = await this.snapshotManager.listSnapshots()
    
    if (snapshots.length < 2) {
      return {
        success: false,
        restoredChapter: 0,
        message: 'No previous snapshot available',
      }
    }

    const currentChapter = snapshots[0].chapter
    const previousSnapshot = snapshots[1]
    
    return this.rollbackChapter(previousSnapshot.chapter)
  }

  async deleteChapterData(chapterNumber: number): Promise<void> {
    const padded = String(chapterNumber).padStart(3, '0')
    const chapterFile = path.join(this.workspacePath, 'chapters', `chapter_${padded}.md`)
    const sheetFile = path.join(this.workspacePath, 'sheets', `chapter_${padded}.json`)
    
    const fs = await import('fs')
    
    // Use tryUnlink to avoid crashing on locked/absent files,
    // and to reduce TOCTOU window between existsSync and unlinkSync.
    const tryUnlink = (filePath: string) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch (err: unknown) {
        // ENOENT = already gone (TOCTOU race), EACCES/EPERM = locked
        const e = err as { code?: string }
        if (e?.code !== 'ENOENT') {
          throw err
        }
      }
    }
    
    tryUnlink(chapterFile)
    tryUnlink(sheetFile)
  }
}
