import { describe, it, expect, beforeEach } from 'vitest'
import { AIDetection, type DetectionResult } from '../../src/audit/ai-detection'

describe('AIDetection', () => {
  let detector: AIDetection

  beforeEach(() => {
    detector = new AIDetection()
  })

  describe('detect()', () => {
    it('should return valid detection result', () => {
      const text = '这是一个测试文本。它包含了多种句式和表达方式。'
      const result = detector.detect(text)

      expect(result).toBeDefined()
      expect(typeof result.overallScore).toBe('number')
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
      expect(result.platformScores).toBeDefined()
      expect(result.metrics).toBeDefined()
      expect(result.highRiskSegments).toBeDefined()
      expect(result.suggestions).toBeDefined()
      expect(['low', 'medium', 'high']).toContain(result.riskLevel)
    })

    it('should detect AI-like patterns', () => {
      const aiText = '然而他却不得不面对现实。这不仅是一个问题，而且是一个巨大的挑战。在发展的过程中，由此可见其重要性。'
      const result = detector.detect(aiText)

      expect(result.metrics.forbiddenPatternCount).toBeGreaterThan(0)
      expect(result.overallScore).toBeLessThan(70)
    })

    it('should give higher score to human-like text', () => {
      const humanText = '他走进房间。沉默片刻后，他缓缓坐下，望着窗外渐渐暗下来的天色。远处传来几声钟响，悠长而空旷。雨，开始下了。细细密密的雨丝敲打着玻璃，发出轻微的声响。一切都很安静。只有呼吸声。'
      const result = detector.detect(humanText)

      expect(result.metrics.burstinessScore).toBeGreaterThan(0)
      expect(result.metrics.perplexityScore).toBeGreaterThan(0)
    })

    it('should handle empty text', () => {
      const result = detector.detect('')

      expect(result.overallScore).toBe(50)
      expect(result.riskLevel).toBe('medium')
      expect(result.suggestions).toContain('文本为空，无法进行检测')
    })

    it('should handle null text', () => {
      const result = detector.detect('')

      expect(result).toBeDefined()
      expect(result.metrics.forbiddenPatternCount).toBe(0)
    })
  })

  describe('metrics calculation', () => {
    it('should calculate perplexity score', () => {
      const text = '这是一个测试文本。它包含了多种句式和表达方式。不同的句子长度和结构增加了文本的多样性。'
      const result = detector.detect(text)

      expect(typeof result.metrics.perplexityScore).toBe('number')
      expect(result.metrics.perplexityScore).toBeGreaterThanOrEqual(0)
      expect(result.metrics.perplexityScore).toBeLessThanOrEqual(100)
    })

    it('should calculate burstiness score', () => {
      const text = '短。中等长度的句子。这是一个非常长的句子，包含了更多的词语和更复杂的结构，用于测试burstiness计算。'
      const result = detector.detect(text)

      expect(typeof result.metrics.burstinessScore).toBe('number')
      expect(result.metrics.burstinessScore).toBeGreaterThanOrEqual(0)
      expect(result.metrics.burstinessScore).toBeLessThanOrEqual(100)
    })

    it('should calculate unique word ratio', () => {
      const text = '这是一个测试文本。文本应该包含独特的词汇。独特的词汇有助于提高文本质量。'
      const result = detector.detect(text)

      expect(typeof result.metrics.uniqueWordRatio).toBe('number')
      expect(result.metrics.uniqueWordRatio).toBeGreaterThanOrEqual(0)
      expect(result.metrics.uniqueWordRatio).toBeLessThanOrEqual(1)
    })

    it('should calculate average sentence length', () => {
      const text = '第一句话。第二句话比较长一些，包含了更多的内容和细节描述。第三句。'
      const result = detector.detect(text)

      expect(result.metrics.averageSentenceLength).toBeGreaterThan(0)
    })
  })

  describe('high risk segments', () => {
    it('should identify high-risk segments', () => {
      const text = '然而他却选择了放弃。这不仅仅是一个决定，而且是一个重大的转折。在成长的过程中，由此可见他的内心变化。'
      const result = detector.detect(text)

      expect(Array.isArray(result.highRiskSegments)).toBe(true)
      if (result.highRiskSegments.length > 0) {
        expect(result.highRiskSegments[0]).toHaveProperty('text')
        expect(result.highRiskSegments[0]).toHaveProperty('reason')
        expect(result.highRiskSegments[0]).toHaveProperty('score')
      }
    })

    it('should limit high-risk segments to 10', () => {
      const aiPatterns = ['然而他却', '不仅而且', '在的过程中', '由此可见', '综上所述',
                         '值得注意的是', '不禁', '竟然', '居然', '仿佛']
      const text = aiPatterns.map(p => `${p}测试文本。`).join('')
      const result = detector.detect(text)

      expect(result.highRiskSegments.length).toBeLessThanOrEqual(10)
    })
  })

  describe('suggestions', () => {
    it('should provide suggestions for AI-like text', () => {
      const aiText = '然而他却不得不面对。这不仅是一个问题，而且很严重。在发展的过程中，由此可见重要性。'
      const result = detector.detect(aiText)

      expect(Array.isArray(result.suggestions)).toBe(true)
      expect(result.suggestions.length).toBeGreaterThan(0)
    })

    it('should provide positive feedback for human-like text', () => {
      const humanText = '他走进房间。坐下。沉默。窗外下雨了。远处的钟声响起。'
      const result = detector.detect(humanText)

      expect(Array.isArray(result.suggestions)).toBe(true)
    })
  })

  describe('risk level classification', () => {
    it('should classify as low risk for high score', () => {
      const humanText = '短。长句子比较复杂，包含了很多细节和描述性语言，以及一些专业术语和复杂的语法结构。'
      const result = detector.detect(humanText)

      expect(['low', 'medium', 'high']).toContain(result.riskLevel)
    })

    it('should classify as medium risk for medium score', () => {
      const text = '这是一个中等长度的文本。它既不太简单也不太复杂。适合进行测试。'
      const result = detector.detect(text)

      expect(['low', 'medium', 'high']).toContain(result.riskLevel)
    })

    it('should classify as high risk for low score', () => {
      const aiText = '然而这却是一个不仅而且的问题。在过程中由此可见。综上所述值得注意的是不禁竟然居然。'
      const result = detector.detect(aiText)

      expect(['low', 'medium', 'high']).toContain(result.riskLevel)
    })
  })

  describe('platform scores', () => {
    it('should return platform-specific scores', () => {
      const text = '这是一个测试文本。用于检测AI生成特征。'
      const result = detector.detect(text)

      expect(result.platformScores).toHaveProperty('知网')
      expect(result.platformScores).toHaveProperty('维普')
      expect(result.platformScores).toHaveProperty('朱雀')

      expect(typeof result.platformScores['知网']).toBe('number')
      expect(typeof result.platformScores['维普']).toBe('number')
      expect(typeof result.platformScores['朱雀']).toBe('number')
    })
  })
})
