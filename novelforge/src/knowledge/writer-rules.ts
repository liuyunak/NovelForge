import type { WritingRule } from '../types/index.js'

export const defaultWritingRules: WritingRule[] = [
  {
    id: 'rule_001',
    category: '节奏',
    rule: '每1000字至少包含1个微冲突或信息增量',
    weight: 0.7,
    confidence: 0.6,
    source: 'builtin',
    genre_overrides: { '玄幻': 0.8, '悬疑': 0.5 },
    audit_dimension: 25,
  },
  {
    id: 'rule_002',
    category: '对话',
    rule: '对话占比20%-40%，每段对话≤200字',
    weight: 0.7,
    confidence: 0.7,
    source: 'builtin',
    audit_dimension: 8,
  },
  {
    id: 'rule_003',
    category: '描写',
    rule: '环境描写每章≤500字，须与剧情/情绪关联',
    weight: 0.7,
    confidence: 0.6,
    source: 'builtin',
    audit_dimension: 12,
  },
  {
    id: 'rule_004',
    category: '视角',
    rule: '单章视角切换≤2次',
    weight: 0.8,
    confidence: 0.8,
    source: 'builtin',
    audit_dimension: 4,
  },
  {
    id: 'rule_005',
    category: '爽点',
    rule: '每3000字≥1个爽点，类型不得与前章完全重复',
    weight: 0.6,
    confidence: 0.5,
    source: 'builtin',
    genre_overrides: { '玄幻': 0.7, '悬疑': 0.3 },
    audit_dimension: 29,
  },
  {
    id: 'rule_006',
    category: '章末',
    rule: '最后3段必须包含悬念/期待/冲突元素之一',
    weight: 0.9,
    confidence: 0.9,
    source: 'builtin',
    audit_dimension: 30,
  },
  {
    id: 'rule_007',
    category: '段落',
    rule: '禁止连续3段以上均为纯叙述',
    weight: 0.7,
    confidence: 0.6,
    source: 'builtin',
    audit_dimension: 26,
  },
  {
    id: 'rule_008',
    category: '开场',
    rule: '前300字必须出现具体事件或冲突',
    weight: 0.8,
    confidence: 0.7,
    source: 'builtin',
    audit_dimension: 27,
  },
]

export class WriterRulesManager {
  private rules: WritingRule[]

  constructor() {
    this.rules = [...defaultWritingRules]
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
    }
  }

  onAuthorApply(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId)
    if (rule) {
      rule.weight = Math.min(1.0, rule.weight + 0.05)
    }
  }
}
