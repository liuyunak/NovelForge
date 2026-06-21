/**
 * Knowledge Context Builder
 *
 * Aggregates writing rules, genre templates, plot structures, and character patterns
 * into a structured prompt context for WriterAgent and other agents.
 *
 * This is the integration layer that bridges the previously "dead code" knowledge
 * modules into the actual LLM prompt construction pipeline.
 *
 * Supports two rule backends:
 * - WriterRulesManager (static builtin rules, default)
 * - RuleEngine (dynamic rules with feedback learning, preferred when available)
 */
import { WriterRulesManager } from './writer-rules.js'
import type { RuleEngine } from '../style/rule-engine.js'
import { TemplateManager } from './template-manager.js'
import { PlotStructureManager } from './plot-structures.js'
import { CharacterPatternManager } from './character-patterns.js'
import { StateManager } from '../state/manager.js'
import type { WritingRule } from '../types/index.js'

export interface KnowledgeContext {
  /** Active writing rules for the current genre */
  rules: WritingRule[]
  /** Genre template (world_rules, writing_tips, satisfaction_points) */
  template?: {
    name: string
    worldRules: string[]
    writingTips: string[]
    satisfactionPoints: string[]
    realmHierarchy?: { name: string; level: number; description: string }[]
  }
  /** Current plot phase based on chapter progress */
  plotPhase?: {
    name: string
    keyElements: string[]
    writingTip: string
  }
  /** Character pattern guidance for major characters */
  characterGuidance: {
    name: string
    pattern: string
    instructions: string
  }[]
}

export class KnowledgeContextBuilder {
  private rulesManager: WriterRulesManager
  private ruleEngine?: RuleEngine
  private templateManager: TemplateManager
  private plotManager: PlotStructureManager
  private charPatternManager: CharacterPatternManager
  private stateManager: StateManager

  constructor(
    stateManager: StateManager,
    templatesPath?: string,
    ruleEngine?: RuleEngine
  ) {
    this.stateManager = stateManager
    this.rulesManager = new WriterRulesManager()
    this.ruleEngine = ruleEngine
    this.templateManager = new TemplateManager(templatesPath || './templates')
    this.plotManager = new PlotStructureManager()
    this.charPatternManager = new CharacterPatternManager()
  }

  /**
   * Set or update the RuleEngine instance for feedback-aware rule retrieval.
   * Call this after construction if the RuleEngine wasn't available at init time.
   */
  setRuleEngine(ruleEngine: RuleEngine): void {
    this.ruleEngine = ruleEngine
  }

  /**
   * Build the full knowledge context for a given chapter.
   * Reads genre, total chapters, and characters from state.
   */
  async buildKnowledgeContext(chapterNumber: number): Promise<KnowledgeContext> {
    // Read master setting to get genre
    let genre = '玄幻' // default
    try {
      const masterSetting = await this.stateManager.read('MASTER_SETTING')
      genre = masterSetting.genre || '玄幻'
    } catch {
      // Use default genre
    }

    // Get active writing rules — prefer RuleEngine (feedback-aware) over WriterRulesManager
    const rules = this.ruleEngine
      ? this.ruleEngine.getActiveRules(genre)
      : this.rulesManager.getActiveRules(genre)

    // Get genre template
    const templateData = this.templateManager.getTemplate(genre)
    let template: KnowledgeContext['template'] | undefined
    if (templateData) {
      template = {
        name: templateData.name,
        worldRules: templateData.world_rules || [],
        writingTips: templateData.writing_tips || [],
        satisfactionPoints: templateData.satisfaction_points || [],
        realmHierarchy: templateData.realm_hierarchy,
      }
    }

    // Determine plot phase based on chapter progress
    const plotPhase = this.getPlotPhase(genre, chapterNumber)

    // Get character pattern guidance
    const characterGuidance = await this.getCharacterGuidance()

    return {
      rules,
      template,
      plotPhase,
      characterGuidance,
    }
  }

  /**
   * Determine which plot phase the current chapter belongs to.
   */
  private getPlotPhase(genre: string, chapterNumber: number): KnowledgeContext['plotPhase'] {
    const structure = this.plotManager.getStructure(genre) || this.plotManager.getStructure('三幕结构')

    if (!structure) return undefined

    // Estimate total chapters (default 300, or read from state)
    const totalChapters = 300
    const progress = chapterNumber / totalChapters

    // Find the matching phase
    let accumulated = 0
    for (const phase of structure.phases) {
      const proportion = parseFloat(phase.proportion.replace('%', '')) / 100
      accumulated += proportion

      if (progress <= accumulated || phase === structure.phases[structure.phases.length - 1]) {
        return {
          name: phase.name,
          keyElements: phase.key_elements,
          writingTip: phase.writing_tips,
        }
      }
    }

    return undefined
  }

  /**
   * Get character pattern guidance from state.
   * Maps schema role enum values to Chinese labels for pattern inference.
   */
  private async getCharacterGuidance(): Promise<KnowledgeContext['characterGuidance']> {
    const guidance: KnowledgeContext['characterGuidance'] = []

    try {
      const characters = await this.stateManager.read('characters')
      const charList = (characters as any).characters || []

      // Map schema role enum to Chinese label
      const roleMap: Record<string, string> = {
        'protagonist': '主角',
        'antagonist': '反派',
        'supporting': '配角',
        'minor': '配角',
      }

      for (const char of charList.slice(0, 5)) {
        const chineseRole = roleMap[char.role] || char.role
        const pattern = this.charPatternManager.inferPattern({
          name: char.name,
          role: chineseRole,
          power: char.power?.level || char.power,
        })
        if (pattern) {
          guidance.push({
            name: char.name,
            pattern: pattern.type,
            instructions: pattern.writing_instructions,
          })
        }
      }
    } catch {
      // No characters defined yet
    }

    return guidance
  }

  /**
   * Generate the prompt string for injecting knowledge into Writer system prompt.
   */
  generateKnowledgePrompt(context: KnowledgeContext): string {
    const parts: string[] = []

    // Writing rules
    if (context.rules.length > 0) {
      parts.push('【写作规则】')
      for (const rule of context.rules) {
        const weightLabel = rule.weight >= 0.8 ? '（重要）' : rule.weight >= 0.5 ? '' : '（参考）'
        parts.push(`- [${rule.category}] ${rule.rule} ${weightLabel}`)
      }
    }

    // Genre template writing tips
    if (context.template) {
      if (context.template.writingTips.length > 0) {
        parts.push('\n【题材写作要点】')
        for (const tip of context.template.writingTips) {
          parts.push(`- ${tip}`)
        }
      }
      if (context.template.worldRules.length > 0) {
        parts.push('\n【世界观规则】')
        for (const rule of context.template.worldRules) {
          parts.push(`- ${rule}`)
        }
      }
      if (context.template.realmHierarchy && context.template.realmHierarchy.length > 0) {
        parts.push('\n【境界体系】')
        for (const realm of context.template.realmHierarchy) {
          parts.push(`- ${realm.name} (Lv.${realm.level}): ${realm.description}`)
        }
      }
      if (context.template.satisfactionPoints.length > 0) {
        parts.push('\n【爽点类型参考】')
        for (const sp of context.template.satisfactionPoints) {
          parts.push(`- ${sp}`)
        }
      }
    }

    // Plot phase guidance
    if (context.plotPhase) {
      parts.push(`\n【当前情节阶段：${context.plotPhase.name}】`)
      parts.push(`写作要点：${context.plotPhase.writingTip}`)
      parts.push(`核心元素：${context.plotPhase.keyElements.join('、')}`)
    }

    // Character pattern guidance
    if (context.characterGuidance.length > 0) {
      parts.push('\n【角色写作指导】')
      for (const cg of context.characterGuidance) {
        parts.push(`- ${cg.name}（${cg.pattern}）：${cg.instructions}`)
      }
    }

    return parts.join('\n')
  }
}
