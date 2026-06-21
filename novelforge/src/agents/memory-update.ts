import { FullTextMemory } from '../memory/full-text-memory.js'
import { DreamEngine, type DreamResult } from '../memory/dream-engine.js'
import type { FullTextChapter } from '../types/index.js'

export interface MemoryUpdateOutput {
  addedToFullText: boolean
  dreamTriggered: boolean
  dreamResult?: DreamResult
}

export class MemoryUpdateAgent {
  private fullTextMemory: FullTextMemory
  private dreamEngine: DreamEngine

  constructor(fullTextMemory: FullTextMemory, dreamEngine: DreamEngine) {
    this.fullTextMemory = fullTextMemory
    this.dreamEngine = dreamEngine
  }

  async update(chapterNumber: number, chapterText: string, chapterTitle: string, summary: string): Promise<MemoryUpdateOutput> {
    const chapter: FullTextChapter = {
      chapter_number: chapterNumber,
      title: chapterTitle,
      full_text: chapterText,
      summary,
      compressed: false,
    }

    await this.fullTextMemory.addChapter(chapter)

    const shouldDream = await this.dreamEngine.shouldDream(chapterNumber)
    let dreamResult: DreamResult | undefined

    if (shouldDream) {
      dreamResult = await this.dreamEngine.executeDream(chapterNumber)
    }

    return {
      addedToFullText: true,
      dreamTriggered: shouldDream,
      dreamResult,
    }
  }
}
