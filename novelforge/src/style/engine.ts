import { StateManager } from '../state/manager.js'
import type { StyleFingerprint } from '../types/index.js'

export interface StyleDeviation {
  type: string
  expected: any
  actual: any
  severity: 'low' | 'medium' | 'high'
  suggestion: string
}

export class StyleEngine {
  private stateManager: StateManager

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }

  async analyze(text: string): Promise<Partial<StyleFingerprint>> {
    const sentences = text.split(/[。！？.!?]+/).filter(s => s.trim().length > 0)
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.replace(/\s/g, '').length, 0) / sentences.length
    const shortSentences = sentences.filter(s => s.replace(/\s/g, '').length <= 15).length
    const dialogueMatches = text.match(/["「『【].*?["」』】]/gs) || []
    const dialogueLength = dialogueMatches.reduce((sum, m) => sum + m.length, 0)

    // Extract vocabulary preferences from high-frequency words
    const { topVerbs, topNouns, fillerRate } = this.extractVocabulary(text)

    // Detect preferred rhetoric types
    const rhetoricTypes = this.detectRhetoricTypes(text)

    return {
      sentence_pattern: {
        avg_sentence_length: avgSentenceLength,
        short_sentence_ratio: shortSentences / sentences.length,
        complex_sentence_ratio: 1 - shortSentences / sentences.length,
      },
      vocabulary: {
        preferred_verbs: topVerbs,
        preferred_nouns: topNouns,
        filler_word_rate: fillerRate,
      },
      dialogue_style: {
        tag_preference: this.detectDialogueTagPreference(text),
        action_with_dialogue: text.includes('。"') || text.includes('！"'),
        avg_dialogue_length: dialogueMatches.length > 0 ? dialogueLength / dialogueMatches.length : 0,
      },
      rhetoric: {
        metaphor_density: this.calculateMetaphorDensity(text),
        preferred_rhetoric: rhetoricTypes,
        sensory_preference: this.detectSensoryPreference(text),
      },
      pacing: {
        description_to_action_ratio: this.calculateDescriptionActionRatio(text),
        inner_monologue_ratio: this.calculateInnerMonologueRatio(text),
      },
    }
  }

  async detectDeviations(text: string): Promise<StyleDeviation[]> {
    const deviations: StyleDeviation[] = []
    
    try {
      const fingerprint = await this.stateManager.read('style_fingerprint')
      const analysis = await this.analyze(text)
      
      if (fingerprint.sentence_pattern && analysis.sentence_pattern) {
        const lengthDiff = Math.abs(fingerprint.sentence_pattern.avg_sentence_length - analysis.sentence_pattern.avg_sentence_length)
        if (lengthDiff > 5) {
          deviations.push({
            type: 'sentence_length',
            expected: fingerprint.sentence_pattern.avg_sentence_length,
            actual: analysis.sentence_pattern.avg_sentence_length,
            severity: lengthDiff > 10 ? 'high' : 'medium',
            suggestion: `平均句长偏差${lengthDiff.toFixed(1)}字`,
          })
        }
      }
      
      if (fingerprint.dialogue_style && analysis.dialogue_style) {
        if (fingerprint.dialogue_style.tag_preference !== 'none' && 
            analysis.dialogue_style.tag_preference === 'none') {
          deviations.push({
            type: 'dialogue_tag',
            expected: fingerprint.dialogue_style.tag_preference,
            actual: analysis.dialogue_style.tag_preference,
            severity: 'low',
            suggestion: '对话标签风格不一致',
          })
        }
      }
    } catch {
      // No fingerprint yet
    }
    
    return deviations
  }

  async generateStylePrompt(): Promise<string> {
    try {
      const fingerprint = await this.stateManager.read('style_fingerprint')
      
      return `[风格指纹-作者偏好]
- 平均句长: ${fingerprint.sentence_pattern?.avg_sentence_length || 15} 字
- 短句占比: ${((fingerprint.sentence_pattern?.short_sentence_ratio || 0.5) * 100).toFixed(0)}%
- 对话标签: ${fingerprint.dialogue_style?.tag_preference || '无标签'}
- 对话与动作结合: ${fingerprint.dialogue_style?.action_with_dialogue ? '是' : '否'}
- 描写与行动比: ${fingerprint.pacing?.description_to_action_ratio || 0.3}
- 内心独白占比: ${((fingerprint.pacing?.inner_monologue_ratio || 0.1) * 100).toFixed(0)}%`
    } catch {
      return '[风格指纹] 使用默认风格'
    }
  }

  private detectDialogueTagPreference(text: string): '道' | '说' | 'none' {
    const daoCount = (text.match(/道/g) || []).length
    const shuoCount = (text.match(/说/g) || []).length
    
    if (daoCount > shuoCount * 2) return '道'
    if (shuoCount > daoCount * 2) return '说'
    return 'none'
  }

  private calculateMetaphorDensity(text: string): number {
    const metaphorPatterns = [/像.*一样/g, /如.*般/g, /仿佛/g, /宛如/g]
    let count = 0
    for (const pattern of metaphorPatterns) {
      count += (text.match(pattern) || []).length
    }
    const sentences = text.split(/[。！？]/).length
    return sentences === 0 ? 0 : count / sentences
  }

  private detectSensoryPreference(text: string): string[] {
    const senses: string[] = []
    if (/看|视|见|望|盯/g.test(text)) senses.push('视觉')
    if (/听|闻|声|音/g.test(text)) senses.push('听觉')
    if (/闻|嗅|香|臭/g.test(text)) senses.push('嗅觉')
    if (/触|摸|感|冷|热/g.test(text)) senses.push('触觉')
    if (/尝|味|甜|苦/g.test(text)) senses.push('味觉')
    return senses.length > 0 ? senses : ['视觉']
  }

  private calculateDescriptionActionRatio(text: string): number {
    const descriptionPatterns = [/的.*地/g, /着/g, /了.*地/g]
    const actionPatterns = [/把.*了/g, /将.*了/g, /向.*去/g]
    
    let descCount = 0
    let actionCount = 0
    
    for (const pattern of descriptionPatterns) {
      descCount += (text.match(pattern) || []).length
    }
    for (const pattern of actionPatterns) {
      actionCount += (text.match(pattern) || []).length
    }
    
    const total = descCount + actionCount
    return total === 0 ? 0.3 : descCount / total
  }

  private calculateInnerMonologueRatio(text: string): number {
    const innerPatterns = [/心想/g, /暗道/g, /心中/g, /心里/g, /想/g]
    let count = 0
    for (const pattern of innerPatterns) {
      count += (text.match(pattern) || []).length
    }
    const sentences = text.split(/[。！？]/).length
    return sentences === 0 ? 0.1 : Math.min(0.3, count / sentences)
  }

  /**
   * Extract top verbs, top nouns, and filler word rate from text.
   * Uses simple frequency analysis on 2-character words.
   */
  private extractVocabulary(text: string): { topVerbs: string[]; topNouns: string[]; fillerRate: number } {
    // Common verb endings in Chinese
    const verbPattern = /[\u4e00-\u9fff]{1,2}(了|过|着|到|完|住|掉|开|上|下|进|出|起|来|去|回)/g
    const verbMatches = text.match(verbPattern) || []
    const verbFreq = new Map<string, number>()
    for (const v of verbMatches) {
      verbFreq.set(v, (verbFreq.get(v) || 0) + 1)
    }
    const topVerbs = [...verbFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word)

    // Common noun patterns (的 + noun, or common noun suffixes)
    const nounPattern = /的([\u4e00-\u9fff]{1,3})/g
    const nounMatches = text.matchAll(nounPattern)
    const nounFreq = new Map<string, number>()
    for (const m of nounMatches) {
      const noun = m[1]
      if (!/了|过|着|的|地|得|是|在|不|就|都|也|还|要|会|能|可以/.test(noun)) {
        nounFreq.set(noun, (nounFreq.get(noun) || 0) + 1)
      }
    }
    const topNouns = [...nounFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word)

    // Filler word rate
    const fillerPattern = /然后|就是|那个|这个|的话|就是说|反正|其实|基本上/g
    const fillerCount = (text.match(fillerPattern) || []).length
    const totalChars = text.replace(/\s/g, '').length
    const fillerRate = totalChars > 0 ? fillerCount / (totalChars / 100) : 0.02

    return { topVerbs, topNouns, fillerRate }
  }

  /**
   * Detect preferred rhetoric types from text patterns.
   */
  private detectRhetoricTypes(text: string): string[] {
    const types: string[] = []
    if (/像.*一样|如.*般|仿佛|宛如|犹如/g.test(text)) types.push('比喻')
    if (/仿佛.*人|像人/g.test(text)) types.push('拟人')
    if (/排比|不是.*而是.*而是|有的.*有的.*有的/g.test(text)) types.push('排比')
    if (/难道|岂能|怎能|如何不/g.test(text)) types.push('反问')
    if (/夸张|无比|极致|无比|至极/g.test(text)) types.push('夸张')
    if (/对比|相反|然而|反之/g.test(text)) types.push('对比')
    return types.length > 0 ? types : ['比喻']
  }
}
