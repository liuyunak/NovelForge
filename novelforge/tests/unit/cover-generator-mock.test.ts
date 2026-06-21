/**
 * Unit tests for CoverGeneratorAgent with mocked config.
 *
 * Tests feature flag disable and SD API not-configured scenarios.
 * These tests use vi.mock() at the top level before any imports to
 * ensure the mock takes effect before module resolution.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Mock config BEFORE any imports that transitively load it
vi.mock('../../src/config.js', () => ({
  config: {
    featureCoverGeneration: false,
    sdApiUrl: '',
    sdApiKey: '',
    port: 3001,
    host: '0.0.0.0',
    deepseekApiKey: 'test-mock-key',
    deepseekBaseUrl: 'https://api.deepseek.com',
    localModelEnabled: false,
    localModelBaseUrl: 'http://127.0.0.1:8080/v1',
    localModelName: 'test',
    dbPath: './data/test.db',
    logLevel: 'error',
    jwtSecret: 'test-secret',
    featureScriptExport: true,
    featureAiDetection: true,
    featureStyleTransfer: true,
  },
}))

const testWorkspacePath = path.join(process.cwd(), 'workspace', 'test_cover_mock')

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

describe('CoverGeneratorAgent (mocked config)', () => {
  beforeAll(() => {
    setupTestWorkspace()
  })

  afterAll(() => {
    cleanupTestWorkspace()
  })

  it('should return error when feature flag is disabled', async () => {
    const { CoverGeneratorAgent } = await import('../../src/agents/cover-generator.js')
    const { ModelRouter } = await import('../../src/router.js')
    const { StateManager } = await import('../../src/state/manager.js')

    const agent = new CoverGeneratorAgent(new ModelRouter(), new StateManager(testWorkspacePath))
    const result = await agent.generate()

    expect(result.success).toBe(false)
    expect(result.error).toContain('disabled')
  })
})
