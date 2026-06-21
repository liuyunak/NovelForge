import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../logger.js'

export interface DPOSample {
  prompt: string
  chosen: string
  rejected: string
  timestamp: string
  chapter: number
  qualityScore?: number
  reason?: string
}

export interface DPOStats {
  totalSamples: number
  avgQualityScore: number
  samplesByChapter: Record<number, number>
  dateRange: { earliest: string; latest: string }
}

export class DPODataCollector {
  private workspacePath: string
  private samples: DPOSample[]
  private dataPath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.dataPath = path.join(workspacePath, 'dpo_data.json')
    this.samples = this.loadSamples()
  }

  private loadSamples(): DPOSample[] {
    if (fs.existsSync(this.dataPath)) {
      try {
        const content = fs.readFileSync(this.dataPath, 'utf-8')
        return JSON.parse(content)
      } catch (err) {
        logger.warn(`Failed to load DPO data: ${err}`)
        return []
      }
    }
    return []
  }

  private saveSamples(): void {
    fs.writeFileSync(this.dataPath, JSON.stringify(this.samples, null, 2), 'utf-8')
  }

  /**
   * 计算文本质量分数（简单启发式）
   */
  private calculateQualityScore(text: string): number {
    if (!text || text.length === 0) return 0

    let score = 0
    const len = text.length

    // 长度评分 (0-25)
    if (len >= 100) score += 25
    else if (len >= 50) score += 15
    else if (len >= 20) score += 5

    // 多样性评分 (0-25)
    const uniqueChars = new Set(text.split('')).size
    const diversity = uniqueChars / len
    if (diversity > 0.3) score += 25
    else if (diversity > 0.2) score += 15
    else if (diversity > 0.15) score += 5

    // 标点符号评分 (0-25)
    const punctuationCount = (text.match(/[。！？、，；：]/g) || []).length
    const punctuationRatio = punctuationCount / len
    if (punctuationRatio > 0.05) score += 25
    else if (punctuationRatio > 0.03) score += 15
    else if (punctuationRatio > 0.01) score += 5

    // 段落分隔评分 (0-25)
    const paragraphCount = (text.split(/\n\n+/) || []).length
    if (paragraphCount > 1) score += 25
    else if (paragraphCount === 1 && len > 200) score += 10

    return Math.min(100, score)
  }

  /**
   * 收集一个 DPO 样本
   */
  async collectSample(
    prompt: string,
    originalText: string,
    editedText: string,
    chapter: number
  ): Promise<void> {
    if (originalText === editedText) {
      logger.debug('Skipping identical sample')
      return
    }

    const chosenScore = this.calculateQualityScore(editedText)
    const rejectedScore = this.calculateQualityScore(originalText)

    // 只收集有实质性改进或编辑幅度足够的样本
    // 允许质量分数相同但编辑幅度大的样本（探索性学习价值）
    const isSignificantImprovement = chosenScore > rejectedScore
    const isSubstantialEdit = editedText.length > originalText.length * 1.3 // 编辑幅度超过30%
    
    if (!isSignificantImprovement && !isSubstantialEdit) {
      logger.debug(`Skipping sample (not substantial enough: chosen: ${chosenScore}, rejected: ${rejectedScore}, length ratio: ${(editedText.length / originalText.length).toFixed(2)})`)
      return
    }

    const sample: DPOSample = {
      prompt,
      chosen: editedText,
      rejected: originalText,
      timestamp: new Date().toISOString(),
      chapter,
      qualityScore: chosenScore,
      reason: `Quality improvement: ${rejectedScore} → ${chosenScore}`,
    }

    this.samples.push(sample)
    this.saveSamples()

    logger.info(`DPO sample collected. Total: ${this.samples.length}, Quality: ${chosenScore}`)
  }

  /**
   * 获取样本数量
   */
  getSampleCount(): number {
    return this.samples.length
  }

  /**
   * 获取所有样本
   */
  getSamplesForTraining(): DPOSample[] {
    return this.samples
  }

  /**
   * 导出训练数据（去除元数据）
   */
  async exportForTraining(outputPath: string): Promise<number> {
    const trainingData = this.samples.map(s => ({
      prompt: s.prompt,
      chosen: s.chosen,
      rejected: s.rejected,
    }))

    fs.writeFileSync(outputPath, JSON.stringify(trainingData, null, 2), 'utf-8')
    logger.info(`Exported ${trainingData.length} DPO samples to ${outputPath}`)
    return trainingData.length
  }

  /**
   * 清理过期样本
   */
  async clearOldSamples(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAge
    const beforeCount = this.samples.length

    this.samples = this.samples.filter(s =>
      new Date(s.timestamp).getTime() > cutoff
    )

    this.saveSamples()
    const removedCount = beforeCount - this.samples.length

    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} old DPO samples`)
    }

    return removedCount
  }

  /**
   * 获取数据统计信息
   */
  getStats(): DPOStats {
    const totalSamples = this.samples.length

    if (totalSamples === 0) {
      return {
        totalSamples: 0,
        avgQualityScore: 0,
        samplesByChapter: {},
        dateRange: { earliest: '', latest: '' },
      }
    }

    const totalScore = this.samples.reduce((sum, s) => sum + (s.qualityScore || 0), 0)
    const avgQualityScore = Math.round(totalScore / totalSamples)

    const samplesByChapter: Record<number, number> = {}
    for (const sample of this.samples) {
      samplesByChapter[sample.chapter] = (samplesByChapter[sample.chapter] || 0) + 1
    }

    const timestamps = this.samples.map(s => new Date(s.timestamp).getTime())
    const dateRange = {
      earliest: new Date(Math.min(...timestamps)).toISOString(),
      latest: new Date(Math.max(...timestamps)).toISOString(),
    }

    return {
      totalSamples,
      avgQualityScore,
      samplesByChapter,
      dateRange,
    }
  }

  /**
   * 批量导入样本
   */
  async batchImport(samples: DPOSample[]): Promise<number> {
    const validSamples = samples.filter(s => s.chosen !== s.rejected && s.prompt && s.chosen && s.rejected)
    
    this.samples.push(...validSamples)
    this.saveSamples()

    logger.info(`Imported ${validSamples.length} DPO samples. Total: ${this.samples.length}`)
    return validSamples.length
  }

  /**
   * 清空所有样本
   */
  async clearAll(): Promise<number> {
    const count = this.samples.length
    this.samples = []
    this.saveSamples()
    logger.info(`Cleared ${count} DPO samples`)
    return count
  }
}
