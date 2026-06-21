import { StateManager } from '../state/manager.js'

export interface ChapterRhythm {
  chapter_number: number
  hook_strength: number
  cool_points: { type: string; intensity: number; paragraph: number }[]
  micro_payoffs: number
  emotional_curve: number[]
  pace_alerts: string[]
  reading_debt_snapshot: number
}

export interface RhythmAnalysis {
  avgHookStrength: number
  coolPointDensity: number
  debtTrend: 'increasing' | 'stable' | 'decreasing'
  alerts: string[]
}

export class RhythmSystem {
  private stateManager: StateManager

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }

  async analyzeChapter(chapterNumber: number, text: string): Promise<ChapterRhythm> {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)
    
    const hookStrength = this.calculateHookStrength(text)
    const coolPoints = this.detectCoolPoints(paragraphs)
    const microPayoffs = this.countMicroPayoffs(text)
    const emotionalCurve = this.calculateEmotionalCurve(paragraphs)
    const paceAlerts = this.detectPaceAlerts(text)
    const readingDebt = await this.calculateReadingDebt(chapterNumber)

    const rhythm: ChapterRhythm = {
      chapter_number: chapterNumber,
      hook_strength: hookStrength,
      cool_points: coolPoints,
      micro_payoffs: microPayoffs,
      emotional_curve: emotionalCurve,
      pace_alerts: paceAlerts,
      reading_debt_snapshot: readingDebt,
    }

    await this.saveRhythm(chapterNumber, rhythm)
    return rhythm
  }

  private calculateHookStrength(text: string): number {
    const lastParagraph = text.split(/\n\n+/).pop() || ''
    let strength = 0.5

    if (lastParagraph.includes('？')) strength += 0.15
    if (lastParagraph.includes('...')) strength += 0.1
    if (lastParagraph.includes('突然')) strength += 0.1
    if (lastParagraph.includes('竟然')) strength += 0.1
    if (lastParagraph.length > 50 && lastParagraph.length < 200) strength += 0.05

    return Math.min(1, strength)
  }

  private detectCoolPoints(paragraphs: string[]): { type: string; intensity: number; paragraph: number }[] {
    const coolPoints: { type: string; intensity: number; paragraph: number }[] = []
    const patterns = [
      { regex: /打脸|反杀|碾压/g, type: '打脸', intensity: 0.9 },
      { regex: /突破|晋升|升级/g, type: '突破', intensity: 0.85 },
      { regex: /获得|得到|捡漏/g, type: '获得', intensity: 0.7 },
      { regex: /震惊|不敢相信|目瞪口呆/g, type: '震惊', intensity: 0.75 },
    ]

    paragraphs.forEach((p, i) => {
      for (const { regex, type, intensity } of patterns) {
        if (regex.test(p)) {
          coolPoints.push({ type, intensity, paragraph: i + 1 })
        }
      }
    })

    return coolPoints
  }

  private countMicroPayoffs(text: string): number {
    const patterns = [/笑/g, /冷笑/g, /满意/g, /成功/g, /胜利/g]
    let count = 0
    for (const pattern of patterns) {
      count += (text.match(pattern) || []).length
    }
    return count
  }

  private calculateEmotionalCurve(paragraphs: string[]): number[] {
    return paragraphs.map(p => {
      let emotion = 0.5
      if (/愤怒|怒|恨/g.test(p)) emotion += 0.3
      if (/高兴|喜|笑/g.test(p)) emotion += 0.2
      if (/悲伤|哭|泪/g.test(p)) emotion -= 0.2
      if (/紧张|害怕|恐惧/g.test(p)) emotion -= 0.1
      return Math.max(0, Math.min(1, emotion))
    })
  }

  private detectPaceAlerts(text: string): string[] {
    const alerts: string[] = []
    const paragraphs = text.split(/\n\n+/)
    
    const longParagraphs = paragraphs.filter(p => p.replace(/\s/g, '').length > 300)
    if (longParagraphs.length > 2) {
      alerts.push('连续多段过长，节奏可能拖沓')
    }

    const dialogueRatio = (text.match(/["「『]/g) || []).length / paragraphs.length
    if (dialogueRatio < 0.1) alerts.push('对话过少')
    if (dialogueRatio > 0.6) alerts.push('对话过多')

    return alerts
  }

  private async calculateReadingDebt(chapterNumber: number): Promise<number> {
    try {
      const rhythmMap = await this.stateManager.read('rhythm_map')
      const recentChapters = rhythmMap.chapters.slice(-5)
      const avgCoolPoints = recentChapters.reduce((sum: number, c: ChapterRhythm) => sum + c.micro_payoffs, 0) / Math.max(1, recentChapters.length)
      return Math.max(0, 3 - avgCoolPoints)
    } catch {
      return 0
    }
  }

  private async saveRhythm(chapter: number, rhythm: ChapterRhythm): Promise<void> {
    try {
      const rhythmMap = await this.stateManager.read('rhythm_map')
      const existingIndex = rhythmMap.chapters.findIndex((c: ChapterRhythm) => c.chapter_number === chapter)
      
      if (existingIndex >= 0) {
        rhythmMap.chapters[existingIndex] = rhythm
      } else {
        rhythmMap.chapters.push(rhythm)
      }
      
      rhythmMap.last_updated = new Date().toISOString()
      await this.stateManager.write('rhythm_map', rhythmMap)
    } catch {
      await this.stateManager.write('rhythm_map', {
        chapters: [rhythm],
        overall_metrics: {
          avg_hook_strength: rhythm.hook_strength,
          avg_cool_point_density: rhythm.cool_points.length / 10,
          total_payoffs: rhythm.micro_payoffs,
          debt_trend: 'stable',
        },
        last_updated: new Date().toISOString(),
      })
    }
  }

  async getAnalysis(): Promise<RhythmAnalysis> {
    try {
      const rhythmMap = await this.stateManager.read('rhythm_map')
      const chapters = rhythmMap.chapters as ChapterRhythm[]
      
      if (chapters.length === 0) {
        return { avgHookStrength: 0.5, coolPointDensity: 0, debtTrend: 'stable', alerts: [] }
      }

      const avgHookStrength = chapters.reduce((sum, c) => sum + c.hook_strength, 0) / chapters.length
      const totalCoolPoints = chapters.reduce((sum, c) => sum + c.cool_points.length, 0)
      const coolPointDensity = totalCoolPoints / chapters.length

      const recentDebt = chapters.slice(-5).map(c => c.reading_debt_snapshot)
      const debtTrend = recentDebt.length < 2 ? 'stable' :
        recentDebt[recentDebt.length - 1] > recentDebt[0] ? 'increasing' : 'decreasing'

      const alerts = chapters.slice(-3).flatMap(c => c.pace_alerts)

      return { avgHookStrength, coolPointDensity, debtTrend, alerts }
    } catch {
      return { avgHookStrength: 0.5, coolPointDensity: 0, debtTrend: 'stable', alerts: [] }
    }
  }
}
