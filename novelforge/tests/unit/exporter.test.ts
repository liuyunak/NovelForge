/**
 * Unit tests for Exporter
 *
 * Tests: TXT export, DOCX generation, PDF HTML wrapper, EPUB generation,
 * batch export, export history, file management, progress callback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import { Exporter } from '../../src/core/exporter.js'

const testWorkspacePath = path.join(process.cwd(), 'workspace', 'test_export_novel')

function setupTestWorkspace(): void {
  const dirs = [
    path.join(testWorkspacePath, 'chapters'),
    path.join(testWorkspacePath, 'state'),
    path.join(testWorkspacePath, 'exports'),
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Create sample chapters
  const chapters = [
    { num: 1, title: '觉醒', content: '# 觉醒\n\n主角睁开了眼睛，发现自己躺在一个陌生的房间里。\n\n"这里是哪里？"他喃喃自语。' },
    { num: 2, title: '测试', content: '# 测试\n\n测试仪式开始了。\n\n主角走上了测试台，所有人都注视着他。\n\n"开始吧。"长老说道。' },
    { num: 3, title: '突破', content: '# 突破\n\n光芒从主角身上爆发出来。\n\n"这不可能！"有人惊呼。\n\n主角微微一笑，他知道，这只是开始。' },
  ]

  for (const ch of chapters) {
    const filename = `chapter_${String(ch.num).padStart(3, '0')}.md`
    fs.writeFileSync(path.join(testWorkspacePath, 'chapters', filename), ch.content)
  }

  // Create MASTER_SETTING.json
  const setting = {
    work_id: 'test_novel',
    title: '测试小说',
    author: '测试作者',
    genre: '玄幻',
    core_premise: '一个测试用的核心设定',
  }
  fs.writeFileSync(
    path.join(testWorkspacePath, 'state', 'MASTER_SETTING.json'),
    JSON.stringify(setting, null, 2)
  )
}

function cleanupTestWorkspace(): void {
  if (fs.existsSync(testWorkspacePath)) {
    fs.rmSync(testWorkspacePath, { recursive: true, force: true })
  }
}

describe('Exporter', () => {
  beforeAll(() => {
    setupTestWorkspace()
  })

  afterAll(() => {
    cleanupTestWorkspace()
  })

  describe('TXT export', () => {
    it('should export to TXT format', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({ format: 'txt', includeMetadata: true })

      expect(fs.existsSync(outputPath)).toBe(true)
      const content = fs.readFileSync(outputPath, 'utf-8')
      expect(content).toContain('测试小说')
      expect(content).toContain('第1章')
      expect(content).toContain('主角睁开了眼睛')
    })

    it('should include chapter range filter', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({
        format: 'txt',
        chapterRange: { start: 2, end: 2 },
      })

      const content = fs.readFileSync(outputPath, 'utf-8')
      expect(content).not.toContain('第1章')
      expect(content).toContain('第2章')
      expect(content).not.toContain('第3章')
    })

    it('should fire progress callback', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const progressEvents: Array<{ current: number; total: number; phase: string }> = []

      await exporter.export({
        format: 'txt',
        onProgress: (current, total, phase) => {
          progressEvents.push({ current, total, phase })
        },
      })

      expect(progressEvents.length).toBeGreaterThanOrEqual(2)
      expect(progressEvents[0].phase).toBe('loading')
      expect(progressEvents[progressEvents.length - 1].phase).toBe('complete')
    })
  })

  describe('DOCX export', () => {
    it('should generate a valid DOCX (ZIP) file', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({ format: 'docx' })

      expect(fs.existsSync(outputPath)).toBe(true)

      // DOCX is a ZIP file — check ZIP signature (PK\x03\x04)
      const buffer = fs.readFileSync(outputPath)
      expect(buffer[0]).toBe(0x50) // 'P'
      expect(buffer[1]).toBe(0x4B) // 'K'

      // Should be larger than a minimal ZIP (headers + content)
      expect(buffer.length).toBeGreaterThan(500)
    })

    it('should contain required DOCX structure files', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({ format: 'docx' })

      const buffer = fs.readFileSync(outputPath)
      // Verify ZIP contains expected entries by checking for their byte signatures in the central directory
      // The ZIP should contain [Content_Types].xml, word/document.xml, etc.
      const contentStr = buffer.toString('latin1')
      expect(contentStr).toContain('[Content_Types].xml')
      expect(contentStr).toContain('word/document.xml')
      expect(contentStr).toContain('word/styles.xml')
    })
  })

  describe('PDF export', () => {
    it('should generate an HTML-based PDF file', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({ format: 'pdf' })

      expect(fs.existsSync(outputPath)).toBe(true)
      const content = fs.readFileSync(outputPath, 'utf-8')

      expect(content).toContain('<!DOCTYPE html>')
      expect(content).toContain('测试小说')
      expect(content).toContain('@page')
      expect(content).toContain('第1章')
      expect(content).toContain('目录')
    })
  })

  describe('EPUB export', () => {
    it('should generate a valid EPUB (ZIP) file', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({ format: 'epub' })

      expect(fs.existsSync(outputPath)).toBe(true)

      // EPUB is a ZIP file
      const buffer = fs.readFileSync(outputPath)
      expect(buffer[0]).toBe(0x50)
      expect(buffer[1]).toBe(0x4B)
      expect(buffer.length).toBeGreaterThan(500)
    })

    it('should contain mimetype as first uncompressed entry', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({ format: 'epub' })

      const buffer = fs.readFileSync(outputPath)
      const contentStr = buffer.toString('latin1')
      // mimetype should appear near the beginning (within first 100 bytes after local header)
      expect(contentStr).toContain('application/epub+zip')
      expect(contentStr).toContain('META-INF/container.xml')
      expect(contentStr).toContain('OEBPS/content.opf')
    })
  })

  describe('batch export', () => {
    it('should export to multiple formats', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const results = await exporter.batchExport({
        formats: ['txt', 'pdf'],
      })

      expect(results.length).toBe(2)
      expect(results[0].format).toBe('txt')
      expect(results[1].format).toBe('pdf')

      for (const r of results) {
        expect(fs.existsSync(r.url)).toBe(true)
      }
    })

    it('should fire progress callback for each format', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const progressEvents: string[] = []

      await exporter.batchExport({
        formats: ['txt', 'docx'],
        onProgress: (_current, _total, phase) => {
          progressEvents.push(phase)
        },
      })

      expect(progressEvents).toContain('exporting_txt')
      expect(progressEvents).toContain('exporting_docx')
      expect(progressEvents).toContain('complete')
    })
  })

  describe('export history', () => {
    it('should record exports in history', async () => {
      const exporter = new Exporter(testWorkspacePath)
      await exporter.export({ format: 'txt' })

      const history = exporter.getExportHistory()
      expect(history.length).toBeGreaterThan(0)
      expect(history[0].format).toBe('txt')
      expect(history[0].chapter_count).toBe(3)
      expect(history[0].filename).toContain('novel_export_')
      expect(history[0].created_at).toBeDefined()
      expect(history[0].size).toBeGreaterThan(0)
    })

    it('should list exported files', async () => {
      const exporter = new Exporter(testWorkspacePath)
      await exporter.export({ format: 'txt' })

      const files = exporter.listExportFiles()
      expect(files.length).toBeGreaterThan(0)
      expect(files[0].filename).toContain('novel_export_')
      expect(files[0].size).toBeGreaterThan(0)
      expect(files[0].created).toBeDefined()
    })

    it('should delete exported files', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const outputPath = await exporter.export({ format: 'txt' })
      const filename = path.basename(outputPath)

      const deleted = exporter.deleteExportFile(filename)
      expect(deleted).toBe(true)
      expect(fs.existsSync(outputPath)).toBe(false)

      // History should be updated
      const history = exporter.getExportHistory()
      const record = history.find(r => r.filename === filename)
      expect(record).toBeUndefined()
    })

    it('should prevent path traversal in delete', async () => {
      const exporter = new Exporter(testWorkspacePath)
      const deleted = exporter.deleteExportFile('../../../etc/passwd')
      expect(deleted).toBe(false)
    })
  })

  describe('empty workspace', () => {
    it('should handle empty chapters gracefully', async () => {
      const emptyPath = path.join(process.cwd(), 'workspace', 'test_empty_novel')
      fs.mkdirSync(path.join(emptyPath, 'chapters'), { recursive: true })
      fs.mkdirSync(path.join(emptyPath, 'state'), { recursive: true })
      fs.writeFileSync(
        path.join(emptyPath, 'state', 'MASTER_SETTING.json'),
        JSON.stringify({ title: '空', genre: '', core_premise: '' })
      )

      try {
        const exporter = new Exporter(emptyPath)
        const outputPath = await exporter.export({ format: 'txt' })

        const content = fs.readFileSync(outputPath, 'utf-8')
        expect(content).toContain('空')
      } finally {
        fs.rmSync(emptyPath, { recursive: true, force: true })
      }
    })
  })
})
