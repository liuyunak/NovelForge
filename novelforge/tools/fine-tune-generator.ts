import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../src/logger.js'

/**
 * Training sample for fine-tuning the novel writing model.
 */
interface TrainingSample {
  instruction: string
  input: string
  output: string
  quality_score: number
  genre: string
  chapter_range: [number, number]
}

/**
 * Generation statistics report.
 */
interface GenerationReport {
  total_processed: number
  total_generated: number
  total_filtered: number
  samples_by_genre: Record<string, number>
  avg_quality_score: number
  processing_time_ms: number
  input_books: number
  input_chapters: number
  input_words: number
}

/**
 * Fine-tune Data Generator
 * 
 * Generates high-quality training data from processed novel books
 * for LoRA fine-tuning of the Qwen model.
 * 
 * Usage:
 *   npx tsx tools/fine-tune-generator.ts [--input ./data/processed] [--output ./data/training] [--max-samples 50000]
 */
export class FineTuneDataGenerator {
  private processedPath: string
  private outputPath: string
  private maxSamples: number
  private minChapterLength: number
  private minSceneLength: number

  constructor(
    processedPath: string = './data/processed',
    outputPath: string = './data/training',
    maxSamples: number = 50000,
    minChapterLength: number = 200,
    minSceneLength: number = 100
  ) {
    this.processedPath = processedPath
    this.outputPath = outputPath
    this.maxSamples = maxSamples
    this.minChapterLength = minChapterLength
    this.minSceneLength = minSceneLength
  }

  /**
   * Main entry point: generate training data from processed books.
   */
  async generate(): Promise<GenerationReport> {
    const startTime = Date.now()
    logger.info('Starting fine-tune data generation...')

    // Validate input path
    if (!fs.existsSync(this.processedPath)) {
      logger.error(`Input directory not found: ${this.processedPath}`)
      logger.info('Please run: pnpm run knowledge:process first')
      throw new Error(`Input directory not found: ${this.processedPath}`)
    }

    const samples: TrainingSample[] = []
    let totalProcessed = 0
    let totalChapters = 0
    let totalWords = 0
    const samplesByGenre: Record<string, number> = {}

    // Read all genre directories
    const genres = fs.readdirSync(this.processedPath).filter(entry => {
      const fullPath = path.join(this.processedPath, entry)
      return fs.statSync(fullPath).isDirectory()
    })

    logger.info(`Found ${genres.length} genre(s) to process`)

    for (const genre of genres) {
      const genrePath = path.join(this.processedPath, genre)
      const files = fs.readdirSync(genrePath)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(genrePath, f))

      logger.info(`Processing genre "${genre}": ${files.length} book(s)`)

      for (const filePath of files) {
        try {
          const bookData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          const bookSamples = this.extractSamples(bookData, genre)
          
          samples.push(...bookSamples)
          totalProcessed += bookData.chapters?.length || 0
          totalChapters += bookData.chapters?.length || 0
          totalWords += bookData.stats?.totalWords || 0
          samplesByGenre[genre] = (samplesByGenre[genre] || 0) + bookSamples.length
        } catch (error) {
          logger.warn(`Failed to process ${filePath}: ${error}`)
        }
      }
    }

    const totalTime = Date.now() - startTime

    // Shuffle and filter
    const shuffled = this.shuffleArray(samples)
    const filtered = shuffled.slice(0, this.maxSamples)

    // Calculate average quality score
    const avgQualityScore = filtered.length > 0
      ? filtered.reduce((sum, s) => sum + s.quality_score, 0) / filtered.length
      : 0

    const report: GenerationReport = {
      total_processed: totalProcessed,
      total_generated: filtered.length,
      total_filtered: samples.length - filtered.length,
      samples_by_genre: samplesByGenre,
      avg_quality_score: Math.round(avgQualityScore * 100) / 100,
      processing_time_ms: totalTime,
      input_books: genres.length > 0 ? samplesByGenre[genres[0]] ? 0 : 0 : 0, // Will be corrected below
      input_chapters: totalChapters,
      input_words: totalWords,
    }

    // Count unique books
    report.input_books = genres.reduce((count, genre) => {
      const genrePath = path.join(this.processedPath, genre)
      return count + fs.readdirSync(genrePath).filter(f => f.endsWith('.json')).length
    }, 0)

    // Write output
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true })
    }

    const outputPath = path.join(this.outputPath, 'finetune_data.json')
    fs.writeFileSync(outputPath, JSON.stringify(filtered, null, 2))

    // Write metadata
    const metadataPath = path.join(this.outputPath, 'generation-metadata.json')
    fs.writeFileSync(metadataPath, JSON.stringify(report, null, 2))

    // Log summary
    logger.info('=== Fine-tune Data Generation Complete ===')
    logger.info(`Input: ${report.input_books} book(s), ${report.input_chapters} chapter(s), ${report.input_words.toLocaleString()} words`)
    logger.info(`Generated: ${report.total_generated} training samples (avg quality: ${report.avg_quality_score})`)
    logger.info(`Filtered: ${report.total_filtered} samples (kept top ${report.total_generated})`)
    logger.info(`By genre: ${Object.entries(report.samples_by_genre).map(([k, v]) => `"${k}": ${v}`).join(', ')}`)
    logger.info(`Processing time: ${(totalTime / 1000).toFixed(2)}s`)
    logger.info(`Output: ${outputPath}`)
    logger.info(`Metadata: ${metadataPath}`)

    return report
  }

  /**
   * Extract training samples from a processed book.
   */
  private extractSamples(bookData: any, genre: string): TrainingSample[] {
    const samples: TrainingSample[] = []
    const chapters = bookData.chapters || []

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      const prevChapter = i > 0 ? chapters[i - 1] : null

      if (!chapter || chapter.content.length < this.minChapterLength) continue

      const scenes = this.splitIntoScenes(chapter.content)
      const chapterRange: [number, number] = [Math.max(1, i - 1), Math.min(chapters.length, i + 1)]

      for (const scene of scenes) {
        if (scene.length < this.minSceneLength) continue

        const sample = this.createSample(scene, prevChapter?.content || '', genre, chapterRange)
        if (sample) {
          samples.push(sample)
        }
      }
    }

    return samples
  }

  /**
   * Split chapter content into scenes.
   */
  private splitIntoScenes(content: string): string[] {
    const splits = content.split(/\n\n\n|\*\*\*|---/)
    return splits.map(s => s.trim()).filter(s => s.length > 0)
  }

  /**
   * Create a training sample from a scene.
   */
  private createSample(
    scene: string,
    context: string,
    genre: string,
    chapterRange: [number, number]
  ): TrainingSample | null {
    if (scene.length < this.minSceneLength || scene.length > 3000) return null

    const qualityScore = this.assessQuality(scene)
    const instruction = this.generateInstruction(scene, genre)
    const input = this.generateInput(scene, context)

    return {
      instruction,
      input,
      output: scene,
      quality_score: qualityScore,
      genre,
      chapter_range: chapterRange,
    }
  }

  /**
   * Assess writing quality (0-10 scale).
   */
  private assessQuality(text: string): number {
    let score = 5.0 // Base score

    // Dialogue presence (good for writing style)
    const dialogueRatio = (text.match(/["「『]/g) || []).length / Math.max(text.length / 100, 1)
    if (dialogueRatio > 0.3) score += 1.0

    // Action verbs
    const actionCount = (text.match(/了|着|过|起|走|跑|打|说|问|答/g) || []).length
    if (actionCount > 5) score += 0.5

    // Description richness
    const descCount = (text.match(/的|地|得|如|像|似/g) || []).length
    if (descCount > 10) score += 0.5

    // Penalize very short or repetitive text
    if (text.length < 200) score -= 1.0
    const uniqueChars = new Set(text).size
    if (uniqueChars / text.length < 0.3) score -= 1.0 // Too repetitive

    return Math.max(1.0, Math.min(10.0, score))
  }

  /**
   * Generate instruction based on scene characteristics.
   */
  private generateInstruction(scene: string, genre: string): string {
    const hasDialogue = /["「『]/.test(scene)
    const hasAction = /了|着|过/.test(scene)
    const hasDescription = /的|地|得/.test(scene)

    if (hasDialogue && hasAction) {
      return `以${genre}风格写一段包含对话和动作的场景，注意节奏把控`
    } else if (hasDialogue) {
      return `以${genre}风格写一段对话场景，突出人物性格`
    } else if (hasDescription) {
      return `以${genre}风格写一段环境描写，营造氛围`
    } else {
      return `以${genre}风格写一段叙事，推进情节发展`
    }
  }

  /**
   * Generate input context for the sample.
   */
  private generateInput(scene: string, context: string): string {
    const firstSentence = scene.split(/[。！？]/)[0]
    return `前文摘要：${context.slice(-300)}\n期望开头：${firstSentence}`
  }

  /**
   * Fisher-Yates shuffle.
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }
}

/**
 * CLI entry point.
 */
export async function main() {
  const args = process.argv.slice(2)
  
  const options = {
    input: './data/processed',
    output: './data/training',
    maxSamples: 50000,
  }

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        options.input = args[++i]
        break
      case '--output':
        options.output = args[++i]
        break
      case '--max-samples':
        options.maxSamples = parseInt(args[++i]) || 50000
        break
      case '--help':
        console.log(`
Usage: npx tsx tools/fine-tune-generator.ts [options]

Options:
  --input <path>       Input directory with processed books (default: ./data/processed)
  --output <path>      Output directory for training data (default: ./data/training)
  --max-samples <n>    Maximum samples to generate (default: 50000)
  --help               Show this help message
        `)
        process.exit(0)
    }
  }

  const generator = new FineTuneDataGenerator(options.input, options.output, options.maxSamples)
  
  try {
    const report = await generator.generate()
    
    // Exit with error if no samples generated
    if (report.total_generated === 0) {
      logger.error('No training samples generated. Check input data.')
      process.exit(1)
    }
  } catch (error) {
    logger.error(`Generation failed: ${error}`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
