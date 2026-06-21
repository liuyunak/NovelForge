import { StateManager } from '../state/manager.js'
import { FullTextMemory } from '../memory/full-text-memory.js'

export interface ContextPrepOutput {
  previousChapterSummary: string
  lastChaptersExcerpt: string
  characterDialogueSamples: Record<string, string[]>
}

export class ContextPrepAgent {
  private stateManager: StateManager
  private fullTextMemory: FullTextMemory

  constructor(stateManager: StateManager, fullTextMemory: FullTextMemory) {
    this.stateManager = stateManager
    this.fullTextMemory = fullTextMemory
  }

  async prepare(currentChapter: number): Promise<ContextPrepOutput> {
    const previousChapterSummary = await this.getPreviousChapterSummary(currentChapter)
    const lastChaptersExcerpt = await this.fullTextMemory.getRecentChaptersWithSummary(3)
    const characterDialogueSamples = await this.getCharacterDialogueSamples(currentChapter)

    return {
      previousChapterSummary,
      lastChaptersExcerpt,
      characterDialogueSamples,
    }
  }

  private async getPreviousChapterSummary(chapter: number): Promise<string> {
    try {
      const summaries = await this.stateManager.read('chapter_summaries')
      const prevSummary = summaries.summaries.find((s: any) => s.chapter_number === chapter - 1)
      return prevSummary?.summary || ''
    } catch {
      return ''
    }
  }

  private async getCharacterDialogueSamples(chapter: number): Promise<Record<string, string[]>> {
    try {
      const characters = await this.stateManager.read('characters')
      const samples: Record<string, string[]> = {}
      
      for (const char of characters.characters.slice(0, 5)) {
        samples[char.name] = char.speech?.catchphrases || []
      }
      
      return samples
    } catch {
      return {}
    }
  }
}
