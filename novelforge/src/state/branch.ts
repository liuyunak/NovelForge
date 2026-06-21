import * as fs from 'fs'
import * as path from 'path'
import { SnapshotManager, type Snapshot } from './snapshot.js'
import { logger } from '../logger.js'

export interface Branch {
  id: string
  name: string
  parentBranch: string
  createdAt: string
  chapterCount: number
}

export class BranchManager {
  private workspacePath: string
  private snapshotManager: SnapshotManager
  private branchesPath: string
  private branches: Branch[]

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.snapshotManager = new SnapshotManager(workspacePath)
    this.branchesPath = path.join(workspacePath, 'versions', 'branches.json')
    this.branches = this.loadBranches()
  }

  private loadBranches(): Branch[] {
    if (fs.existsSync(this.branchesPath)) {
      try {
        const raw = fs.readFileSync(this.branchesPath, 'utf-8')
        return JSON.parse(raw)
      } catch (err) {
        logger.warn({ err, path: this.branchesPath }, 'Failed to parse branches.json, using default')
        return [{ id: 'main', name: 'main', parentBranch: '', createdAt: new Date().toISOString(), chapterCount: 0 }]
      }
    }
    return [{ id: 'main', name: 'main', parentBranch: '', createdAt: new Date().toISOString(), chapterCount: 0 }]
  }

  private saveBranches(): void {
    fs.writeFileSync(this.branchesPath, JSON.stringify(this.branches, null, 2))
  }

  async createBranch(name: string, fromChapter: number): Promise<Branch> {
    const snapshot = await this.snapshotManager.createSnapshot(fromChapter, `Fork from chapter ${fromChapter}`)
    
    const branch: Branch = {
      id: `branch_${Date.now()}`,
      name,
      parentBranch: 'main',
      createdAt: new Date().toISOString(),
      chapterCount: fromChapter,
    }

    this.branches.push(branch)
    this.saveBranches()

    return branch
  }

  async listBranches(): Promise<Branch[]> {
    return this.branches
  }

  async switchBranch(branchId: string): Promise<void> {
    const branch = this.branches.find(b => b.id === branchId)
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`)
    }

    const snapshots = await this.snapshotManager.listSnapshots()
    const snapshot = snapshots.find(s => s.chapter === branch.chapterCount)
    
    if (snapshot) {
      await this.snapshotManager.restoreSnapshot(snapshot.id)
    }
  }

  async mergeBranch(sourceBranchId: string, targetBranchId: string = 'main'): Promise<void> {
    const source = this.branches.find(b => b.id === sourceBranchId)
    const target = this.branches.find(b => b.id === targetBranchId)
    
    if (!source || !target) {
      throw new Error('Branch not found')
    }

    logger.info(`Merging ${source.name} (${source.chapterCount} chapters) into ${target.name} (${target.chapterCount} chapters)`)

    // NOTE: mergeBranch currently only updates chapterCount metadata.
    // Full content merging (diff/patch of state files between branches)
    // is a planned feature. Until implemented, warn that this is metadata-only.
    if (source.chapterCount > target.chapterCount) {
      logger.warn(
        `[BranchManager] mergeBranch: updating chapterCount metadata only. ` +
        `Full content merge is not yet implemented — chapters from "${source.name}" ` +
        `were not copied to "${target.name}".`
      )
    }

    target.chapterCount = Math.max(target.chapterCount, source.chapterCount)
    this.saveBranches()
  }

  async deleteBranch(branchId: string): Promise<void> {
    if (branchId === 'main') {
      throw new Error('Cannot delete main branch')
    }

    this.branches = this.branches.filter(b => b.id !== branchId)
    this.saveBranches()
  }
}
