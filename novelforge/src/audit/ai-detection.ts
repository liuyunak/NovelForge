/**
 * AI Detection Module
 * 
 * Provides comprehensive AI-generated text detection using multiple heuristics:
 * - Forbidden pattern matching (cliché AI phrases)
 * - Perplexity analysis (text predictability)
 * - Burstiness analysis (sentence structure variation)
 * - Style indicator detection
 * - Repetition patterns
 */

export interface DetectionResult {
  overallScore: number // 0-100, higher = more human-like
  platformScores: {
    '知网': number
    '维普': number
    '朱雀': number
  }
  metrics: DetectionMetrics
  highRiskSegments: HighRiskSegment[]
  suggestions: string[]
  riskLevel: 'low' | 'medium' | 'high'
}

export interface DetectionMetrics {
  forbiddenPatternCount: number
  perplexityScore: number // Lower = more predictable (more AI-like)
  burstinessScore: number // Higher = more variation (more human-like)
  repetitionScore: number // Lower = more repetitive (more AI-like)
  averageSentenceLength: number
  sentenceLengthVariance: number
  uniqueWordRatio: number
  emotionalLanguageRatio: number
}

export interface HighRiskSegment {
  text: string
  reason: string
  score: number // 0-10, higher = more risky
}

export interface DetectionConfig {
  enableForbiddenPatterns?: boolean
  enablePerplexity?: boolean
  enableBurstiness?: boolean
  enableRepetition?: boolean
  thresholds?: {
    forbiddenPatternMax?: number
    perplexityMin?: number
    burstinessMin?: number
    repetitionMax?: number
  }
}

const DEFAULT_CONFIG: DetectionConfig = {
  enableForbiddenPatterns: true,
  enablePerplexity: true,
  enableBurstiness: true,
  enableRepetition: true,
  thresholds: {
    forbiddenPatternMax: 5,
    perplexityMin: 40,
    burstinessMin: 30,
    repetitionMax: 3,
  },
}

export class AIDetection {
  private config: DetectionConfig
  private forbiddenPatterns: RegExp[]
  private styleIndicators: string[]

  constructor(config?: DetectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    
    this.forbiddenPatterns = [
      /然而.{0,5}却/g,
      /不仅.*而且/g,
      /在.*的过程中/g,
      /由此可见/g,
      /综上所述/g,
      /值得注意的是/g,
      /不禁/g,
      /竟然/g,
      /居然/g,
      /仿佛/g,
      /似乎/g,
      /不禁感慨/g,
      /让人不禁/g,
      /我不禁/g,
      /可以说/g,
      /不可否认/g,
      /毋庸置疑/g,
      /令人惊讶的是/g,
      /令人深思/g,
      /耐人寻味/g,
    ]

    this.styleIndicators = [
      '短句为主',
      '减少学术性表达',
      '减少惊叹表达',
      '增加具体细节',
      '使用口语化表达',
      '增强情感描写',
    ]
  }

  /**
   * Detect AI-generated text
   */
  detect(text: string): DetectionResult {
    if (!text || text.length === 0) {
      return this.getEmptyResult()
    }

    const metrics = this.calculateMetrics(text)
    const highRiskSegments = this.findHighRiskSegments(text)
    const suggestions = this.generateSuggestions(metrics, highRiskSegments)
    
    // Calculate overall score based on all metrics
    const overallScore = this.calculateOverallScore(metrics, highRiskSegments)

    return {
      overallScore,
      platformScores: {
        '知网': Math.round(overallScore - 5),
        '维普': Math.round(overallScore - 3),
        '朱雀': Math.round(overallScore - 8),
      },
      metrics,
      highRiskSegments: highRiskSegments.slice(0, 10),
      suggestions,
      riskLevel: overallScore >= 70 ? 'low' : overallScore >= 40 ? 'medium' : 'high',
    }
  }

  /**
   * Calculate comprehensive detection metrics
   */
  private calculateMetrics(text: string): DetectionMetrics {
    const forbiddenPatternCount = this.countForbiddenPatterns(text)
    const perplexityScore = this.calculatePerplexity(text)
    const burstinessScore = this.calculateBurstiness(text)
    const repetitionScore = this.calculateRepetitionScore(text)
    const { averageSentenceLength, sentenceLengthVariance } = this.calculateSentenceStats(text)
    const uniqueWordRatio = this.calculateUniqueWordRatio(text)
    const emotionalLanguageRatio = this.calculateEmotionalLanguageRatio(text)

    return {
      forbiddenPatternCount,
      perplexityScore,
      burstinessScore,
      repetitionScore,
      averageSentenceLength: Math.round(averageSentenceLength),
      sentenceLengthVariance: Math.round(sentenceLengthVariance),
      uniqueWordRatio: Math.round(uniqueWordRatio * 100) / 100,
      emotionalLanguageRatio: Math.round(emotionalLanguageRatio * 100) / 100,
    }
  }

  /**
   * Count forbidden AI patterns in text
   */
  private countForbiddenPatterns(text: string): number {
    if (!this.config.enableForbiddenPatterns) return 0

    let count = 0
    for (const pattern of this.forbiddenPatterns) {
      const matches = text.match(pattern)
      if (matches) {
        count += matches.length
      }
    }
    return count
  }

  /**
   * Calculate perplexity score (measure of text predictability)
   * Lower perplexity = more AI-like (predictable patterns)
   */
  private calculatePerplexity(text: string): number {
    if (!this.config.enablePerplexity) return 50

    const sentences = this.splitSentences(text)
    if (sentences.length === 0) return 50

    // Analyze sentence structure diversity
    const structureCounts = new Map<string, number>()
    for (const sentence of sentences) {
      // Simplified structure extraction
      const structure = this.extractSentenceStructure(sentence)
      structureCounts.set(structure, (structureCounts.get(structure) || 0) + 1)
    }

    // Calculate entropy (higher entropy = more diverse = more human-like)
    const total = sentences.length
    let entropy = 0
    for (const count of structureCounts.values()) {
      const probability = count / total
      if (probability > 0) {
        entropy -= probability * Math.log2(probability)
      }
    }

    // Normalize to 0-100 scale
    const maxEntropy = Math.log2(structureCounts.size) || 1
    const normalizedEntropy = (entropy / maxEntropy) * 100

    // Penalize very uniform structures (AI tendency)
    const maxCount = Math.max(...structureCounts.values())
    const uniformityPenalty = (maxCount / total) * 30

    return Math.max(0, Math.min(100, Math.round(normalizedEntropy - uniformityPenalty)))
  }

  /**
   * Calculate burstiness score (variation in sentence structure/length)
   * Higher burstiness = more human-like
   */
  private calculateBurstiness(text: string): number {
    if (!this.config.enableBurstiness) return 50

    const sentences = this.splitSentences(text)
    if (sentences.length < 2) return 50

    const lengths = sentences.map(s => s.length)
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length
    const stdDev = Math.sqrt(variance)

    // Coefficient of variation (CV)
    const cv = (stdDev / mean) * 100

    // Normalize to 0-100 scale
    // Human text typically has CV between 20-60
    let burstiness = Math.max(0, Math.min(100, cv))

    return Math.round(burstiness)
  }

  /**
   * Calculate repetition score
   */
  private calculateRepetitionScore(text: string): number {
    if (!this.config.enableRepetition) return 50

    const words = text.match(/[^\s\u4e00-\u9fff]/g) || []
    if (words.length === 0) return 0

    const wordFreq = new Map<string, number>()
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
    }

    // Count highly frequent words (potential repetition)
    let repetitionCount = 0
    for (const count of wordFreq.values()) {
      if (count > 10) {
        repetitionCount += count - 10
      }
    }

    const repetitionRatio = (repetitionCount / words.length) * 100
    return Math.min(100, Math.round(repetitionRatio * 10))
  }

  /**
   * Calculate sentence length statistics
   */
  private calculateSentenceStats(text: string): { averageSentenceLength: number; sentenceLengthVariance: number } {
    const sentences = this.splitSentences(text)
    if (sentences.length === 0) return { averageSentenceLength: 0, sentenceLengthVariance: 0 }

    const lengths = sentences.map(s => s.length)
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length

    return {
      averageSentenceLength: mean,
      sentenceLengthVariance: variance,
    }
  }

  /**
   * Calculate unique word ratio
   */
  private calculateUniqueWordRatio(text: string): number {
    const words = text.match(/[^\s\u4e00-\u9fff]/g) || []
    if (words.length === 0) return 0

    const uniqueWords = new Set(words)
    return uniqueWords.size / words.length
  }

  /**
   * Calculate emotional language ratio
   */
  private calculateEmotionalLanguageRatio(text: string): number {
    const emotionalMarkers = [
      '非常', '极其', '特别', '格外', '十分',
      '真的', '确实', '绝对', '完全',
      '！', '！！', '！！！',
    ]

    const matches = emotionalMarkers.reduce((count, marker) => {
      const regex = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      const found = text.match(regex)
      return count + (found ? found.length : 0)
    }, 0)

    return matches / (text.length / 10)
  }

  /**
   * Find high-risk segments in text
   */
  private findHighRiskSegments(text: string): HighRiskSegment[] {
    const segments: HighRiskSegment[] = []

    if (!this.config.enableForbiddenPatterns) return segments

    for (const pattern of this.forbiddenPatterns) {
      const matches = text.match(pattern)
      if (!matches) continue

      for (const match of matches) {
        const index = text.indexOf(match)
        const start = Math.max(0, index - 30)
        const end = Math.min(text.length, index + match.length + 30)
        const context = text.substring(start, end)

        segments.push({
          text: context,
          reason: `命中禁止句式: ${match}`,
          score: 7,
        })
      }
    }

    return segments
  }

  /**
   * Calculate overall detection score
   */
  private calculateOverallScore(metrics: DetectionMetrics, segments: HighRiskSegment[]): number {
    let score = 100

    // Penalty for forbidden patterns
    const threshold = this.config.thresholds?.forbiddenPatternMax || 5
    if (metrics.forbiddenPatternCount > threshold) {
      score -= Math.min(40, (metrics.forbiddenPatternCount - threshold) * 5)
    }

    // Penalty for low perplexity (too predictable)
    const perplexityThreshold = this.config.thresholds?.perplexityMin || 40
    if (metrics.perplexityScore < perplexityThreshold) {
      score -= Math.min(20, (perplexityThreshold - metrics.perplexityScore))
    }

    // Penalty for low burstiness (uniform structure)
    const burstinessThreshold = this.config.thresholds?.burstinessMin || 30
    if (metrics.burstinessScore < burstinessThreshold) {
      score -= Math.min(20, (burstinessThreshold - metrics.burstinessScore))
    }

    // Penalty for high repetition
    const repetitionThreshold = this.config.thresholds?.repetitionMax || 3
    if (metrics.repetitionScore > repetitionThreshold * 10) {
      score -= Math.min(15, metrics.repetitionScore - repetitionThreshold * 10)
    }

    // Penalty for high-risk segments
    score -= segments.length * 2

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(metrics: DetectionMetrics, segments: HighRiskSegment[]): string[] {
    const suggestions: string[] = []

    if (metrics.forbiddenPatternCount > 3) {
      suggestions.push('AI检测风险较高，建议移除常见AI表达模式')
    }
    if (metrics.forbiddenPatternCount > 0) {
      suggestions.push('部分句式可能触发检测，建议手动修改')
    }
    if (metrics.perplexityScore < 40) {
      suggestions.push('文本可预测性较高，建议增加句式多样性')
    }
    if (metrics.burstinessScore < 30) {
      suggestions.push('句子结构过于统一，建议混合长短句')
    }
    if (metrics.uniqueWordRatio < 0.3) {
      suggestions.push('词汇重复率较高，建议丰富用词')
    }
    if (metrics.emotionalLanguageRatio > 0.15) {
      suggestions.push('感叹词使用过多，建议减少夸张表达')
    }
    if (segments.length > 5) {
      suggestions.push('存在多处高风险片段，建议逐一修改')
    }
    if (metrics.forbiddenPatternCount === 0 && metrics.perplexityScore >= 40 && metrics.burstinessScore >= 30) {
      suggestions.push('AI检测风险较低，可直接发布')
    }

    return suggestions
  }

  /**
   * Helper: Split text into sentences
   */
  private splitSentences(text: string): string[] {
    return text.split(/(?<=[。！？；])/).filter(s => s.trim().length > 0)
  }

  /**
   * Helper: Extract simplified sentence structure
   */
  private extractSentenceStructure(sentence: string): string {
    // Simplified: categorize by length and key patterns
    const len = sentence.length
    if (len < 10) return 'short'
    if (len < 30) return 'medium'
    return 'long'
  }

  /**
   * Get empty result for empty text
   */
  private getEmptyResult(): DetectionResult {
    return {
      overallScore: 50,
      platformScores: {
        '知网': 45,
        '维普': 47,
        '朱雀': 42,
      },
      metrics: {
        forbiddenPatternCount: 0,
        perplexityScore: 50,
        burstinessScore: 50,
        repetitionScore: 0,
        averageSentenceLength: 0,
        sentenceLengthVariance: 0,
        uniqueWordRatio: 0,
        emotionalLanguageRatio: 0,
      },
      highRiskSegments: [],
      suggestions: ['文本为空，无法进行检测'],
      riskLevel: 'medium',
    }
  }
}
