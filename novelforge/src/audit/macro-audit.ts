import { StateManager } from '../state/manager.js'
import { ModelRouter } from '../router.js'

export interface MacroAuditResult {
  blockNumber: number
  chaptersAudited: number
  overallScore: number
  issues: MacroIssue[]
  recommendations: string[]
}

export interface MacroIssue {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  affectedChapters: number[]
}

export class MacroAudit {
  private stateManager: StateManager
  private router: ModelRouter

  constructor(stateManager: StateManager, router: ModelRouter) {
    this.stateManager = stateManager
    this.router = router
  }

  async auditBlock(blockNumber: number, chapters: string[]): Promise<MacroAuditResult> {
    const issues: MacroIssue[] = []
    const recommendations: string[] = []

    const consistencyIssues = await this.checkConsistency(chapters)
    issues.push(...consistencyIssues)

    const pacingIssues = this.checkPacing(chapters)
    issues.push(...pacingIssues)

    const hookIssues = await this.checkHookHealth(chapters)
    issues.push(...hookIssues)

    const overallScore = this.calculateScore(issues)

    if (overallScore < 0.7) {
      recommendations.push('整体质量偏低，建议人工审查关键章节')
    }
    if (issues.filter(i => i.severity === 'high').length > 2) {
      recommendations.push('存在多个高严重度问题，建议暂停自动写作')
    }

    return {
      blockNumber,
      chaptersAudited: chapters.length,
      overallScore,
      issues,
      recommendations,
    }
  }

  private async checkConsistency(chapters: string[]): Promise<MacroIssue[]> {
    const issues: MacroIssue[] = []
    
    try {
      const characters = await this.stateManager.read('characters')
      const characterNames = characters.characters.map((c: any) => c.name)
      
      const mentionedCharacters = new Set<string>()
      for (let i = 0; i < chapters.length; i++) {
        for (const name of characterNames) {
          if (chapters[i].includes(name)) {
            mentionedCharacters.add(name)
          }
        }
      }

      for (const name of characterNames) {
        if (!mentionedCharacters.has(name)) {
          issues.push({
            type: 'character_absence',
            severity: 'medium',
            description: `角色 ${name} 在整个块中未出现`,
            affectedChapters: [],
          })
        }
      }
    } catch {
      // Skip character check
    }

    return issues
  }

  private checkPacing(chapters: string[]): MacroIssue[] {
    const issues: MacroIssue[] = []
    
    if (chapters.length === 0) return issues
    
    const wordCounts = chapters.map(ch => ch.replace(/\s/g, '').length)
    const avgWordCount = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
    
    const variance = wordCounts.reduce((sum, wc) => sum + Math.pow(wc - avgWordCount, 2), 0) / wordCounts.length
    const stdDev = Math.sqrt(variance)
    
    if (stdDev > avgWordCount * 0.3) {
      issues.push({
        type: 'pacing_inconsistency',
        severity: 'medium',
        description: '章节字数波动较大，节奏不均匀',
        affectedChapters: [],
      })
    }

    const shortChapters = wordCounts.filter(wc => wc < 2000).length
    if (shortChapters > chapters.length * 0.3) {
      issues.push({
        type: 'short_chapters',
        severity: 'low',
        description: `${shortChapters} 个章节字数偏少`,
        affectedChapters: [],
      })
    }

    return issues
  }

  private async checkHookHealth(chapters: string[]): Promise<MacroIssue[]> {
    const issues: MacroIssue[] = []
    
    const lastChapter = chapters[chapters.length - 1]
    if (lastChapter) {
      const lastParagraph = lastChapter.split(/\n\n+/).pop() || ''
      if (!lastParagraph.includes('？') && !lastParagraph.includes('...') && !lastParagraph.includes('突然')) {
        issues.push({
          type: 'weak_hook',
          severity: 'medium',
          description: '块末章节钩子较弱',
          affectedChapters: [chapters.length],
        })
      }
    }

    return issues
  }

  private calculateScore(issues: MacroIssue[]): number {
    let score = 1.0
    
    for (const issue of issues) {
      switch (issue.severity) {
        case 'high': score -= 0.2; break
        case 'medium': score -= 0.1; break
        case 'low': score -= 0.05; break
      }
    }

    return Math.max(0, Math.min(1, score))
  }
}
