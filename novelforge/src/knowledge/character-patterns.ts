export interface CharacterPattern {
  type: string
  traits: string[]
  writing_instructions: string
  typical_arcs: string[]
}

export const protagonistPatterns: CharacterPattern[] = [
  {
    type: '成长型',
    traits: ['初始弱小', '逐渐变强', '有明确成长弧线'],
    writing_instructions: '展示主角从弱到强的过程，每次突破都有合理铺垫',
    typical_arcs: ['废柴逆袭', '重生复仇', '系统觉醒'],
  },
  {
    type: '无敌型',
    traits: ['初始即强', '碾压对手', '爽感为主'],
    writing_instructions: '重点展示实力差距带来的爽感，配角的震惊反应',
    typical_arcs: ['装逼打脸', '幕后黑手', '回归都市'],
  },
]

export const villainPatterns: CharacterPattern[] = [
  {
    type: '阴谋型',
    traits: ['善于算计', '背后势力', '步步紧逼'],
    writing_instructions: '通过对话和暗示展示阴谋，让读者感受到威胁',
    typical_arcs: ['暗中布局', '势力对决', '最终覆灭'],
  },
  {
    type: '实力型',
    traits: ['直接对抗', '正面冲突', '以力压人'],
    writing_instructions: '通过战斗描写展示实力差距，制造压迫感',
    typical_arcs: ['初次冲突', '实力碾压', '被反杀'],
  },
]

export const supportingPatterns: CharacterPattern[] = [
  {
    type: '导师',
    traits: ['提供指导', '关键时刻出现', '传授技能'],
    writing_instructions: '关键时刻出现，给予主角帮助或提示',
    typical_arcs: ['初次相遇', '传授技能', '功成身退'],
  },
  {
    type: '红颜',
    traits: ['感情线', '情感支持', '共同成长'],
    writing_instructions: '展示与主角的互动，推进感情线',
    typical_arcs: ['初遇', '误会', '相知', '在一起'],
  },
  {
    type: '兄弟',
    traits: ['忠诚', '义气', '并肩作战'],
    writing_instructions: '展示忠诚和义气，关键时刻并肩作战',
    typical_arcs: ['结识', '共患难', '各自成长'],
  },
]

export class CharacterPatternManager {
  getPattern(type: string, category: 'protagonist' | 'villain' | 'supporting'): CharacterPattern | undefined {
    const patterns = category === 'protagonist' 
      ? protagonistPatterns 
      : category === 'villain' 
        ? villainPatterns 
        : supportingPatterns
    
    return patterns.find(p => p.type === type)
  }

  getAllPatterns(category: 'protagonist' | 'villain' | 'supporting'): CharacterPattern[] {
    return category === 'protagonist' 
      ? protagonistPatterns 
      : category === 'villain' 
        ? villainPatterns 
        : supportingPatterns
  }

  /**
   * Infer the best matching character pattern based on character data.
   * Uses role and traits to guess the archetype.
   */
  inferPattern(char: { name: string; role?: string; items?: string[]; power?: string; location?: string; mood?: string; status?: string }): CharacterPattern | null {
    const role = char.role || '配角'

    // Match by role
    if (role === '主角') {
      // If power level is high, likely "无敌型", otherwise "成长型"
      if (char.power && /无敌|巅峰|至高|无敌|至强|大能/.test(char.power)) {
        return protagonistPatterns.find(p => p.type === '无敌型') || null
      }
      return protagonistPatterns.find(p => p.type === '成长型') || null
    }

    if (role === '反派') {
      return villainPatterns.find(p => p.type === '阴谋型') || null
    }

    if (role === '导师' || role === '师父') {
      return supportingPatterns.find(p => p.type === '导师') || null
    }

    if (role === '红颜' || role === '女主' || role === '恋人') {
      return supportingPatterns.find(p => p.type === '红颜') || null
    }

    if (role === '兄弟' || role === '搭档' || role === '战友') {
      return supportingPatterns.find(p => p.type === '兄弟') || null
    }

    return null
  }
}
