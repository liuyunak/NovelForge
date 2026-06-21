#!/usr/bin/env node

/**
 * DPO Data Generator
 * 
 * Generates preference pairs from existing training data for DPO training.
 * Creates variations of text with different quality levels to form (chosen, rejected) pairs.
 * 
 * Usage:
 *   npx tsx tools/dpo-data-generator.ts --input <training-data.json> --output <dpo-data.json>
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { Command } from 'commander'
import { logger } from '../src/logger.js'

interface DPOPair {
  id: string
  prompt: string
  chosen: string
  rejected: string
  qualityChosen?: number
  qualityRejected?: number
  timestamp: string
}

interface GenerationConfig {
  minLength: number
  maxLength: number
  diversityThreshold: number
  sampleCount: number
}

const DEFAULT_CONFIG: GenerationConfig = {
  minLength: 50,
  maxLength: 2000,
  diversityThreshold: 0.3,
  sampleCount: 1000,
}

class DPODataGenerator {
  private config: GenerationConfig
  private trainingData: any[]
  private pairs: DPOPair[]

  constructor(config: GenerationConfig = DEFAULT_CONFIG) {
    this.config = config
    this.trainingData = []
    this.pairs = []
  }

  /**
   * Load training data
   */
  loadData(inputPath: string): void {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`)
    }

    const content = fs.readFileSync(inputPath, 'utf-8')
    this.trainingData = JSON.parse(content)

    logger.info(`Loaded ${this.trainingData.length} training samples`)
  }

  /**
   * Calculate text quality score (simple heuristic)
   */
  private calculateQualityScore(text: string): number {
    if (!text || text.length === 0) return 0

    let score = 0
    const len = text.length

    // Length score (0-30)
    if (len >= 200) score += 30
    else if (len >= 100) score += 20
    else if (len >= 50) score += 10

    // Diversity score (0-30)
    const uniqueChars = new Set(text.split('')).size
    const diversity = uniqueChars / len
    if (diversity > 0.35) score += 30
    else if (diversity > 0.25) score += 20
    else if (diversity > 0.15) score += 10

    // Punctuation score (0-20)
    const punctuationCount = (text.match(/[。！？、，；：]/g) || []).length
    const punctuationRatio = punctuationCount / len
    if (punctuationRatio > 0.08) score += 20
    else if (punctuationRatio > 0.05) score += 15
    else if (punctuationRatio > 0.02) score += 10

    // Paragraph score (0-20)
    const paragraphs = text.split(/\n\n+/)
    if (paragraphs.length > 2) score += 20
    else if (paragraphs.length > 1) score += 10

    return Math.min(100, score)
  }

  /**
   * Generate text variations for DPO pairs
   */
  private generateVariation(text: string, variationType: 'enhance' | 'simplify' | 'rewrite'): string {
    // Simple variation generation
    // In production, this would use an LLM to generate variations
    switch (variationType) {
      case 'enhance':
        // Add descriptive language
        return this.enhanceText(text)
      case 'simplify':
        // Simplify text
        return this.simplifyText(text)
      case 'rewrite':
        // Rewrite with different structure
        return this.rewriteText(text)
      default:
        return text
    }
  }

  private enhanceText(text: string): string {
    // Add adjectives, adverbs, and descriptive phrases
    const enhancements: Record<string, string[]> = {
      'the': ['the magnificent', 'the stunning', 'the breathtaking'],
      'was': ['was incredibly', 'was remarkably', 'was utterly'],
      'big': ['big and imposing', 'vast and magnificent', 'enormous and awe-inspiring'],
      'small': ['small and quaint', 'tiny and delicate', 'miniature and charming'],
      'beautiful': ['beautiful and mesmerizing', 'stunningly gorgeous', 'breathtakingly lovely'],
    }

    let enhanced = text
    for (const [keyword, replacements] of Object.entries(enhancements)) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
      if (regex.test(enhanced)) {
        const replacement = replacements[Math.floor(Math.random() * replacements.length)]
        enhanced = enhanced.replace(regex, replacement)
      }
    }

    return enhanced
  }

  private simplifyText(text: string): string {
    // Remove adjectives, adverbs, and complex structures
    const simplifications: Record<string, string> = {
      'magnificent': 'big',
      'stunningly': '',
      'breathtakingly': '',
      'incredibly': '',
      'remarkably': '',
      'and was': ',',
    }

    let simplified = text
    for (const [complex, simple] of Object.entries(simplifications)) {
      const regex = new RegExp(complex, 'gi')
      simplified = simplified.replace(regex, simple)
    }

    return simplified.trim()
  }

  private rewriteText(text: string): string {
    // Change sentence structure (simple version)
    const sentences = text.split(/(?<=[。！？])\s*/)
    const shuffled = [...sentences].sort(() => Math.random() - 0.5)
    return shuffled.join(' ')
  }

  /**
   * Generate DPO pairs from training data
   */
  generatePairs(): DPOPair[] {
    logger.info('Generating DPO pairs...')

    const validSamples = this.trainingData.filter(sample => {
      const output = sample.output || sample.text || ''
      return output.length >= this.config.minLength && output.length <= this.config.maxLength
    })

    logger.info(`Valid samples for pairing: ${validSamples.length}/${this.trainingData.length}`)

    const pairs: DPOPair[] = []
    const attempted = new Set<string>()

    for (let i = 0; i < validSamples.length && pairs.length < this.config.sampleCount; i++) {
      const sample = validSamples[i]
      const originalText = sample.output || sample.text || ''
      const prompt = sample.instruction || sample.prompt || ''

      // Try different variation types
      const variationTypes: Array<'enhance' | 'simplify' | 'rewrite'> = ['enhance', 'simplify', 'rewrite']
      
      for (const varType of variationTypes) {
        if (pairs.length >= this.config.sampleCount) break

        const variationKey = `${i}-${varType}`
        if (attempted.has(variationKey)) continue
        attempted.add(variationKey)

        const variation = this.generateVariation(originalText, varType)
        const originalScore = this.calculateQualityScore(originalText)
        const variationScore = this.calculateQualityScore(variation)

        // Determine which is better
        let chosen: string
        let rejected: string

        if (varType === 'enhance' || (varType === 'rewrite' && variationScore > originalScore)) {
          chosen = variation
          rejected = originalText
        } else {
          chosen = originalText
          rejected = variation
        }

        // Ensure quality difference
        if (Math.abs(this.calculateQualityScore(chosen) - this.calculateQualityScore(rejected)) < 5) {
          continue // Skip if quality difference is too small
        }

        const pair: DPOPair = {
          id: crypto.randomUUID(),
          prompt,
          chosen,
          rejected,
          qualityChosen: this.calculateQualityScore(chosen),
          qualityRejected: this.calculateQualityScore(rejected),
          timestamp: new Date().toISOString(),
        }

        pairs.push(pair)
      }
    }

    logger.info(`Generated ${pairs.length} DPO pairs`)
    return pairs
  }

  /**
   * Export pairs to JSON file
   */
  exportPairs(outputPath: string): void {
    const exportData = this.pairs.map(({ id, prompt, chosen, rejected, qualityChosen, qualityRejected, timestamp }) => ({
      prompt,
      chosen,
      rejected,
      quality_score_chosen: qualityChosen,
      quality_score_rejected: qualityRejected,
      timestamp,
    }))

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8')
    logger.info(`Exported ${exportData.length} DPO pairs to ${outputPath}`)
  }

  /**
   * Get generation statistics
   */
  getStatistics(): {
    totalPairs: number
    avgChosenQuality: number
    avgRejectedQuality: number
    qualityImprovement: number
  } {
    if (this.pairs.length === 0) {
      return { totalPairs: 0, avgChosenQuality: 0, avgRejectedQuality: 0, qualityImprovement: 0 }
    }

    const totalChosen = this.pairs.reduce((sum, p) => sum + (p.qualityChosen || 0), 0)
    const totalRejected = this.pairs.reduce((sum, p) => sum + (p.qualityRejected || 0), 0)
    const avgChosen = totalChosen / this.pairs.length
    const avgRejected = totalRejected / this.pairs.length

    return {
      totalPairs: this.pairs.length,
      avgChosenQuality: Math.round(avgChosen),
      avgRejectedQuality: Math.round(avgRejected),
      qualityImprovement: Math.round(((avgChosen - avgRejected) / avgRejected) * 100),
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const program = new Command()

  program
    .name('dpo-data-generator')
    .description('Generate DPO preference pairs from training data')
    .option('--input <path>', 'Input training data file', './data/training/finetune_data.json')
    .option('--output <path>', 'Output DPO data file', './data/training/dpo_data.json')
    .option('--samples <count>', 'Maximum number of pairs to generate', '1000')
    .option('--min-length <chars>', 'Minimum text length', '50')
    .option('--max-length <chars>', 'Maximum text length', '2000')

  program.parse()

  const options = program.opts()
  const config: GenerationConfig = {
    minLength: parseInt(options.minLength),
    maxLength: parseInt(options.maxLength),
    diversityThreshold: 0.3,
    sampleCount: parseInt(options.samples),
  }

  const generator = new DPODataGenerator(config)

  try {
    // Load training data
    generator.loadData(options.input)

    // Generate pairs
    const pairs = generator.generatePairs()
    generator['pairs'] = pairs // Store pairs in generator

    // Export
    generator.exportPairs(options.output)

    // Print statistics
    const stats = generator.getStatistics()
    console.log('\n=== DPO Data Generation Statistics ===')
    console.log(`Total pairs: ${stats.totalPairs}`)
    console.log(`Average chosen quality: ${stats.avgChosenQuality}`)
    console.log(`Average rejected quality: ${stats.avgRejectedQuality}`)
    console.log(`Quality improvement: ${stats.qualityImprovement}%`)
    console.log(`Output: ${options.output}`)
    console.log('======================================\n')

  } catch (error) {
    logger.error(`Generation failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

export { DPODataGenerator, DPOPair, GenerationConfig }
