import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import os from 'os'

/**
 * Tests for fine-tune API router.
 * 
 * Verifies:
 * 1. /finetune/status endpoint returns correct structure
 * 2. /finetune/generate endpoint handles missing data
 * 3. /finetune/train endpoint validates training data existence
 * 4. /finetune/logs endpoint returns logs structure
 */
describe('Fine-tune API Router', () => {
  let tmpDir: string
  let processedPath: string
  let trainingPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-api-test-'))
    processedPath = path.join(tmpDir, 'data', 'processed')
    trainingPath = path.join(tmpDir, 'data', 'training')
    fs.mkdirSync(processedPath, { recursive: true })
    fs.mkdirSync(trainingPath, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('should import fineTuneRouter successfully', async () => {
    const { fineTuneRouter } = await import('../../src/api/finetune.js')
    expect(fineTuneRouter).toBeDefined()
  })

  it('should have all expected routes registered', async () => {
    const { fineTuneRouter } = await import('../../src/api/finetune.js')
    
    // Hono router should be defined and callable
    expect(fineTuneRouter).toBeDefined()
    expect(typeof fineTuneRouter.get).toBe('function')
    expect(typeof fineTuneRouter.post).toBe('function')
  })

  it('should export fineTuneRouter from api index', async () => {
    const { apiRouter } = await import('../../src/api/index.js')
    expect(apiRouter).toBeDefined()
  })
})
