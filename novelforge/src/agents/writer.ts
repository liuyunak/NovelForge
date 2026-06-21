import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import type { ChapterPlan, SceneCard } from './planner.js'
import type { WriterContext } from '../core/context.js'
import type { ContextPrepOutput } from './context-prep.js'
import { StyleEngine, type StyleDeviation } from '../style/engine.js'
import { RhythmSystem, type RhythmAnalysis } from '../style/rhythm.js'
import { RuleEngine } from '../style/rule-engine.js'
import { KnowledgeContextBuilder } from '../knowledge/knowledge-context.js'
import { logger } from '../logger.js'

export interface WriteOptions {
  mode?: string
  intensity?: number
  length?: number
}

export interface WriterOutput {
  chapterText: string
  wordCount: number
  scenes: { sceneNumber: number; text: string; wordCount: number }[]
}

/**
 * Rough token estimation for Chinese text.
 * Chinese chars ~0.5 tokens/char, English words ~0.75 tokens/word.
 * We use a conservative 1 token per character estimate for safety.
 */
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length
  const otherChars = text.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '').length
  return Math.ceil(chineseChars * 0.5 + otherChars * 0.25)
}

export class WriterAgent {
  private router: ModelRouter
  private stateManager: StateManager
  private styleEngine: StyleEngine
  private rhythmSystem: RhythmSystem
  private ruleEngine: RuleEngine
  private knowledgeBuilder: KnowledgeContextBuilder

  /** Max tokens for the writer model (deepseek-v4-pro: 1M context, reserve headroom) */
  private static readonly WRITER_MAX_CONTEXT = 900_000
  /** Reserved tokens for system prompt, style instructions, knowledge prompt, etc. */
  private static readonly PROMPT_OVERHEAD_RESERVE = 8_000
  /** Reserved tokens for the output generation */
  private static readonly OUTPUT_RESERVE = 8_192
  /** Minimum context chars to always include */
  private static readonly MIN_CONTEXT_CHARS = 4_000

  constructor(router: ModelRouter, stateManager: StateManager) {
    this.router = router
    this.stateManager = stateManager
    this.styleEngine = new StyleEngine(stateManager)
    this.rhythmSystem = new RhythmSystem(stateManager)
    this.ruleEngine = new RuleEngine(stateManager)
    this.knowledgeBuilder = new KnowledgeContextBuilder(stateManager, undefined, this.ruleEngine)
  }

  async write(chapterPlan: ChapterPlan, context: WriterContext, contextPrep?: ContextPrepOutput, options?: WriteOptions): Promise<WriterOutput> {
    const scenes: { sceneNumber: number; text: string; wordCount: number }[] = []
    let fullText = ''

    // Fetch style fingerprint prompt for injection
    const styleFingerprintPrompt = await this.styleEngine.generateStylePrompt()

    // Fetch rhythm analysis for pacing guidance
    const rhythmAnalysis = await this.rhythmSystem.getAnalysis()

    // Build knowledge context (rules, templates, plot phase, character patterns)
    const knowledgeContext = await this.knowledgeBuilder.buildKnowledgeContext(chapterPlan.chapter_number)
    const knowledgePrompt = this.knowledgeBuilder.generateKnowledgePrompt(knowledgeContext)

    // Generate dynamic style instructions from fingerprint + rhythm + rules + write options
    const styleInstructions = await this.generateDynamicStyleInstructions(
      styleFingerprintPrompt, rhythmAnalysis, chapterPlan.chapter_number, options
    )

    for (const scene of chapterPlan.scenes) {
      const sceneText = await this.writeScene(
        scene, context, fullText, contextPrep,
        styleFingerprintPrompt, styleInstructions, knowledgePrompt
      )
      const wordCount = this.countWords(sceneText)
      
      scenes.push({
        sceneNumber: scene.scene_number,
        text: sceneText,
        wordCount,
      })
      
      fullText += sceneText + '\n\n'
    }

    return {
      chapterText: fullText.trim(),
      wordCount: this.countWords(fullText),
      scenes,
    }
  }

  /**
   * Dynamically compute the truncation length for fullTextContext based on
   * available context budget. This replaces the old hard-coded slice(-8000)
   * with a strategy that leverages V4's 1M-token context window.
   */
  private computeContextTruncation(
    fullText: string,
    systemPrompt: string,
    userPromptPrefix: string,
    previousContent: string
  ): string {
    // Estimate tokens used by non-fullText parts of the prompt
    const fixedTokens = estimateTokens(systemPrompt)
      + estimateTokens(userPromptPrefix)
      + estimateTokens(previousContent)
      + WriterAgent.PROMPT_OVERHEAD_RESERVE

    // Available tokens for full-text context
    const availableTokens = WriterAgent.WRITER_MAX_CONTEXT - fixedTokens - WriterAgent.OUTPUT_RESERVE

    if (availableTokens <= 0) {
      logger.warn('[Writer] Context budget exhausted, using minimum context')
      return fullText.slice(-WriterAgent.MIN_CONTEXT_CHARS)
    }

    // Convert token budget to approximate char budget (conservative: 1 char ≈ 0.5 tokens for Chinese)
    const maxChars = availableTokens * 2

    if (fullText.length <= maxChars) {
      // Full text fits within budget — use all of it
      return fullText
    }

    logger.debug(`[Writer] Truncating fullText: ${fullText.length} chars → ~${maxChars} chars (${availableTokens} token budget)`)

    // Take the most recent portion — this preserves chronological coherence best
    return fullText.slice(-maxChars)
  }

  private async writeScene(
    scene: SceneCard,
    context: WriterContext,
    previousContent: string,
    contextPrep?: ContextPrepOutput,
    styleFingerprintPrompt?: string,
    styleInstructions?: string,
    knowledgePrompt?: string
  ): Promise<string> {
    const dialogueSamples = contextPrep?.characterDialogueSamples
      ? Object.entries(contextPrep.characterDialogueSamples).map(([name, samples]) => `${name}: ${samples.join(', ')}`).join('\n')
      : ''

    // Build full-text memory context (最近20章全文)
    const fullTextContext = context.fullText && context.fullText.length > 0
      ? context.fullText
      : ''

    // Working memory context (dream summary, character states, hooks)
    const workingMemoryContext = context.workingMemory
      ? `[当前剧情状态]\n摘要: ${context.workingMemory.summary || '无'}\n${context.workingMemory.dream_summary ? '故事简报: ' + context.workingMemory.dream_summary : ''}`
      : ''

    // Author intent
    const authorIntentContext = context.authorIntent
      ? `[作者意图]\n${JSON.stringify(context.authorIntent)}`
      : ''

    const systemPrompt = `你是一位专业网文作者。请根据以下场景卡生成章节内容。

${styleFingerprintPrompt || ''}

写作要求：
${styleInstructions || ''}

${dialogueSamples ? `\n角色对话风格参考：\n${dialogueSamples}` : ''}

${knowledgePrompt ? `\n【知识库参考】\n${knowledgePrompt}` : ''}`

    const userPromptPrefix = `场景信息：
- 地点：${scene.location}
- 时间：${scene.time}
- 氛围：${scene.atmosphere}
- 出场角色：${scene.characters_present.join(', ')}
- 视角角色：${scene.pov_character}
- 场景目标：${scene.scene_goal}
- 场景冲突：${scene.scene_conflict}
- 关键节拍：${scene.key_beats.join(' → ')}
- 预估字数：${scene.word_count_estimate}

${workingMemoryContext}

${authorIntentContext}

[最近全文记忆 - 保持连贯性]`

    // Dynamic truncation based on token budget
    const truncatedContext = fullTextContext
      ? this.computeContextTruncation(fullTextContext, systemPrompt, userPromptPrefix, previousContent)
      : '（新章节，无前文）'

    const userPrompt = `${userPromptPrefix}
${truncatedContext}

前文内容（本章已生成部分）：
${previousContent ? '...' + previousContent.slice(-500) : '（章节开头）'}

请生成本场景的内容，保持与前文的连贯性。`

    const result = await this.router.generate('writer', systemPrompt, userPrompt)
    return result
  }

  /**
   * Generate dynamic style instructions by combining:
   * 1. Style fingerprint (from state)
   * 2. Rhythm analysis (from state)
   * 3. Active writing rules (from RuleEngine, genre-aware)
   * 4. Fallback defaults when fingerprint is missing
   */
  private async generateDynamicStyleInstructions(
    styleFingerprintPrompt: string,
    rhythmAnalysis: RhythmAnalysis,
    chapterNumber: number,
    writeOptions?: WriteOptions
  ): Promise<string> {
    const parts: string[] = []

    // --- 0. Write Options overrides (user-selected mode/intensity/length) ---
    const mode = writeOptions?.mode
    const intensity = writeOptions?.intensity
    const targetLength = writeOptions?.length

    // Mode-specific instructions
    if (mode) {
      parts.push(`\n【写作模式：${mode}】`)
      switch (mode) {
        case '战斗描写':
          parts.push('- 紧张刺激的战斗场景，拳拳到肉的打击感')
          parts.push('- 突出招式与能量的视觉化描写')
          parts.push('- 保持快节奏，减少内心独白和环境描写')
          break
        case '日常过渡':
          parts.push('- 轻松舒缓的日常场景，注重细节与氛围')
          parts.push('- 通过日常互动展现角色性格与关系')
          parts.push('- 适当加入生活感细节，节奏自然从容')
          break
        case '高潮推进':
          parts.push('- 强力推进主线剧情，释放关键伏笔')
          parts.push('- 情感充沛，冲突达到顶点')
          parts.push('- 场景切换加快，多线并行汇聚')
          break
        case '感情发展':
          parts.push('- 细腻的情感描写，注重内心世界')
          parts.push('- 角色间关系的微妙变化与发展')
          parts.push('- 适当使用象征和隐喻增强情感氛围')
          break
        case '剧情推进':
        default:
          parts.push('- 稳步推进主线剧情，合理分配场景时间')
          parts.push('- 保持信息密度适中，每场景至少一个关键事件')
          break
      }
    }

    // Intensity affects pacing and conflict density
    if (intensity !== undefined && intensity !== null) {
      if (intensity >= 80) {
        parts.push('- 高强度节奏：场景切换频繁，冲突密集，每500字内有事件推进')
      } else if (intensity >= 60) {
        parts.push('- 中高强度：保持紧张感，适当加入缓冲性微场景')
      } else if (intensity >= 40) {
        parts.push('- 中等强度：张弛有度，场景间有自然的过渡和喘息空间')
      } else if (intensity >= 20) {
        parts.push('- 偏低强度：节奏从容，侧重点在氛围营造和细节刻画')
      } else {
        parts.push('- 低强度/过渡章节：以铺垫和蓄势为主，为后续高潮做准备')
      }
    }

    // Target length guidance (injected into system prompt)
    if (targetLength && targetLength > 0) {
      parts.push(`- 本章目标字数约${targetLength}字，请合理分配各场景篇幅`)
    }

    // --- 1. Core writing quality defaults (always present) ---
    parts.push('- 对话自然，减少"说道"的使用')
    parts.push('- 避免AI味句式（"不仅如此""然而...却""在...的过程中"等）')
    parts.push('- 展示而非叙述，用具体动作和对话推进剧情')
    parts.push('- 章末留悬念或伏笔')

    // --- 2. Style fingerprint driven instructions ---
    const hasFingerprint = styleFingerprintPrompt && !styleFingerprintPrompt.includes('默认风格')

    if (hasFingerprint) {
      try {
        const fingerprint = await this.stateManager.read('style_fingerprint')

        // Sentence pattern guidance
        if (fingerprint.sentence_pattern) {
          const avgLen = fingerprint.sentence_pattern.avg_sentence_length
          const shortRatio = fingerprint.sentence_pattern.short_sentence_ratio
          if (shortRatio > 0.6) {
            parts.push(`- 保持短句风格，平均句长控制在${Math.round(avgLen)}字左右`)
          } else {
            parts.push(`- 句长适中，短句占比约${(shortRatio * 100).toFixed(0)}%，长短结合`)
          }
        }

        // Dialogue style guidance
        if (fingerprint.dialogue_style) {
          const tagPref = fingerprint.dialogue_style.tag_preference
          if (tagPref === '道') {
            parts.push('- 对话标签偏好使用"道"（而非"说"）')
          } else if (tagPref === '说') {
            parts.push('- 对话标签偏好使用"说"')
          }
          if (fingerprint.dialogue_style.action_with_dialogue) {
            parts.push('- 对话时搭配动作描写，增强画面感')
          }
        }

        // Rhetoric guidance
        if (fingerprint.rhetoric) {
          if (fingerprint.rhetoric.metaphor_density > 0.1) {
            parts.push(`- 适当使用比喻修辞（密度约${(fingerprint.rhetoric.metaphor_density * 100).toFixed(0)}%）`)
          }
          const senses = fingerprint.rhetoric.sensory_preference || []
          if (senses.length > 0) {
            parts.push(`- 感官描写侧重：${senses.join('、')}`)
          }
        }

        // Pacing guidance
        if (fingerprint.pacing) {
          const daRatio = fingerprint.pacing.description_to_action_ratio
          if (daRatio < 0.3) {
            parts.push('- 节奏偏快，以行动和对话为主，减少静态描写')
          } else if (daRatio > 0.5) {
            parts.push('- 节奏偏缓，适当增加环境描写和氛围渲染')
          }
          if (fingerprint.pacing.inner_monologue_ratio > 0.2) {
            parts.push('- 适度加入内心独白，增强代入感')
          }
        }
      } catch {
        // No fingerprint — skip dynamic instructions
      }
    }

    // --- 3. Rhythm analysis feedback ---
    if (rhythmAnalysis.alerts && rhythmAnalysis.alerts.length > 0) {
      parts.push('\n【节奏反馈 - 前文节奏问题请在本章修正】')
      for (const alert of rhythmAnalysis.alerts) {
        parts.push(`- ⚠ ${alert}`)
      }
    }
    if (rhythmAnalysis.debtTrend === 'increasing') {
      parts.push('- ⚠ 阅读债务上升，请在本章增加爽点或微回报')
    }
    if (rhythmAnalysis.avgHookStrength < 0.4) {
      parts.push('- ⚠ 近期钩子强度偏低，请加强章末悬念')
    }
    if (rhythmAnalysis.coolPointDensity < 0.5) {
      parts.push('- ⚠ 近期爽点密度偏低，请在本章安排至少1个爽点')
    }

    // --- 4. Genre-aware writing rules from RuleEngine ---
    try {
      const masterSetting = await this.stateManager.read('MASTER_SETTING')
      const genre = masterSetting.genre || '玄幻'
      const activeRules = this.ruleEngine.getActiveRules(genre)

      if (activeRules.length > 0) {
        parts.push('\n【题材规则 - 自动校准】')
        for (const rule of activeRules.slice(0, 5)) {
          const effectiveWeight = (rule as any).effective_weight ?? rule.weight
          const weightLabel = effectiveWeight >= 0.8 ? '（重要）' :
                              effectiveWeight >= 0.5 ? '' : '（参考）'
          parts.push(`- [${rule.category}] ${rule.rule} ${weightLabel}`)
        }
      }
    } catch {
      // No genre set — skip
    }

    return parts.join('\n')
  }

  /**
   * Post-write: analyze generated text for style deviations and return feedback.
   * Called externally after write() to detect style drift.
   */
  async detectStyleDeviations(chapterText: string): Promise<StyleDeviation[]> {
    return this.styleEngine.detectDeviations(chapterText)
  }

  /**
   * Post-write: analyze chapter rhythm and save to state.
   * Called externally after write() to feed rhythm data back.
   */
  async analyzeChapterRhythm(chapterNumber: number, chapterText: string) {
    return this.rhythmSystem.analyzeChapter(chapterNumber, chapterText)
  }

  private countWords(text: string): number {
    return text.replace(/\s/g, '').length
  }
}
