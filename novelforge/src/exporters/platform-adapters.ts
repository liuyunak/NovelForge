/**
 * Platform-Specific Export Adapters
 * 
 * Transforms NovelForge exported content into formats compatible with:
 * - 起点中文网 (Qidian)
 * - 晋江文学城 (Jinjiang)
 * - 番茄小说 (Fanqie)
 */
import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../logger.js'

export type PlatformType = 'qidian' | 'jinjiang' | 'fanqie'

export interface PlatformExportOptions {
  platform: PlatformType
  outputDir: string
  includeMetadata?: boolean
  chapterRange?: { start: number; end: number }
}

interface ChapterData {
  number: number
  title: string
  content: string
}

interface NovelMetadata {
  title: string
  author: string
  genre: string
  corePremise: string
  synopsis?: string
  tags?: string[]
}

export interface PlatformExportResult {
  platform: PlatformType
  filename: string
  path: string
  chapterCount: number
  wordCount: number
  warnings: string[]
}

// ==================== Base Platform Adapter ====================

abstract class BasePlatformAdapter {
  protected chapters: ChapterData[]
  protected metadata: NovelMetadata
  protected options: PlatformExportOptions
  protected warnings: string[] = []

  constructor(chapters: ChapterData[], metadata: NovelMetadata, options: PlatformExportOptions) {
    this.chapters = chapters
    this.metadata = metadata
    this.options = options
  }

  protected warn(message: string): void {
    this.warnings.push(message)
    logger.warn(`[${this.options.platform}] ${message}`)
  }

  abstract getPlatformName(): string
  abstract getFileExtension(): string
  abstract formatContent(): string

  async export(): Promise<PlatformExportResult> {
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true })
    }

    const content = this.formatContent()
    const timestamp = Date.now()
    const filename = `${this.options.platform}_export_${timestamp}.${this.getFileExtension()}`
    const outputPath = path.join(this.options.outputDir, filename)

    // Validate before writing
    const validationIssues = this.validate(content)
    for (const issue of validationIssues) {
      this.warn(issue)
    }

    fs.writeFileSync(outputPath, content, 'utf-8')

    const wordCount = content.replace(/\s/g, '').length

    return {
      platform: this.options.platform,
      filename,
      path: outputPath,
      chapterCount: this.chapters.length,
      wordCount,
      warnings: this.warnings,
    }
  }

  protected validate(content: string): string[] {
    const issues: string[] = []

    // Min chapter count check
    if (this.chapters.length < 1) {
      issues.push('导出内容包含 0 章节')
    }

    // Max file size warning (10MB for most platforms)
    const sizeMB = Buffer.byteLength(content, 'utf-8') / (1024 * 1024)
    if (sizeMB > 10) {
      issues.push(`文件过大 (${sizeMB.toFixed(1)}MB)，可能超出平台限制`)
    }

    return issues
  }

  protected countChineseChars(text: string): number {
    return (text.match(/[\u4e00-\u9fff]/g) || []).length
  }
}

// ==================== 起点中文网 Adapter ====================

class QidianAdapter extends BasePlatformAdapter {
  getPlatformName(): string { return '起点中文网' }
  getFileExtension(): string { return 'txt' }

  formatContent(): string {
    const maxChapterLen = 10000 // 起点推荐章节长度上限（字符）
    const minChapterLen = 2000  // 起点推荐章节长度下限

    for (const ch of this.chapters) {
      const charCount = this.countChineseChars(ch.content)
      if (charCount < minChapterLen) {
        this.warn(`第${ch.number}章字数过少 (${charCount}字)，起点推荐≥2000字`)
      }
      if (charCount > maxChapterLen) {
        this.warn(`第${ch.number}章字数过多 (${charCount}字)，起点推荐≤10000字，建议拆分`)
      }
    }

    let output = ''

    // 起点格式：元数据在开头
    if (this.options.includeMetadata !== false) {
      output += `书名：${this.metadata.title}\n`
      output += `作者：${this.metadata.author || '未署名'}\n`
      if (this.metadata.genre) output += `分类：${this.metadata.genre}\n`
      if (this.metadata.synopsis) {
        output += `\n简介：\n${this.metadata.synopsis}\n`
      }
      if (this.metadata.tags && this.metadata.tags.length > 0) {
        output += `\n标签：${this.metadata.tags.join('、')}\n`
      }
      output += '\n' + '='.repeat(60) + '\n\n'
    }

    // 章节内容 - 起点格式：章节标题 + 正文
    for (const ch of this.chapters) {
      output += `第${ch.number}章 ${ch.title}\n\n`
      // 起点正文格式：每段空两格（全角空格）
      const paragraphs = ch.content.split(/\n\s*\n/)
      for (const para of paragraphs) {
        const trimmed = para.trim()
        if (!trimmed) continue
        const lines = trimmed.split('\n').filter(l => l.trim())
        for (const line of lines) {
          output += `　　${line.trim()}\n`
        }
      }
      output += '\n' + '-'.repeat(40) + '\n\n'
    }

    return output
  }

  protected validate(content: string): string[] {
    const issues = super.validate(content)

    // 起点特有：检查是否有足够的内容
    const totalChars = this.countChineseChars(content)
    if (totalChars < 30000) {
      issues.push('总字数不足 3 万字，起点签约通常需要 ≥3 万字正文')
    }

    return issues
  }
}

// ==================== 晋江文学城 Adapter ====================

class JinjiangAdapter extends BasePlatformAdapter {
  getPlatformName(): string { return '晋江文学城' }
  getFileExtension(): string { return 'txt' }

  formatContent(): string {
    const maxChapterLen = 15000 // 晋江推荐上限
    const minChapterLen = 3000  // 晋江推荐下限

    for (const ch of this.chapters) {
      const charCount = this.countChineseChars(ch.content)
      if (charCount < minChapterLen) {
        this.warn(`第${ch.number}章字数过少 (${charCount}字)，晋江推荐≥3000字`)
      }
      if (charCount > maxChapterLen) {
        this.warn(`第${ch.number}章字数过多 (${charCount}字)，晋江推荐≤15000字`)
      }
    }

    let output = ''

    // 晋江格式：文名、文案（简介）、内容标签在开头
    if (this.options.includeMetadata !== false) {
      output += `文名：${this.metadata.title}\n`
      output += `作者：${this.metadata.author || '未署名'}\n`
      if (this.metadata.synopsis) {
        output += `\n文案：\n${this.metadata.synopsis}\n`
      }
      if (this.metadata.genre) {
        output += `\n文章类型：${this.metadata.genre}\n`
      }
      if (this.metadata.tags && this.metadata.tags.length > 0) {
        output += `内容标签：${this.metadata.tags.join(' ')}\n`
      }
      output += '\n' + '★'.repeat(30) + '\n\n'
    }

    // 晋江章节格式：Chapter N + 正文
    for (const ch of this.chapters) {
      output += `Chapter ${ch.number}\n\n`
      const paragraphs = ch.content.split(/\n\s*\n/)
      for (const para of paragraphs) {
        const trimmed = para.trim()
        if (!trimmed) continue
        output += `${trimmed}\n\n`
      }
      output += '—'.repeat(30) + '\n\n'
    }

    return output
  }

  protected validate(content: string): string[] {
    const issues = super.validate(content)

    // 晋江特有：标签检查
    if (this.metadata.tags && this.metadata.tags.length > 5) {
      issues.push('标签过多 (>5)，晋江限制标签数量')
    }

    // 敏感词检查（粗略）
    const sensitivePatterns = [/政治/g, /暴力血腥/g, /色情/g]
    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        issues.push(`内容可能包含敏感词：${pattern.source}`)
      }
    }

    return issues
  }
}

// ==================== 番茄小说 Adapter ====================

class FanqieAdapter extends BasePlatformAdapter {
  getPlatformName(): string { return '番茄小说' }
  getFileExtension(): string { return 'txt' }

  formatContent(): string {
    const maxChapterLen = 8000   // 番茄推荐上限
    const minChapterLen = 1500   // 番茄推荐下限（略低于传统平台）

    for (const ch of this.chapters) {
      const charCount = this.countChineseChars(ch.content)
      if (charCount < minChapterLen) {
        this.warn(`第${ch.number}章字数过少 (${charCount}字)，番茄推荐≥1500字`)
      }
      if (charCount > maxChapterLen) {
        this.warn(`第${ch.number}章字数过多 (${charCount}字)，番茄推荐≤8000字`)
      }
    }

    let output = ''

    // 番茄格式（与起点类似但更简洁）
    if (this.options.includeMetadata !== false) {
      output += `《${this.metadata.title}》\n`
      output += `作者：${this.metadata.author || '未署名'}\n`
      if (this.metadata.synopsis) {
        output += `\n简介：${this.metadata.synopsis}\n`
      }
      if (this.metadata.tags && this.metadata.tags.length > 0) {
        output += `标签：${this.metadata.tags.join('、')}\n`
      }
      output += '\n' + '='.repeat(50) + '\n\n'
    }

    // 番茄章节格式
    for (const ch of this.chapters) {
      output += `第${ch.number}章 ${ch.title}\n\n`
      const paragraphs = ch.content.split(/\n\s*\n/)
      for (const para of paragraphs) {
        const trimmed = para.trim()
        if (!trimmed) continue
        // 番茄格式：直接输出段落，不强制首行缩进
        output += `${trimmed}\n\n`
      }
      output += '—'.repeat(30) + '\n\n'
    }

    return output
  }

  protected validate(content: string): string[] {
    const issues = super.validate(content)

    // 番茄特有：开头吸引力检查提示
    const firstChapter = this.chapters[0]
    if (firstChapter) {
      const firstChars = this.countChineseChars(firstChapter.content)
      if (firstChars < 1000) {
        issues.push('首章字数过少，番茄推荐首章 ≥1000 字以留住读者')
      }
    }

    // 章节标题吸引力检查提醒
    let untitledCount = 0
    for (const ch of this.chapters) {
      if (!ch.title || ch.title === '无标题' || ch.title.match(/^第\d+章$/)) {
        untitledCount++
      }
    }
    if (untitledCount > 0) {
      issues.push(`${untitledCount} 章缺少有吸引力的标题，建议为每章起一个吸引点击的标题`)
    }

    return issues
  }
}

// ==================== Factory ====================

/**
 * Create a platform adapter for the given platform type.
 */
function createAdapter(
  platform: PlatformType,
  chapters: ChapterData[],
  metadata: NovelMetadata,
  options: PlatformExportOptions
): BasePlatformAdapter {
  switch (platform) {
    case 'qidian':
      return new QidianAdapter(chapters, metadata, options)
    case 'jinjiang':
      return new JinjiangAdapter(chapters, metadata, options)
    case 'fanqie':
      return new FanqieAdapter(chapters, metadata, options)
  }
}

// ==================== Public API ====================

/**
 * Export novel chapters in a platform-specific format.
 */
export async function exportForPlatform(
  workspacePath: string,
  options: PlatformExportOptions
): Promise<PlatformExportResult> {
  const chapters = loadChapters(workspacePath, options.chapterRange)
  const metadata = loadMetadata(workspacePath)

  const adapter = createAdapter(options.platform, chapters, metadata, options)
  const result = await adapter.export()

  logger.info({
    platform: options.platform,
    filename: result.filename,
    chapterCount: result.chapterCount,
    wordCount: result.wordCount,
    warnings: result.warnings,
  }, `Platform export complete — ${adapter.getPlatformName()}`)

  return result
}

/**
 * Batch export to multiple platforms at once.
 */
export async function batchExportForPlatforms(
  workspacePath: string,
  platforms: PlatformType[],
  outputDir: string,
  chapterRange?: { start: number; end: number }
): Promise<PlatformExportResult[]> {
  const chapters = loadChapters(workspacePath, chapterRange)
  const metadata = loadMetadata(workspacePath)
  const results: PlatformExportResult[] = []

  for (const platform of platforms) {
    const adapter = createAdapter(platform, chapters, metadata, {
      platform,
      outputDir,
      chapterRange,
    })
    const result = await adapter.export()
    results.push(result)
  }

  return results
}

// ==================== Internal Helpers ====================

function loadChapters(workspacePath: string, range?: { start: number; end: number }): ChapterData[] {
  const chaptersDir = path.join(workspacePath, 'chapters')
  if (!fs.existsSync(chaptersDir)) return []

  const files = fs.readdirSync(chaptersDir)
    .filter(f => f.endsWith('.md'))
    .sort()

  const chapters: ChapterData[] = []

  for (const file of files) {
    const match = file.match(/chapter_(\d+)\.md/)
    if (!match) continue

    const chapterNum = parseInt(match[1])
    if (range && (chapterNum < range.start || chapterNum > range.end)) continue

    const rawContent = fs.readFileSync(path.join(chaptersDir, file), 'utf-8')
    const lines = rawContent.split('\n')
    let title = `第${chapterNum}章`
    let content = rawContent

    const firstLine = lines[0]?.trim()
    if (firstLine?.startsWith('#')) {
      title = firstLine.replace(/^#+\s*/, '')
      content = lines.slice(1).join('\n').trim()
    }

    chapters.push({ number: chapterNum, title, content })
  }

  return chapters
}

function loadMetadata(workspacePath: string): NovelMetadata {
  try {
    const settingPath = path.join(workspacePath, 'state', 'MASTER_SETTING.json')
    if (fs.existsSync(settingPath)) {
      const setting = JSON.parse(fs.readFileSync(settingPath, 'utf-8'))
      return {
        title: setting.title || '未命名小说',
        author: setting.author || 'NovelForge',
        genre: setting.genre || '',
        corePremise: setting.core_premise || '',
        synopsis: setting.synopsis || setting.description || '',
        tags: setting.tags || [],
      }
    }
  } catch {}
  return { title: '未命名小说', author: 'NovelForge', genre: '', corePremise: '' }
}
