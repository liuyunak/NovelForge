import { z } from 'zod'
import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import { logger } from '../logger.js'
import type { StyleFingerprint } from '../types/index.js'

const styleFingerprintSchema = z.object({
  sentence_pattern: z.object({
    avg_sentence_length: z.number(),
    short_sentence_ratio: z.number(),
    complex_sentence_ratio: z.number(),
  }),
  vocabulary: z.object({
    preferred_verbs: z.array(z.string()),
    preferred_nouns: z.array(z.string()),
    filler_word_rate: z.number(),
  }),
  dialogue_style: z.object({
    tag_preference: z.enum(['道', '说', 'none']),
    action_with_dialogue: z.boolean(),
    avg_dialogue_length: z.number(),
  }),
  rhetoric: z.object({
    metaphor_density: z.number(),
    preferred_rhetoric: z.array(z.string()),
    sensory_preference: z.array(z.string()),
  }),
  pacing: z.object({
    description_to_action_ratio: z.number(),
    inner_monologue_ratio: z.number(),
  }),
})

export class StyleExtractorAgent {
  private router: ModelRouter
  private stateManager: StateManager

  constructor(router: ModelRouter, stateManager: StateManager) {
    this.router = router
    this.stateManager = stateManager
  }

  async extract(samples: string[]): Promise<StyleFingerprint> {
    const combinedText = samples.join('\n\n---\n\n')

    const systemPrompt = `你是一位专业的文学风格分析师。请分析以下文本的写作风格，提取风格特征。

分析维度：
1. 句式模式（平均句长、短句占比、复合句占比）
2. 词汇偏好（常用动词、名词、填充词率）
3. 对话风格（标签偏好、对话与动作结合、平均对话长度）
4. 修辞特征（比喻密度、常用修辞、感官偏好）
5. 节奏特征（描写与行动比、内心独白占比）

输出JSON格式：
{
  "sentence_pattern": {
    "avg_sentence_length": 数字,
    "short_sentence_ratio": 0-1,
    "complex_sentence_ratio": 0-1
  },
  "vocabulary": {
    "preferred_verbs": ["常用动词"],
    "preferred_nouns": ["常用名词"],
    "filler_word_rate": 0-1
  },
  "dialogue_style": {
    "tag_preference": "道/说/none",
    "action_with_dialogue": true/false,
    "avg_dialogue_length": 数字
  },
  "rhetoric": {
    "metaphor_density": 0-1,
    "preferred_rhetoric": ["常用修辞"],
    "sensory_preference": ["感官偏好"]
  },
  "pacing": {
    "description_to_action_ratio": 数字,
    "inner_monologue_ratio": 0-1
  }
}`

    const result = await this.router.generate('style-extractor', systemPrompt, combinedText)
    
    let fingerprint: StyleFingerprint
    try {
      const parsed = JSON.parse(result)
      const validation = styleFingerprintSchema.safeParse(parsed)
      if (!validation.success) {
        logger.warn('StyleExtractor response validation failed:', validation.error.issues)
        fingerprint = this.getDefaultFingerprint()
      } else {
        fingerprint = validation.data
      }
    } catch (e) {
      logger.warn('StyleExtractor response parse error:', e instanceof Error ? e.message : e)
      fingerprint = this.getDefaultFingerprint()
    }

    fingerprint.metadata = {
      source_chapters: samples.length,
      extraction_date: new Date().toISOString(),
      confidence: 0.7,
    }

    await this.stateManager.write('style_fingerprint', fingerprint)
    
    return fingerprint
  }

  private getDefaultFingerprint(): StyleFingerprint {
    return {
      sentence_pattern: { avg_sentence_length: 15, short_sentence_ratio: 0.5, complex_sentence_ratio: 0.3 },
      vocabulary: { preferred_verbs: [], preferred_nouns: [], filler_word_rate: 0.02 },
      dialogue_style: { tag_preference: 'none', action_with_dialogue: true, avg_dialogue_length: 15 },
      rhetoric: { metaphor_density: 0.1, preferred_rhetoric: [], sensory_preference: [] },
      pacing: { description_to_action_ratio: 0.3, inner_monologue_ratio: 0.1 },
    }
  }
}
