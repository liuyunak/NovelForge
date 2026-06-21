import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DPODataCollector } from '../../src/learning/dpo-collector'

describe('DPODataCollector', () => {
  let collector: DPODataCollector
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-dpo-'))
    collector = new DPODataCollector(tempDir)
  })

  afterEach(() => {
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('collectSample()', () => {
    it('should collect a valid DPO sample', async () => {
      const prompt = 'Edit this paragraph'
      const original = 'The sky was blue.'
      const edited = 'The sky shimmered in brilliant azure.'

      await collector.collectSample(prompt, original, edited, 1)

      expect(collector.getSampleCount()).toBe(1)
    })

    it('should skip identical texts', async () => {
      const text = 'This is the same text.'

      await collector.collectSample('prompt', text, text, 1)

      expect(collector.getSampleCount()).toBe(0)
    })

    it('should accept high-quality edited samples', async () => {
      const prompt = 'Expand description'
      const original = '房间很好。'
      const edited = '房间被夕阳的金色光辉笼罩着，优雅的天鹅绒窗帘框着大窗户，壁炉里温暖的火焰在木地板上投下轻轻摇曳的阴影。'

      await collector.collectSample(prompt, original, edited, 1)

      expect(collector.getSampleCount()).toBe(1)
      
      const samples = collector.getSamplesForTraining()
      expect(samples[0].qualityScore).toBeGreaterThan(0)
      expect(samples[0].reason).toBeDefined()
    })
  })

  describe('getStats()', () => {
    it('should return zero stats when no samples', () => {
      const stats = collector.getStats()

      expect(stats.totalSamples).toBe(0)
      expect(stats.avgQualityScore).toBe(0)
      expect(stats.samplesByChapter).toEqual({})
      expect(stats.dateRange.earliest).toBe('')
      expect(stats.dateRange.latest).toBe('')
    })

    it('should return accurate stats after collecting samples', async () => {
      await collector.collectSample('Edit 1', '原', '房间被夕阳的金色光辉笼罩着，窗帘优雅。', 1)
      await collector.collectSample('Edit 2', '原', '山峰巍峨壮丽，雪顶穿透云层。', 2)
      await collector.collectSample('Edit 3', '原', '森林生机勃勃，鸟儿歌唱，树叶在微风中沙沙作响。', 1)

      const stats = collector.getStats()

      expect(stats.totalSamples).toBe(3)
      expect(stats.avgQualityScore).toBeGreaterThan(0)
      expect(stats.samplesByChapter[1]).toBe(2)
      expect(stats.samplesByChapter[2]).toBe(1)
      expect(stats.dateRange.earliest).toBeTruthy()
      expect(stats.dateRange.latest).toBeTruthy()
    })
  })

  describe('exportForTraining()', () => {
    it('should export samples without metadata', async () => {
      await collector.collectSample('Prompt 1', '原', '美丽的花园里开满了五颜六色的鲜花，处处生机勃勃。', 1)

      const outputPath = path.join(tempDir, 'exported_dpo.json')
      const count = await collector.exportForTraining(outputPath)

      expect(count).toBe(1)
      expect(fs.existsSync(outputPath)).toBe(true)

      const exportedData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
      expect(exportedData[0]).toHaveProperty('prompt')
      expect(exportedData[0]).toHaveProperty('chosen')
      expect(exportedData[0]).toHaveProperty('rejected')
      expect(exportedData[0]).not.toHaveProperty('qualityScore')
      expect(exportedData[0]).not.toHaveProperty('timestamp')
    })
  })

  describe('batchImport()', () => {
    it('should import multiple samples at once', async () => {
      const samples = [
        {
          prompt: 'Edit 1',
          chosen: '广阔的沙漠在他们面前无边无际延伸，金色的沙粒在正午烈日的炙烤下闪闪发光。',
          rejected: '天气很热。',
          chapter: 1,
          timestamp: new Date().toISOString(),
        },
        {
          prompt: 'Edit 2',
          chosen: '雨水无情地倾泻而下，猛烈地敲击着窗玻璃，带着近乎暴烈的强度。',
          rejected: '雨下得很大。',
          chapter: 2,
          timestamp: new Date().toISOString(),
        },
      ]

      const imported = await collector.batchImport(samples)

      expect(imported).toBe(2)
      expect(collector.getSampleCount()).toBe(2)
    })

    it('should filter out invalid samples', async () => {
      const invalidSamples = [
        {
          prompt: 'Edit',
          chosen: '相同的文本。',
          rejected: '相同的文本。', // identical
          chapter: 1,
          timestamp: new Date().toISOString(),
        },
        {
          prompt: '', // missing prompt
          chosen: '某些文本。',
          rejected: '其他文本。',
          chapter: 1,
          timestamp: new Date().toISOString(),
        },
        {
          prompt: 'Valid edit',
          chosen: '高质量编辑文本，富有描述性语言和生动的意象 throughout。',
          rejected: '原',
          chapter: 1,
          timestamp: new Date().toISOString(),
        },
      ]

      const imported = await collector.batchImport(invalidSamples)

      // Only the valid sample should be imported
      expect(imported).toBe(1)
    })
  })

  describe('clearAll()', () => {
    it('should remove all samples', async () => {
      await collector.collectSample('Prompt', '原', '经过精心编辑的高质量文本，富有生动的描述性语言和优美的文笔。', 1)
      await collector.collectSample('Prompt 2', '原', '另一段编辑精良的段落，具有出色的散文质量和引人入胜的叙事风格。', 2)

      expect(collector.getSampleCount()).toBe(2)

      const cleared = await collector.clearAll()

      expect(cleared).toBe(2)
      expect(collector.getSampleCount()).toBe(0)
    })
  })

  describe('persistence', () => {
    it('should persist samples across instances', async () => {
      // First instance collects a sample
      await collector.collectSample('Prompt', '原', '宏伟的城堡矗立在山丘上，古老的石墙经受住了几个世纪的风吹雨打。', 1)

      // Create new instance (simulates restart)
      const newCollector = new DPODataCollector(tempDir)

      expect(newCollector.getSampleCount()).toBe(1)

      const samples = newCollector.getSamplesForTraining()
      expect(samples[0].prompt).toBe('Prompt')
      expect(samples[0].chapter).toBe(1)
    })
  })
})
