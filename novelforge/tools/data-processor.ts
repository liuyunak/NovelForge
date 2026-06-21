import * as fs from 'fs'
import * as path from 'path'

interface ProcessedBook {
  id: string
  title: string
  genre: string
  chapters: ProcessedChapter[]
  stats: BookStats
}

interface ProcessedChapter {
  number: number
  title: string
  content: string
  wordCount: number
  dialogueRatio: number
  sceneCount: number
}

interface BookStats {
  totalChapters: number
  totalWords: number
  avgChapterLength: number
  avgDialogueRatio: number
}

export class DataProcessor {
  private rawBooksPath: string
  private processedPath: string

  constructor(rawBooksPath: string, processedPath: string) {
    this.rawBooksPath = rawBooksPath
    this.processedPath = processedPath
  }

  async processAllBooks(): Promise<ProcessedBook[]> {
    const books: ProcessedBook[] = []
    
    const genres = fs.readdirSync(this.rawBooksPath)
    
    for (const genre of genres) {
      const genrePath = path.join(this.rawBooksPath, genre)
      if (!fs.statSync(genrePath).isDirectory()) continue
      
      const files = fs.readdirSync(genrePath).filter(f => f.endsWith('.txt'))
      
      for (const file of files) {
        const book = await this.processBook(path.join(genrePath, file), genre)
        if (book) {
          books.push(book)
        }
      }
    }
    
    return books
  }

  async processBook(filePath: string, genre: string): Promise<ProcessedBook | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const title = path.basename(filePath, '.txt')
      
      const chapters = this.splitChapters(content)
      
      const book: ProcessedBook = {
        id: path.basename(filePath, '.txt'),
        title,
        genre,
        chapters,
        stats: this.calculateStats(chapters),
      }
      
      const outputPath = path.join(this.processedPath, genre, `${book.id}.json`)
      const outputDir = path.dirname(outputPath)
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      
      fs.writeFileSync(outputPath, JSON.stringify(book, null, 2))
      
      return book
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error)
      return null
    }
  }

  private splitChapters(content: string): ProcessedChapter[] {
    const chapters: ProcessedChapter[] = []
    const chapterRegex = /第[一二三四五六七八九十百千\d]+章|Chapter\s+\d+/gi
    const splits = content.split(chapterRegex)
    
    let chapterNumber = 1
    for (let i = 1; i < splits.length; i++) {
      const chapterContent = splits[i].trim()
      if (chapterContent.length < 100) continue
      
      chapters.push({
        number: chapterNumber,
        title: `Chapter ${chapterNumber}`,
        content: chapterContent,
        wordCount: this.countWords(chapterContent),
        dialogueRatio: this.calculateDialogueRatio(chapterContent),
        sceneCount: this.estimateSceneCount(chapterContent),
      })
      
      chapterNumber++
    }
    
    return chapters
  }

  private countWords(text: string): number {
    return text.replace(/\s/g, '').length
  }

  private calculateDialogueRatio(text: string): number {
    const dialogueMatches = text.match(/["「『【].*?["」』】]/gs) || []
    const dialogueLength = dialogueMatches.reduce((sum, m) => sum + m.length, 0)
    return dialogueLength / text.length
  }

  private estimateSceneCount(text: string): number {
    const sceneBreaks = text.match(/\n\n\n|\*\*\*|---/g) || []
    return sceneBreaks.length + 1
  }

  private calculateStats(chapters: ProcessedChapter[]): BookStats {
    if (chapters.length === 0) {
      return { totalChapters: 0, totalWords: 0, avgChapterLength: 0, avgDialogueRatio: 0 }
    }
    
    const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0)
    const totalDialogueRatio = chapters.reduce((sum, ch) => sum + ch.dialogueRatio, 0)
    
    return {
      totalChapters: chapters.length,
      totalWords,
      avgChapterLength: totalWords / chapters.length,
      avgDialogueRatio: totalDialogueRatio / chapters.length,
    }
  }
}

export async function main() {
  const processor = new DataProcessor('./data/raw-books', './data/processed')
  console.log('Starting data processing...')
  
  const books = await processor.processAllBooks()
  
  console.log(`Processed ${books.length} books`)
  console.log('Data processing complete!')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
