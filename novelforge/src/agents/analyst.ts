import { z } from 'zod'
import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import { MemoryLifecycle } from '../memory/lifecycle.js'
import type { DeepAuditResult } from '../types/index.js'
import { logger } from '../logger.js'

const analystOutputSchema = z.object({
  extractedFacts: z.object({
    newCharacters: z.array(z.string()),
    characterUpdates: z.array(z.object({ name: z.string(), changes: z.record(z.any()) })),
    itemChanges: z.array(z.object({ item: z.string(), action: z.string(), owner: z.string() })),
    hooks: z.array(z.object({ content: z.string(), type: z.string(), chapter: z.number() })),
    events: z.array(z.string()),
  }),
  stateDelta: z.record(z.any()),
  chapterSummary: z.string(),
  memoryEntries: z.array(z.object({ content: z.string(), category: z.string(), importance: z.number() })),
})

export interface AnalystOutput {
  extractedFacts: {
    newCharacters: string[]
    characterUpdates: { name: string; changes: Record<string, any> }[]
    itemChanges: { item: string; action: string; owner: string }[]
    hooks: { content: string; type: string; chapter: number }[]
    events: string[]
  }
  stateDelta: Record<string, any>
  chapterSummary: string
  memoryEntries: { content: string; category: string; importance: number }[]
}

export class AnalystAgent {
  private router: ModelRouter
  private stateManager: StateManager
  private memoryLifecycle: MemoryLifecycle

  constructor(router: ModelRouter, stateManager: StateManager, memoryLifecycle: MemoryLifecycle) {
    this.router = router
    this.stateManager = stateManager
    this.memoryLifecycle = memoryLifecycle
  }

  async analyze(chapterText: string, chapterNumber: number, auditResult?: DeepAuditResult): Promise<AnalystOutput> {
    const systemPrompt = `你是一位专业的小说分析师。请分析以下章节内容，提取事实并更新状态。

输出JSON格式：
{
  "extractedFacts": {
    "newCharacters": ["新出现的角色"],
    "characterUpdates": [{"name": "角色名", "changes": {"字段": "新值"}}],
    "itemChanges": [{"item": "物品名", "action": "acquired/lost/used", "owner": "持有者"}],
    "hooks": [{"content": "钩子内容", "type": "setup/payoff", "chapter": 章节号}],
    "events": ["发生的重要事件"]
  },
  "chapterSummary": "200字以内的章节摘要",
  "memoryEntries": [{"content": "记忆内容", "category": "character/world/plot", "importance": 0.5}]
}`

    const userPrompt = `章节内容：
${chapterText}

${auditResult ? `审计结果：\n${JSON.stringify(auditResult, null, 2)}` : ''}

请分析并提取事实。`

    const result = await this.router.generate('analyst', systemPrompt, userPrompt)
    
    let output: AnalystOutput
    try {
      const parsed = JSON.parse(result)
      const validation = analystOutputSchema.safeParse(parsed)
      if (!validation.success) {
        logger.warn({ issues: validation.error.issues }, 'Analyst response validation failed')
        output = this.getDefaultOutput(chapterNumber)
      } else {
        output = validation.data
      }
    } catch (e) {
      logger.warn('Analyst response parse error: %s', e instanceof Error ? e.message : e)
      output = this.getDefaultOutput(chapterNumber)
    }

    await this.updateStates(chapterNumber, output)
    await this.saveMemories(chapterNumber, output.memoryEntries)

    return output
  }

  private async updateStates(chapter: number, output: AnalystOutput): Promise<void> {
    try {
      const workingMemory = await this.stateManager.read('working_memory')
      workingMemory.chapter_number = chapter
      workingMemory.summary = output.chapterSummary
      workingMemory.recent_events = output.extractedFacts.events.slice(0, 5)
      workingMemory.updated_at = new Date().toISOString()
      await this.stateManager.write('working_memory', workingMemory)
    } catch (error) {
      logger.error({ err: error }, 'Failed to update working memory')
    }
  }

  private async saveMemories(chapter: number, entries: { content: string; category: string; importance: number }[]): Promise<void> {
    for (const entry of entries) {
      await this.memoryLifecycle.onChapterWrite(chapter, [{
        id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: entry.content,
        category: entry.category as any,
        source_chapter: chapter,
        importance: entry.importance,
      }])
    }
  }

  private getDefaultOutput(chapter: number): AnalystOutput {
    return {
      extractedFacts: {
        newCharacters: [],
        characterUpdates: [],
        itemChanges: [],
        hooks: [],
        events: [],
      },
      stateDelta: {},
      chapterSummary: '',
      memoryEntries: [],
    }
  }
}
