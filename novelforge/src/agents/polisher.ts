import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import type { StyleFingerprint } from '../types/index.js'

export interface PolisherOutput {
  polishedText: string
  changes: number
  aiTasteReduction: number
}

export class PolisherAgent {
  private router: ModelRouter
  private stateManager: StateManager

  constructor(router: ModelRouter, stateManager: StateManager) {
    this.router = router
    this.stateManager = stateManager
  }

  async polish(chapterText: string): Promise<PolisherOutput> {
    // Fetch style fingerprint for style-aware polishing
    let styleFingerprint: StyleFingerprint | null = null
    try {
      styleFingerprint = await this.stateManager.read('style_fingerprint')
    } catch {
      // No fingerprint — use defaults
    }

    let text = chapterText
    let totalChanges = 0

    const layer1Result = await this.layer1RegexScan(text)
    text = layer1Result.text
    totalChanges += layer1Result.changes

    const layer2Result = await this.layer2CorpusFingerprint(text)
    text = layer2Result.text
    totalChanges += layer2Result.changes

    const layer3Result = await this.layer3LLMRefine(text, styleFingerprint)
    text = layer3Result.text
    totalChanges += layer3Result.changes

    return {
      polishedText: text,
      changes: totalChanges,
      aiTasteReduction: this.estimateReduction(totalChanges),
    }
  }

  private async layer1RegexScan(text: string): Promise<{ text: string; changes: number }> {
    const forbiddenPatterns: Array<{ pattern: RegExp; replacements: string[] }> = [
      { pattern: /不仅如此/g, replacements: ['而且', '同时', '另外'] },
      { pattern: /然而(.{0,5})却/g, replacements: ['但$1', '可是$1', '不过$1'] },
      { pattern: /在(.{2,10})的过程中/g, replacements: ['$1时', '$1的时候'] },
      { pattern: /不禁(.{0,5})涌起/g, replacements: ['$1感到', '$1产生'] },
      { pattern: /难以言喻/g, replacements: ['说不清', '难以描述', '无法形容'] },
    ]

    let changes = 0
    let result = text

    for (const { pattern, replacements } of forbiddenPatterns) {
      // Count all matches first
      const matches = result.match(pattern)
      if (matches && matches.length > 0) {
        // Replace all occurrences with random alternatives
        const replacement = replacements[Math.floor(Math.random() * replacements.length)]
        result = result.replaceAll(pattern, replacement)
        changes += matches.length
      }
    }

    return { text: result, changes }
  }

  private async layer2CorpusFingerprint(text: string): Promise<{ text: string; changes: number }> {
    const patterns = [
      { regex: /他的眼中闪过一丝/g, alternatives: ['他眯起眼', '他目光一凝', '他愣了一下'] },
      { regex: /心中不由得/g, alternatives: ['心里一紧', '暗道不好', '心中暗喜'] },
      { regex: /一股(.{2,5})之意/g, alternatives: ['$1的感觉', '一阵$1'] },
      { regex: /不由得(.{2,6})起来/g, alternatives: ['$1了', '开始$1'] },
      { regex: /心中(.{2,4})不已/g, alternatives: ['心里$1', '$1万分'] },
      { regex: /目光之中(.{2,6})/g, alternatives: ['眼神里$1', '眼中$1'] },
      { regex: /身形(.{2,4})之间/g, alternatives: ['$1地', ''] },
      { regex: /嘴角(.{2,4})一丝/g, replacements: ['露出一丝$1', '$1地'] },
    ]

    let changes = 0
    let result = text

    for (const { regex, alternatives } of patterns) {
      const matches = result.match(regex)
      if (matches && matches.length > 0 && alternatives && alternatives.length > 0) {
        const alt = alternatives[Math.floor(Math.random() * alternatives.length)]
        result = result.replaceAll(regex, alt)
        changes += matches.length
      }
    }

    return { text: result, changes }
  }

  private async layer3LLMRefine(text: string, styleFingerprint: StyleFingerprint | null): Promise<{ text: string; changes: number }> {
    // Build style-aware instructions
    const styleGuidance = this.buildStyleGuidance(styleFingerprint)

    const systemPrompt = `你是一位专业的文字润色师。请修改以下文本，使其更自然、更像真人写作。

修改要求：
1. 减少AI味句式（"不仅如此""然而...却""在...的过程中""不禁涌起"等）
2. 使对话更自然，减少冗余的对话标签
3. 增强画面感，用具体描写替代抽象概括
4. 保持原意和剧情不变
${styleGuidance}
输出修改后的完整文本，不要添加任何解释。`

    const result = await this.router.generate('polisher', systemPrompt, text)
    
    const changed = result !== text
    return { text: result, changes: changed ? 1 : 0 }
  }

  /**
   * Build style-specific polishing guidance from the style fingerprint.
   */
  private buildStyleGuidance(fingerprint: StyleFingerprint | null): string {
    if (!fingerprint || !fingerprint.metadata?.confidence || fingerprint.metadata.confidence < 0.5) {
      return ''
    }

    const parts: string[] = ['\n作者风格参考（请尽量匹配）：']

    if (fingerprint.sentence_pattern) {
      const avgLen = fingerprint.sentence_pattern.avg_sentence_length
      parts.push(`- 平均句长约${Math.round(avgLen)}字，保持句长风格一致`)
      if (fingerprint.sentence_pattern.short_sentence_ratio > 0.6) {
        parts.push('- 偏好短句，避免冗长复合句')
      }
    }

    if (fingerprint.dialogue_style) {
      const tagPref = fingerprint.dialogue_style.tag_preference
      if (tagPref && tagPref !== 'none') {
        parts.push(`- 对话标签偏好使用"${tagPref}"`)
      }
      if (fingerprint.dialogue_style.action_with_dialogue) {
        parts.push('- 对话时常搭配动作描写')
      }
    }

    if (fingerprint.rhetoric?.sensory_preference?.length) {
      parts.push(`- 感官描写侧重：${fingerprint.rhetoric.sensory_preference.join('、')}`)
    }

    if (fingerprint.pacing) {
      if (fingerprint.pacing.description_to_action_ratio < 0.3) {
        parts.push('- 保持快节奏，以行动和对话为主')
      }
      if (fingerprint.pacing.inner_monologue_ratio > 0.15) {
        parts.push('- 适度保留内心独白')
      }
    }

    return parts.length > 1 ? parts.join('\n') : ''
  }

  private estimateReduction(changes: number): number {
    return Math.min(0.9, changes * 0.15)
  }
}
