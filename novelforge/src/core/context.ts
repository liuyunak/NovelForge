import { FullTextMemory } from '../memory/full-text-memory.js'
import { StateManager } from '../state/manager.js'
import { logger } from '../logger.js'
import type { StyleFingerprint } from '../types/index.js'

/**
 * Simple token estimator using character heuristic (≈4 chars per token).
 * Safe upper bound for Chinese + English mixed text across most LLM backends.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Warning threshold: log a warning when assembled context exceeds this many tokens */
const CONTEXT_TOKEN_WARNING = 100000

export interface WriterContext {
  fullText: string
  sceneCard: any
  authorIntent: any
  styleReferences: any[]
  workingMemory: any
}

export interface DeepAuditContext {
  fullText: string
  chapterText: string
  masterSetting: any
  characters: any
  plotThreads: any
}

export interface PolisherContext {
  chapterText: string
  styleFingerprint: StyleFingerprint
  aiFingerprintBlacklist: any
}

export class ContextAssembler {
  private fullTextMemory: FullTextMemory
  private stateManager: StateManager

  constructor(fullTextMemory: FullTextMemory, stateManager: StateManager) {
    this.fullTextMemory = fullTextMemory
    this.stateManager = stateManager
  }

  async assembleWriterContext(chapterPlan: any): Promise<WriterContext> {
    const fullText = await this.fullTextMemory.getRecentChapters(20)
    const workingMemory = await this.stateManager.read('working_memory')

    // Load style fingerprint and active writing rules for Writer prompt
    let styleReferences: any[] = []
    try {
      const styleFingerprint = await this.stateManager.read('style_fingerprint')
      const confidence = styleFingerprint?.metadata?.confidence
      if (confidence != null && confidence > 0.3) {
        styleReferences = [{
          type: 'style_fingerprint',
          sentencePattern: styleFingerprint.sentence_pattern,
          dialogueStyle: styleFingerprint.dialogue_style,
          pacing: styleFingerprint.pacing,
          rhetoric: styleFingerprint.rhetoric,
          confidence,
        }]
      }
    } catch {
      // No style fingerprint yet — use empty references
    }

    // Load author intent if available
    let authorIntent: any = null
    try {
      authorIntent = await this.stateManager.read('author_intent' as any)
    } catch {
      // No author intent yet
    }
    
    const context = {
      fullText,
      sceneCard: chapterPlan.scenes,
      authorIntent,
      styleReferences,
      workingMemory,
    }

    // Token budget warning
    const promptTokens = estimateTokens(fullText)
    if (promptTokens > CONTEXT_TOKEN_WARNING) {
      logger.warn(
        `[ContextAssembler] Writer context large — ~${promptTokens} tokens in fullText (threshold: ${CONTEXT_TOKEN_WARNING})`
      )
    }

    return context
  }

  async assembleDeepAuditContext(chapterText: string): Promise<DeepAuditContext> {
    const fullText = await this.fullTextMemory.getRecentChapters(20)
    const masterSetting = await this.stateManager.read('MASTER_SETTING')
    const characters = await this.stateManager.read('characters')
    const plotThreads = await this.stateManager.read('plot_threads')
    
    // Token budget warning
    const totalTokens = estimateTokens(fullText) + estimateTokens(chapterText)
    if (totalTokens > CONTEXT_TOKEN_WARNING) {
      logger.warn(
        `[ContextAssembler] DeepAudit context large — ~${totalTokens} tokens (threshold: ${CONTEXT_TOKEN_WARNING})`
      )
    }

    return {
      fullText,
      chapterText,
      masterSetting,
      characters,
      plotThreads,
    }
  }

  async assemblePolisherContext(chapterText: string): Promise<PolisherContext> {
    let styleFingerprint: StyleFingerprint
    try {
      styleFingerprint = await this.stateManager.read('style_fingerprint')
    } catch {
      styleFingerprint = this.getDefaultStyleFingerprint()
    }
    
    const aiFingerprintBlacklist = await this.stateManager.read('ai_fingerprint_blacklist')
    
    return {
      chapterText,
      styleFingerprint,
      aiFingerprintBlacklist,
    }
  }

  private getDefaultStyleFingerprint(): StyleFingerprint {
    return {
      sentence_pattern: { avg_sentence_length: 15, short_sentence_ratio: 0.5, complex_sentence_ratio: 0.3 },
      vocabulary: { preferred_verbs: [], preferred_nouns: [], filler_word_rate: 0.02 },
      dialogue_style: { tag_preference: 'none', action_with_dialogue: true, avg_dialogue_length: 15 },
      rhetoric: { metaphor_density: 0.1, preferred_rhetoric: [], sensory_preference: [] },
      pacing: { description_to_action_ratio: 0.3, inner_monologue_ratio: 0.1 },
      metadata: { source_chapters: 0, extraction_date: new Date().toISOString(), confidence: 0 },
    }
  }
}
