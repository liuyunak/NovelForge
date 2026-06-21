import { jaccardCharSimilarity } from '../utils/similarity.js'

export interface OptimizationConfig {
  removeRepetition: boolean
  fixParagraphLength: boolean
  balanceDialogue: boolean
  enhanceCliffhanger: boolean
}

export class OutputOptimizer {
  private config: OptimizationConfig

  constructor(config?: Partial<OptimizationConfig>) {
    this.config = {
      removeRepetition: config?.removeRepetition ?? true,
      fixParagraphLength: config?.fixParagraphLength ?? true,
      balanceDialogue: config?.balanceDialogue ?? true,
      enhanceCliffhanger: config?.enhanceCliffhanger ?? true,
    }
  }

  optimize(text: string): { optimized: string; changes: number } {
    let result = text
    let changes = 0

    if (this.config.removeRepetition) {
      const repResult = this.removeRepetition(result)
      result = repResult.text
      changes += repResult.changes
    }

    if (this.config.fixParagraphLength) {
      const paraResult = this.fixParagraphLength(result)
      result = paraResult.text
      changes += paraResult.changes
    }

    if (this.config.balanceDialogue) {
      const dialResult = this.balanceDialogue(result)
      result = dialResult.text
      changes += dialResult.changes
    }

    if (this.config.enhanceCliffhanger) {
      const cliffResult = this.enhanceCliffhanger(result)
      result = cliffResult.text
      changes += cliffResult.changes
    }

    return { optimized: result, changes }
  }

  /**
   * Enhance chapter-ending cliffhangers by appending a stronger hook
   * when the existing ending is weak. Uses the last paragraph as the cliffhanger
   * anchor and wraps it with emphasis if suitable.
   */
  private enhanceCliffhanger(text: string): { text: string; changes: number } {
    const paragraphs = text.split(/\n\n+/)
    if (paragraphs.length < 2) return { text, changes: 0 }

    const lastParagraph = paragraphs[paragraphs.length - 1].trim()
    if (!lastParagraph) return { text, changes: 0 }

    // Check if the ending already has a strong cliffhanger sign
    const strongEndingPatterns = [
      /[？！\?\!]$/,           // Ends with ? or !
      /猛然|突然|忽然|竟然|却发现|谁知/, // Plot twist signals
      /未完待续|欲知后事|下一章/,      // Explicit cliffhanger markers
      /……$/,                   // Trailing ellipsis
    ]

    const alreadyStrong = strongEndingPatterns.some(p => p.test(lastParagraph))
    if (alreadyStrong) return { text, changes: 0 }

    // Weak ending detected — enhance it
    // Add an ellipsis-based suggestion that the story continues
    // without altering the author's original text content
    const enhanced = text + '\n\n……'
    return { text: enhanced, changes: 1 }
  }

  private removeRepetition(text: string): { text: string; changes: number } {
    const sentences = text.split(/([。！？.!?]+)/)
    const result: string[] = []
    let changes = 0

    for (let i = 0; i < sentences.length; i++) {
      if (i >= 2) {
        const prev = sentences[i - 2]
        const curr = sentences[i]
        if (prev && curr && jaccardCharSimilarity(prev, curr) > 0.8) {
          changes++
          continue
        }
      }
      result.push(sentences[i])
    }

    return { text: result.join(''), changes }
  }

  private fixParagraphLength(text: string): { text: string; changes: number } {
    const paragraphs = text.split(/\n\n+/)
    let changes = 0
    const result: string[] = []

    for (const para of paragraphs) {
      const wordCount = para.replace(/\s/g, '').length
      if (wordCount > 300) {
        const sentences = para.split(/([。！？])/)
        const mid = Math.floor(sentences.length / 2)
        const firstHalf = sentences.slice(0, mid).join('')
        const secondHalf = sentences.slice(mid).join('')
        result.push(firstHalf, secondHalf)
        changes++
      } else {
        result.push(para)
      }
    }

    return { text: result.join('\n\n'), changes }
  }

  /**
   * Balance dialogue ratio in the text.
   *
   * Strategy:
   * 1. Count dialogue lines (lines containing 说/道/问/喊/叫/答 + quotes, or lines with 「」/""/'' patterns)
   * 2. Count narrative lines (non-dialogue content)
   * 3. If dialogue ratio < 15%, the text is too narrative-heavy → insert annotation markers
   * 4. If dialogue ratio > 55%, the text is too dialogue-heavy → insert annotation markers
   * 5. Annotations suggest where to add/trim dialogue but do NOT auto-generate dialogue
   *    (auto-generated dialogue would likely mismatch characters)
   */
  private balanceDialogue(text: string): { text: string; changes: number } {
    const lines = text.split('\n')
    let dialogueLines = 0
    let narrativeLines = 0
    const lineTypes: ('dialogue' | 'narrative' | 'empty')[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        lineTypes.push('empty')
        continue
      }

      // Detect dialogue lines: contain speech verbs with quotes, or dialogue markers
      const hasSpeechVerb = /[说道问喊叫答讲骂嚷呼喝唤].*[""''「」]/.test(trimmed)
      const hasQuoteMarkers = /[""''「」]/.test(trimmed) && trimmed.length < 100
      const isPureDialogue = /^[""''「」]/.test(trimmed) || /^[^，。！？]*[说道问喊叫答]/.test(trimmed)

      if (hasSpeechVerb || hasQuoteMarkers || isPureDialogue) {
        lineTypes.push('dialogue')
        dialogueLines++
      } else {
        lineTypes.push('narrative')
        narrativeLines++
      }
    }

    const totalLines = dialogueLines + narrativeLines
    if (totalLines === 0) return { text, changes: 0 }

    const dialogueRatio = dialogueLines / totalLines

    // Ideal dialogue ratio: 20%-45%
    if (dialogueRatio >= 0.15 && dialogueRatio <= 0.55) {
      return { text, changes: 0 } // Already balanced
    }

    // Too little dialogue: add suggestion markers at natural break points
    if (dialogueRatio < 0.15 && narrativeLines > 5) {
      const result = this.insertDialogueSuggestions(lines, lineTypes)
      return { text: result, changes: 1 }
    }

    // Too much dialogue: add suggestion to trim some dialogue
    if (dialogueRatio > 0.55 && dialogueLines > 5) {
      const result = this.insertTrimSuggestions(lines, lineTypes)
      return { text: result, changes: 1 }
    }

    return { text, changes: 0 }
  }

  /**
   * Insert suggestions for adding dialogue at natural narrative break points.
   * Uses HTML-style comments that can be stripped in production.
   */
  private insertDialogueSuggestions(lines: string[], lineTypes: ('dialogue' | 'narrative' | 'empty')[]): string {
    const result: string[] = []
    let narrativeStreak = 0
    let suggestionsInserted = 0
    const maxSuggestions = 2

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i])

      if (lineTypes[i] === 'narrative') {
        narrativeStreak++
      } else {
        narrativeStreak = 0
      }

      // After 4+ consecutive narrative lines, suggest adding dialogue
      if (narrativeStreak >= 4 && suggestionsInserted < maxSuggestions && i < lines.length - 1) {
        // Check if next line is also narrative (good place to insert dialogue)
        if (lineTypes[i + 1] === 'narrative' || lineTypes[i + 1] === 'empty') {
          result.push('[建议：此处可插入角色对话，增强互动感]')
          suggestionsInserted++
          narrativeStreak = 0
        }
      }
    }

    return result.join('\n')
  }

  /**
   * Insert suggestions for trimming excessive dialogue.
   */
  private insertTrimSuggestions(lines: string[], lineTypes: ('dialogue' | 'narrative' | 'empty')[]): string {
    const result: string[] = []
    let dialogueStreak = 0
    let suggestionsInserted = 0
    const maxSuggestions = 2

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i])

      if (lineTypes[i] === 'dialogue') {
        dialogueStreak++
      } else {
        dialogueStreak = 0
      }

      // After 5+ consecutive dialogue lines, suggest trimming
      if (dialogueStreak >= 5 && suggestionsInserted < maxSuggestions) {
        result.push('[建议：连续对话较长，可适当穿插动作/心理描写]')
        suggestionsInserted++
        dialogueStreak = 0
      }
    }

    return result.join('\n')
  }
}
