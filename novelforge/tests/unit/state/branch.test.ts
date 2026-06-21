import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BranchManager } from '../../../src/state/branch.js'

describe('BranchManager', () => {
  let tmpDir: string
  let bm: BranchManager

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelforge-test-branch-'))

    // Setup minimal workspace for snapshot creation
    const stateDir = path.join(tmpDir, 'state')
    const versionsDir = path.join(tmpDir, 'versions')
    fs.mkdirSync(stateDir, { recursive: true })
    fs.mkdirSync(versionsDir, { recursive: true })

    // Create state files needed for snapshots
    fs.writeFileSync(path.join(tmpDir, 'MASTER_SETTING.json'), JSON.stringify({ title: 'Test' }), 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'book_config.json'), JSON.stringify({}), 'utf-8')
    const stateFiles = ['working_memory', 'current_state', 'characters', 'plot_threads',
      'particle_ledger', 'chapter_summaries', 'rhythm_map', 'power_system', 'learned_rules',
      'ai_fingerprint_blacklist']
    for (const f of stateFiles) {
      fs.writeFileSync(path.join(stateDir, `${f}.json`), JSON.stringify({}), 'utf-8')
    }

    bm = new BranchManager(tmpDir)
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should have a default main branch', async () => {
    const branches = await bm.listBranches()
    expect(branches).toHaveLength(1)
    expect(branches[0].id).toBe('main')
    expect(branches[0].name).toBe('main')
  })

  it('should create a new branch', async () => {
    const branch = await bm.createBranch('alternate-ending', 10)
    expect(branch.id).toMatch(/^branch_/)
    expect(branch.name).toBe('alternate-ending')
    expect(branch.parentBranch).toBe('main')
    expect(branch.chapterCount).toBe(10)

    const branches = await bm.listBranches()
    expect(branches).toHaveLength(2)
  })

  it('should create branch and persist to branches.json', async () => {
    await bm.createBranch('test-branch', 5)
    const branchesPath = path.join(tmpDir, 'versions', 'branches.json')
    expect(fs.existsSync(branchesPath)).toBe(true)

    const raw = JSON.parse(fs.readFileSync(branchesPath, 'utf-8'))
    expect(raw).toHaveLength(2)
    expect(raw[1].name).toBe('test-branch')
  })

  it('should switch to an existing branch', async () => {
    const branch = await bm.createBranch('side-story', 3)
    // Should not throw
    await expect(bm.switchBranch(branch.id)).resolves.not.toThrow()
  })

  it('should throw when switching to non-existent branch', async () => {
    await expect(bm.switchBranch('non_existent')).rejects.toThrow('Branch not found')
  })

  it('should merge branches updating chapter count', async () => {
    const source = await bm.createBranch('feature-branch', 15)
    await bm.mergeBranch(source.id, 'main')

    const branches = await bm.listBranches()
    const mainBranch = branches.find(b => b.id === 'main')
    expect(mainBranch?.chapterCount).toBe(15)
  })

  it('should throw when merging non-existent branches', async () => {
    await expect(bm.mergeBranch('non_existent')).rejects.toThrow('Branch not found')
  })

  it('should delete a non-main branch', async () => {
    const branch = await bm.createBranch('temp-branch', 2)
    await bm.deleteBranch(branch.id)

    const branches = await bm.listBranches()
    expect(branches.find(b => b.id === branch.id)).toBeUndefined()
  })

  it('should throw when deleting main branch', async () => {
    await expect(bm.deleteBranch('main')).rejects.toThrow('Cannot delete main branch')
  })

  it('should list all branches including newly created', async () => {
    await bm.createBranch('branch-a', 1)
    await bm.createBranch('branch-b', 2)

    const branches = await bm.listBranches()
    const names = branches.map(b => b.name)
    expect(names).toContain('main')
    expect(names).toContain('branch-a')
    expect(names).toContain('branch-b')
  })

  it('should track createdAt for each branch', async () => {
    const branch = await bm.createBranch('timestamp-test', 1)
    const date = new Date(branch.createdAt)
    expect(date.getTime()).toBeGreaterThan(0)
    expect(isNaN(date.getTime())).toBe(false)
  })
})
