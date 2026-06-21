export interface AuthorIntent {
  primary_goal: 'excitement' | 'foreshadowing' | 'character_development' | 'worldbuilding' | 'pacing'
  破格_requests?: string[]
  emotional_tone: string
  notes?: string
}

export class AuthorIntentCapture {
  private currentIntent: AuthorIntent | null = null

  async captureFromInput(input: {
    goal?: string
    破格?: string
    tone?: string
    notes?: string
  }): Promise<AuthorIntent> {
    const intent: AuthorIntent = {
      primary_goal: this.parseGoal(input.goal),
      emotional_tone: input.tone || '自然',
      破格_requests: input.破格 ? input.破格.split(';').map(s => s.trim()) : [],
      notes: input.notes,
    }

    this.currentIntent = intent
    return intent
  }

  async captureFromSelection(goal: string, tone: string, notes?: string): Promise<AuthorIntent> {
    const intent: AuthorIntent = {
      primary_goal: this.parseGoal(goal),
      emotional_tone: tone,
      notes,
    }

    this.currentIntent = intent
    return intent
  }

  getCurrentIntent(): AuthorIntent | null {
    return this.currentIntent
  }

  clearIntent(): void {
    this.currentIntent = null
  }

  private parseGoal(goal?: string): AuthorIntent['primary_goal'] {
    const goalMap: Record<string, AuthorIntent['primary_goal']> = {
      'excitement': 'excitement',
      '爽点': 'excitement',
      'foreshadowing': 'foreshadowing',
      '伏笔': 'foreshadowing',
      'character_development': 'character_development',
      '角色塑造': 'character_development',
      'worldbuilding': 'worldbuilding',
      '世界观': 'worldbuilding',
      'pacing': 'pacing',
      '节奏': 'pacing',
    }

    if (!goal) return 'excitement'
    return goalMap[goal] || 'excitement'
  }

  async generateIntentPrompt(): Promise<string> {
    if (!this.currentIntent) {
      return ''
    }

    const intent = this.currentIntent
    let prompt = `[作者意图 - 最高优先级]\n`
    prompt += `本章主要目标: ${this.getGoalDescription(intent.primary_goal)}\n`
    prompt += `情绪基调: ${intent.emotional_tone}\n`
    
    if (intent.破格_requests && intent.破格_requests.length > 0) {
      prompt += `破格请求: ${intent.破格_requests.join('; ')}\n`
      prompt += `注意: 当破格请求与系统规则冲突时，以作者意图为准。\n`
    }
    
    if (intent.notes) {
      prompt += `特别说明: ${intent.notes}\n`
    }

    return prompt
  }

  private getGoalDescription(goal: AuthorIntent['primary_goal']): string {
    const descriptions: Record<AuthorIntent['primary_goal'], string> = {
      excitement: '创造爽点，让读者兴奋',
      foreshadowing: '埋设伏笔，为后续铺垫',
      character_development: '深化角色，展现成长',
      worldbuilding: '扩展世界观，丰富设定',
      pacing: '控制节奏，张弛有度',
    }
    return descriptions[goal]
  }
}
