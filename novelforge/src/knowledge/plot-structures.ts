export interface PlotStructure {
  name: string
  phases: PlotPhase[]
}

export interface PlotPhase {
  name: string
  proportion: string
  key_elements: string[]
  writing_tips: string
}

export const threeActStructure: PlotStructure = {
  name: '三幕结构',
  phases: [
    {
      name: '建置',
      proportion: '25%',
      key_elements: ['世界观建立', '角色介绍', '初始冲突', '触发事件'],
      writing_tips: '快速建立代入感，让读者关心主角',
    },
    {
      name: '对抗',
      proportion: '50%',
      key_elements: ['主角尝试', '遭遇挫折', '获得帮助', '最终对决'],
      writing_tips: '持续升级冲突，保持节奏张弛有度',
    },
    {
      name: '解决',
      proportion: '25%',
      key_elements: ['最终对决', '高潮', '结局', '余韵'],
      writing_tips: '给出满意结局，埋下续集伏笔（可选）',
    },
  ],
}

export interface GenreStructure {
  genre: string
  typical_arcs: string[]
  satisfaction_points: string[]
}

export const genreStructures: GenreStructure[] = [
  {
    genre: '玄幻修仙',
    typical_arcs: ['入门', '历练', '突破', '大战', '飞升'],
    satisfaction_points: ['越级战斗', '获得宝物', '突破境界', '打脸反派'],
  },
  {
    genre: '都市重生',
    typical_arcs: ['重生觉醒', '弥补遗憾', '商业崛起', '感情发展', '终极复仇'],
    satisfaction_points: ['先知优势', '打脸势利眼', '商业成功', '感情修成正果'],
  },
  {
    genre: '科幻末世',
    typical_arcs: ['末世降临', '生存挣扎', '建立势力', '探索真相', '人类复兴'],
    satisfaction_points: ['获得能力', '建立基地', '打败强敌', '发现真相'],
  },
  {
    genre: '悬疑灵异',
    typical_arcs: ['诡异事件', '深入调查', '真相浮现', '最终对决', '真相大白'],
    satisfaction_points: ['破解谜题', '发现线索', '打败恶灵', '真相震撼'],
  },
]

export class PlotStructureManager {
  getStructure(name: string): PlotStructure | undefined {
    if (name === '三幕结构') return threeActStructure
    return undefined
  }

  getGenreStructure(genre: string): GenreStructure | undefined {
    return genreStructures.find(g => g.genre === genre)
  }

  getAllGenreStructures(): GenreStructure[] {
    return genreStructures
  }
}
