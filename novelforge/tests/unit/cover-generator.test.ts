/**
 * Unit tests for CoverGeneratorAgent
 *
 * Tests: constructor, error handling, CoverResult interface shape.
 * Feature-flag and SD API mock tests are in cover-generator-mock.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import type { CoverResult } from '../../src/agents/cover-generator.js'

const testWorkspacePath = path.join(process.cwd(), 'workspace', 'test_cover_gen')

function setupTestWorkspace(): void {
  const dirs = [
    path.join(testWorkspacePath, 'state'),
    path.join(testWorkspacePath, 'exports', 'covers'),
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const masterSetting = {
    title: '星辰传说',
    genre: '玄幻修仙',
    core_premise: '一个废柴少年意外获得星辰之力，踏上逆天修行之路',
    core_conflict: '主角与天道规则对抗，在力量与情感之间做出抉择',
  }
  fs.writeFileSync(
    path.join(testWorkspacePath, 'state', 'MASTER_SETTING.json'),
    JSON.stringify(masterSetting),
  )
  fs.writeFileSync(
    path.join(testWorkspacePath, 'state', 'MASTER_SETTING.lock'),
    '',
  )
}

function cleanupTestWorkspace(): void {
  if (fs.existsSync(testWorkspacePath)) {
    fs.rmSync(testWorkspacePath, { recursive: true, force: true })
  }
}

async function createAgent(workspacePath: string) {
  const { CoverGeneratorAgent } = await import('../../src/agents/cover-generator.js')
  const { ModelRouter } = await import('../../src/router.js')
  const { StateManager } = await import('../../src/state/manager.js')
  const router = new ModelRouter()
  const stateManager = new StateManager(workspacePath)
  return new CoverGeneratorAgent(router, stateManager)
}

describe('CoverGeneratorAgent', () => {
  beforeAll(() => {
    setupTestWorkspace()
  })

  afterAll(() => {
    cleanupTestWorkspace()
  })

  describe('constructor', () => {
    it('should create agent with router and stateManager', async () => {
      const agent = await createAgent(testWorkspacePath)
      expect(agent).toBeDefined()
    })
  })

  describe('generate()', () => {
    it('should handle missing workspace state gracefully', async () => {
      const emptyPath = path.join(process.cwd(), 'workspace', 'test_cover_empty')
      const emptyStateDir = path.join(emptyPath, 'state')
      fs.mkdirSync(emptyStateDir, { recursive: true })

      try {
        const agent = await createAgent(emptyPath)
        const result = await agent.generate()
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
      } finally {
        if (fs.existsSync(emptyPath)) {
          fs.rmSync(emptyPath, { recursive: true, force: true })
        }
      }
    })
  })

  describe('CoverResult interface', () => {
    it('should have correct shape on failure', () => {
      const result: CoverResult = {
        success: false,
        prompt: '',
        error: 'Something went wrong',
      }
      expect(result.success).toBe(false)
      expect(result.prompt).toBe('')
      expect(result.imageUrl).toBeUndefined()
      expect(result.error).toBe('Something went wrong')
    })

    it('should have correct shape on success', () => {
      const result: CoverResult = {
        success: true,
        prompt: 'A fantasy novel cover with stars and magic',
        imageUrl: 'data:image/png;base64,abc123',
        localPath: '/workspace/exports/covers/test.png',
      }
      expect(result.success).toBe(true)
      expect(result.imageUrl).toBeDefined()
      expect(result.localPath).toBeDefined()
    })
  })
})
