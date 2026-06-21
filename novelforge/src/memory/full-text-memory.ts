import * as fs from 'fs'
import * as path from 'path'
import { ModelRouter } from '../router.js'
import { logger } from '../logger.js'
import type { FullTextChapter } from '../types/index.js'

/**
 * Simple token estimator using character heuristic.
 * For Chinese + English mixed text, ~4 chars ≈ 1 token for most LLMs (GPT/DeepSeek).
 * Provides a rough upper-bound estimate for context window safety.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export class FullTextMemory {
  private chapters: FullTextChapter[] = []
  private maxChapters: number = 20
  private maxTokens: number = 150000
  private workspacePath: string
  private router: ModelRouter
  private cachePath: string

  constructor(workspacePath: string, router: ModelRouter) {
    this.workspacePath = workspacePath
    this.router = router
    this.cachePath = path.join(workspacePath, 'full-text-cache', 'chapters')
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath, { recursive: true })
    }
    await this.loadFromDisk()
  }

  async addChapter(chapter: FullTextChapter): Promise<void> {
    this.chapters.push(chapter)
    
    if (this.chapters.length > this.maxChapters) {
      this.chapters.shift()
    }
    
    await this.saveToDisk(chapter)
  }

  async getRecentChapters(n: number): Promise<string> {
    const recent = this.chapters.slice(-n)
    const joined = recent.map(ch => ch.full_text).join('\n\n')
    return this.trimToTokenLimit(joined)
  }

  async getRecentChaptersWithSummary(n: number): Promise<string> {
    const recent = this.chapters.slice(-n)
    const joined = recent.map(ch => {
      if (ch.compressed) {
        return `[Chapter ${ch.chapter_number}: ${ch.title}]\n${ch.summary}`
      }
      return `[Chapter ${ch.chapter_number}: ${ch.title}]\n${ch.full_text}`
    }).join('\n\n')
    return this.trimToTokenLimit(joined)
  }

  /**
   * Get estimated token count of the entire in-memory context.
   */
  getEstimatedTokenCount(): number {
    const fullText = this.chapters.map(ch => ch.full_text).join('\n\n')
    return estimateTokens(fullText)
  }

  /**
   * Trim text to fit within maxTokens by truncating from the beginning.
   * Preserves the most recent content (end of text).
   */
  private trimToTokenLimit(text: string): string {
    const estimatedTokens = estimateTokens(text)
    if (estimatedTokens <= this.maxTokens) {
      return text
    }

    // Truncate from the beginning — keep the most recent content
    // Use a safety margin of 90% of maxTokens
    const targetChars = Math.floor(this.maxTokens * 4 * 0.9)
    const trimmed = text.slice(-targetChars)

    // Try to start at a paragraph boundary
    const firstNewline = trimmed.indexOf('\n\n')
    if (firstNewline > 0 && firstNewline < 500) {
      logger.warn(`[FullTextMemory] Context trimmed: ${estimatedTokens} → ~${estimateTokens(trimmed)} tokens`)
      return trimmed.slice(firstNewline + 2)
    }

    logger.warn(`[FullTextMemory] Context trimmed: ${estimatedTokens} → ~${estimateTokens(trimmed)} tokens`)
    return trimmed
  }

  async triggerDream(): Promise<string> {
    const last10Chapters = this.chapters.slice(-10)
    
    if (last10Chapters.length === 0) {
      return ''
    }

    const chaptersText = last10Chapters.map(ch => 
      `Chapter ${ch.chapter_number}: ${ch.title}\n${ch.summary}`
    ).join('\n\n')

    const systemPrompt = `你是一位专业的故事整合师。请将以下章节摘要整合为一份简洁的故事简报。
要求：
1. 总结主要事件（不超过10条）
2. 列出角色变化
3. 追踪伏笔状态
4. 识别待解决问题
5. 控制在2000字以内`

    const summary = await this.router.generate(
      'planner',
      systemPrompt,
      chaptersText
    )

    const lastChapter = last10Chapters[last10Chapters.length - 1]
    if (lastChapter) {
      lastChapter.dream_summary = summary
      await this.saveToDisk(lastChapter)
    }

    this.compressOldChapters()
    
    return summary
  }

  private compressOldChapters(): void {
    for (let i = 0; i < this.chapters.length - 5; i++) {
      if (!this.chapters[i].compressed) {
        this.chapters[i].compressed = true
        this.chapters[i].full_text = this.chapters[i].summary
      }
    }
  }

  private async saveToDisk(chapter: FullTextChapter): Promise<void> {
    const filePath = path.join(this.cachePath, `chapter_${chapter.chapter_number}.json`)
    fs.writeFileSync(filePath, JSON.stringify(chapter, null, 2))
  }

  private async loadFromDisk(): Promise<void> {
    if (!fs.existsSync(this.cachePath)) {
      return
    }

    const files = fs.readdirSync(this.cachePath)
    this.chapters = []

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(this.cachePath, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      try {
        this.chapters.push(JSON.parse(content))
      } catch {
        logger.warn(`[FullTextMemory] Skipping corrupted chapter cache: ${file}`)
      }
      }
    }

    this.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
  }

  getChapterCount(): number {
    return this.chapters.length
  }

  getLastChapterNumber(): number {
    if (this.chapters.length === 0) return 0
    return this.chapters[this.chapters.length - 1].chapter_number
  }
}
