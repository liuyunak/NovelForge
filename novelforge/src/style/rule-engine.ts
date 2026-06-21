import { StateManager } from '../state/manager.js'
import { defaultWritingRules } from '../knowledge/writer-rules.js'
import type { WritingRule } from '../types/index.js'
import { logger } from '../logger.js'

export interface RuleFeedback {
  ruleId: string
  action: 'override' | 'apply' | 'audit_feedback'
  timestamp: string
}

export class RuleEngine {
  private stateManager: StateManager
  private rules: WritingRule[]
  private feedbackHistory: RuleFeedback[]

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
    this.rules = this.getDefaultRules()
    this.feedbackHistory = []
  }

  private getDefaultRules(): WritingRule[] {
    return [...defaultWritingRules]
  }

  getActiveRules(genre: string): WritingRule[] {
    return this.rules
      .map(rule => ({
        ...rule,
        effective_weight: rule.genre_overrides?.[genre] ?? rule.weight,
      }))
      .filter(rule => rule.effective_weight > 0.3)
  }

  onAuthorOverride(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId)
    if (rule) {
      rule.weight = Math.max(0.1, rule.weight - 0.1)
      rule.source = 'author'
      this.feedbackHistory.push({ ruleId, action: 'override', timestamp: new Date().toISOString() })
      logger.debug(`Rule ${ruleId} weight decreased to ${rule.weight}`)
    }
  }

  onAuthorApply(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId)
    if (rule) {
      rule.weight = Math.min(1.0, rule.weight + 0.05)
      this.feedbackHistory.push({ ruleId, action: 'apply', timestamp: new Date().toISOString() })
      logger.debug(`Rule ${ruleId} weight increased to ${rule.weight}`)
    }
  }

  onAuditFeedback(ruleId: string, passed: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId)
    if (rule) {
      if (passed) {
        rule.confidence = Math.min(1.0, rule.confidence + 0.05)
      } else {
        rule.confidence = Math.max(0.1, rule.confidence - 0.1)
      }
      this.feedbackHistory.push({ ruleId, action: 'audit_feedback', timestamp: new Date().toISOString() })
    }
  }

  async calibrateToGenre(genre: string, referenceStats: Record<string, number>): Promise<void> {
    for (const rule of this.rules) {
      if (referenceStats[rule.category]) {
        const actualDensity = referenceStats[rule.category]
        const expectedDensity = rule.weight
        
        if (actualDensity < expectedDensity * 0.8) {
          if (!rule.genre_overrides) rule.genre_overrides = {}
          rule.genre_overrides[genre] = rule.weight * 0.8
        } else if (actualDensity > expectedDensity * 1.2) {
          if (!rule.genre_overrides) rule.genre_overrides = {}
          rule.genre_overrides[genre] = Math.min(1.0, rule.weight * 1.2)
        }
      }
    }
  }

  getRuleStats(): { totalRules: number; avgWeight: number; avgConfidence: number } {
    const totalRules = this.rules.length
    const avgWeight = this.rules.reduce((sum, r) => sum + r.weight, 0) / totalRules
    const avgConfidence = this.rules.reduce((sum, r) => sum + r.confidence, 0) / totalRules
    return { totalRules, avgWeight, avgConfidence }
  }
}
