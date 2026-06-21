import { StateManager } from '../state/manager.js'
import type { FastAuditResult, AuditCheck, AuditWarning } from '../types/index.js'

export class FastAuditAgent {
  private stateManager: StateManager

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }

  async audit(chapterText: string, chapterNumber: number): Promise<FastAuditResult> {
    const checks: AuditCheck[] = []
    const warnings: AuditWarning[] = []

    // 7 original checks
    checks.push(await this.checkCharacterNames(chapterText))
    checks.push(await this.checkAITaste(chapterText))
    checks.push(this.checkWordCount(chapterText, 3000))
    checks.push(this.checkDialogueRatio(chapterText))
    checks.push(this.checkParagraphLength(chapterText))
    checks.push(this.checkChapterEnding(chapterText))
    checks.push(this.checkRepetition(chapterText))
    
    // 5 new checks
    checks.push(await this.checkCharacterStateConsistency(chapterText, chapterNumber))
    checks.push(await this.checkItemOwnership(chapterText))
    checks.push(await this.checkLocationConsistency(chapterText))
    checks.push(await this.checkTimelineContinuity(chapterText, chapterNumber))
    checks.push(this.checkPovSwitches(chapterText))

    const passedChecks = checks.filter(c => c.passed).length
    const score = passedChecks / checks.length

    return {
      score,
      passed: score >= 0.7,
      checks,
      warnings,
    }
  }

  // ==================== Original 7 checks ====================

  private async checkCharacterNames(text: string): Promise<AuditCheck> {
    try {
      const characters = await this.stateManager.read('characters')
      const names = characters.characters.map((c: any) => c.name)

      if (names.length === 0) {
        return { id: 1, name: '角色名一致性', passed: true, score: 1.0 }
      }

      // Check that characters mentioned in the text exist in the character list
      // (inverse check: does the text reference unknown characters?)
      const issues: string[] = []
      let presentCount = 0
      
      for (const name of names) {
        const regex = new RegExp(name, 'g')
        const matches = text.match(regex)
        if (matches && matches.length > 0) {
          presentCount++
        }
      }

      // Not all characters need to appear in every chapter
      // Score based on how many named characters actually appear
      const presenceRatio = presentCount / names.length
      const passed = presenceRatio >= 0.1 || names.length <= 2

      return {
        id: 1,
        name: '角色名一致性',
        passed,
        score: passed ? 1.0 : Math.max(0.3, presenceRatio),
        details: [`${presentCount}/${names.length} 角色出现`],
      }
    } catch {
      return { id: 1, name: '角色名一致性', passed: true, score: 0.8 }
    }
  }

  private async checkAITaste(text: string): Promise<AuditCheck> {
    // Use non-greedy patterns to avoid cross-paragraph matching
    const forbiddenPatterns: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /不仅如此/g, label: '不仅如此' },
      { pattern: /然而.{0,5}却/g, label: '然而...却' },
      { pattern: /在.{2,10}的过程中/g, label: '在...的过程中' },
      { pattern: /不禁.{0,5}涌起/g, label: '不禁...涌起' },
      { pattern: /难以言喻/g, label: '难以言喻' },
    ]
    
    const hits: string[] = []
    for (const { pattern, label } of forbiddenPatterns) {
      if (pattern.test(text)) {
        // Reset lastIndex after test() for global regex
        pattern.lastIndex = 0
        hits.push(label)
      }
    }
    
    return {
      id: 8,
      name: 'AI味句式',
      passed: hits.length === 0,
      score: hits.length === 0 ? 1.0 : Math.max(0, 1 - hits.length * 0.2),
      details: hits.length > 0 ? [`命中: ${hits.join(', ')}`] : undefined,
    }
  }

  private checkWordCount(text: string, target: number): AuditCheck {
    const wordCount = text.replace(/\s/g, '').length
    const deviation = Math.abs(wordCount - target) / target
    const passed = deviation <= 0.15
    
    return {
      id: 6,
      name: '字数偏差',
      passed,
      score: passed ? 1.0 : Math.max(0, 1 - deviation),
      details: [`实际: ${wordCount}, 目标: ${target}`],
    }
  }

  private checkDialogueRatio(text: string): AuditCheck {
    if (!text || text.length === 0) {
      return {
        id: 7,
        name: '对话占比',
        passed: false,
        score: 0,
        details: ['文本为空，无法检查对话占比'],
      }
    }
    const dialogueMatches = text.match(/["「『【].*?["」』】]/gs) || []
    const dialogueLength = dialogueMatches.reduce((sum, m) => sum + m.length, 0)
    const ratio = dialogueLength / text.length
    
    const passed = ratio >= 0.2 && ratio <= 0.4
    
    return {
      id: 7,
      name: '对话占比',
      passed,
      score: passed ? 1.0 : 0.6,
      details: [`对话占比: ${(ratio * 100).toFixed(1)}%`],
    }
  }

  private checkParagraphLength(text: string): AuditCheck {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)
    const longParagraphs = paragraphs.filter(p => p.replace(/\s/g, '').length > 300)
    
    return {
      id: 9,
      name: '段落长度',
      passed: longParagraphs.length === 0,
      score: longParagraphs.length === 0 ? 1.0 : 0.7,
      details: longParagraphs.length > 0 ? [`${longParagraphs.length}个过长段落`] : undefined,
    }
  }

  private checkChapterEnding(text: string): AuditCheck {
    const last300chars = text.slice(-300)
    const hasCliffhanger = last300chars.includes('？') || 
                          last300chars.includes('...') ||
                          last300chars.includes('竟然') ||
                          last300chars.includes('突然')
    
    return {
      id: 10,
      name: '章末钩子',
      passed: hasCliffhanger,
      score: hasCliffhanger ? 1.0 : 0.6,
    }
  }

  private checkRepetition(text: string): AuditCheck {
    const words = text.split(/[\s,，。！？、；：""''《》【】（）]+/)
    const wordCount: Record<string, number> = {}
    
    for (const word of words) {
      if (word.length >= 2) {
        wordCount[word] = (wordCount[word] || 0) + 1
      }
    }
    
    const highFreqWords = Object.entries(wordCount).filter(([_, count]) => count > 5)
    
    return {
      id: 12,
      name: '重复词频',
      passed: highFreqWords.length === 0,
      score: highFreqWords.length === 0 ? 1.0 : 0.7,
      details: highFreqWords.map(([word, count]) => `${word}: ${count}次`),
    }
  }

  // ==================== New 5 checks ====================

  private async checkCharacterStateConsistency(text: string, chapterNumber: number): Promise<AuditCheck> {
    try {
      const workingMemory = await this.stateManager.read('working_memory')
      const characterStates = workingMemory.character_states || {}
      
      // Check if characters' locations/states from working memory are consistent
      const issues: string[] = []
      for (const [name, state] of Object.entries(characterStates)) {
        const typedState = state as { location?: string; status?: string; power?: string }
        if (typedState.location) {
          const locationRegex = new RegExp(name + '.*?' + typedState.location, 'g')
          // Only flag if the character appears but location isn't referenced
          const charAppears = new RegExp(name, 'g').test(text)
          if (charAppears && !locationRegex.test(text)) {
            issues.push(`${name} 出现在章节中但位置"${typedState.location}"未被确认`)
          }
        }
      }
      
      const passed = issues.length <= 2
      return {
        id: 2,
        name: '角色状态一致性',
        passed,
        score: passed ? 1.0 : Math.max(0.3, 1 - issues.length * 0.2),
        details: issues.length > 0 ? issues.slice(0, 3) : undefined,
      }
    } catch {
      return { id: 2, name: '角色状态一致性', passed: true, score: 0.8 }
    }
  }

  private async checkItemOwnership(text: string): Promise<AuditCheck> {
    try {
      const characters = await this.stateManager.read('characters')
      const items = characters.characters
        .filter((c: any) => c.items && c.items.length > 0)
        .flatMap((c: any) => c.items.map((item: string) => ({ name: c.name, item })))
      
      if (items.length === 0) {
        return { id: 3, name: '物品归属一致性', passed: true, score: 1.0 }
      }
      
      // Simple check: if an item is mentioned, is the owning character nearby?
      const issues: string[] = []
      for (const { name, item } of items) {
        const itemRegex = new RegExp(item, 'g')
        if (itemRegex.test(text)) {
          const charNearby = new RegExp(name, 'g').test(text)
          if (!charNearby) {
            issues.push(`物品"${item}"被提及但所属角色"${name}"不在本章`)
          }
        }
      }
      
      const passed = issues.length === 0
      return {
        id: 3,
        name: '物品归属一致性',
        passed,
        score: passed ? 1.0 : Math.max(0.5, 1 - issues.length * 0.25),
        details: issues.length > 0 ? issues.slice(0, 3) : undefined,
      }
    } catch {
      return { id: 3, name: '物品归属一致性', passed: true, score: 0.8 }
    }
  }

  private async checkLocationConsistency(text: string): Promise<AuditCheck> {
    try {
      const masterSetting = await this.stateManager.read('MASTER_SETTING')
      const worldRules = masterSetting.world_rules || []
      
      // Extract location names mentioned in the text
      const locationPattern = /([\u4e00-\u9fa5]{2,6}(?:城|镇|村|山|谷|林|殿|阁|楼|塔|府|院|宫|界|域|岛|海|湖|河|洞))/g
      const locations = [...new Set(text.match(locationPattern) || [])]
      
      if (locations.length <= 1) {
        return { id: 4, name: '地名一致性', passed: true, score: 1.0 }
      }
      
      // Check for location naming inconsistencies (e.g. same place with different names)
      const similarLocations = this.findSimilarNames(locations)
      
      const passed = similarLocations.length === 0
      return {
        id: 4,
        name: '地名一致性',
        passed,
        score: passed ? 1.0 : 0.7,
        details: similarLocations.length > 0 ? [`疑似地名不一致: ${similarLocations.join(', ')}`] : undefined,
      }
    } catch {
      return { id: 4, name: '地名一致性', passed: true, score: 0.8 }
    }
  }

  private async checkTimelineContinuity(text: string, chapterNumber: number): Promise<AuditCheck> {
    try {
      // Check for time-related markers to ensure timeline continuity
      const timeMarkers = text.match(/(?:昨天|今天|明天|三天前|数日后|片刻后|不久后|次日|翌日|当夜|当晚)/g) || []
      
      // If there are time references, that's good
      if (timeMarkers.length > 0) {
        return { id: 5, name: '时间线连续性', passed: true, score: 1.0 }
      }
      
      // Check for scene transitions without time context
      const sceneBreaks = (text.match(/\n\n+/g) || []).length
      if (sceneBreaks > 2) {
        return {
          id: 5,
          name: '时间线连续性',
          passed: false,
          score: 0.6,
          details: ['多个场景切换缺少时间标记'],
        }
      }
      
      return { id: 5, name: '时间线连续性', passed: true, score: 0.9 }
    } catch {
      return { id: 5, name: '时间线连续性', passed: true, score: 0.8 }
    }
  }

  private checkPovSwitches(text: string): AuditCheck {
    // Detect excessive POV switches (more than 3 per chapter is too many)
    const povMarkers = [
      /(\S{2,4})心想/g,
      /(\S{2,4})暗道/g,
      /(\S{2,4})暗忖/g,
      /(\S{2,4})觉得/g,
      /(\S{2,4})感到/g,
    ]
    
    const povCharacters = new Set<string>()
    for (const marker of povMarkers) {
      let match
      while ((match = marker.exec(text)) !== null) {
        povCharacters.add(match[1])
      }
    }
    
    const switchCount = povCharacters.size
    const passed = switchCount <= 3
    
    return {
      id: 11,
      name: '视角切换',
      passed,
      score: passed ? 1.0 : Math.max(0.3, 1 - (switchCount - 3) * 0.15),
      details: switchCount > 3 ? [`${switchCount}个不同视角角色`] : undefined,
    }
  }

  // ==================== Helpers ====================

  private findSimilarNames(names: string[]): string[] {
    const similar: string[] = []
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        // If two names share >50% characters, flag as potentially inconsistent
        const commonChars = [...names[i]].filter(c => names[j].includes(c)).length
        const similarity = commonChars / Math.max(names[i].length, names[j].length)
        if (similarity > 0.5 && names[i] !== names[j]) {
          similar.push(`${names[i]}/${names[j]}`)
        }
      }
    }
    return similar
  }
}
