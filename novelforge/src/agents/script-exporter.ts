import * as fs from 'fs'
import * as path from 'path'

export interface ScriptScene {
  scene_id: number
  location: string
  time?: string
  shots: ScriptShot[]
}

export interface ScriptShot {
  shot_id: number
  type: 'establishing' | 'dialogue' | 'action' | 'closeup' | 'narration'
  description: string
  character?: string
  line?: string
  action?: string
  duration: number
  sfx?: string
  emotion?: string
}

export interface ScriptOutput {
  title: string
  scenes: ScriptScene[]
  metadata?: {
    source_chapter: number
    total_scenes: number
    total_shots: number
    estimated_duration_min: number
    generated_at: string
  }
}

// Emotion keyword mapping (ordered by specificity — more specific patterns first)
const EMOTION_KEYWORDS: [RegExp, string][] = [
  [/紧张|焦虑|不安|担忧|忐忑/g, 'tension'],
  [/愤怒|怒火|怒喝|咆哮|怒道|生气|愤/g, 'anger'],
  [/悲伤|流泪|哭泣|哽咽|难过|伤心|哀/g, 'sadness'],
  [/惊恐|害怕|恐惧|颤抖|战栗|畏惧|胆怯/g, 'fear'],
  [/惊讶|震惊|愣住|愕然|不可思议|难以置信/g, 'surprise'],
  [/冷静|平静|淡然|冷漠|淡淡|从容/g, 'calm'],
  [/微笑|笑道|轻笑|一笑|高兴|欣喜|喜悦|开心|兴奋|激动/g, 'joy'],
  [/轻蔑|不屑|冷哼|嘲笑|嘲讽|讥讽/g, 'contempt'],
]

// SFX keyword mapping (ordered by specificity — more specific patterns first)
const SFX_KEYWORDS: [RegExp, string][] = [
  [/雷声|雷鸣|闪电|霹雳/g, 'thunder'],
  [/碎裂|破碎|咔嚓|碎裂声/g, 'shatter'],
  [/爆炸|轰鸣|巨响|砰|轰隆/g, 'explosion'],
  [/剑鸣|剑光|铮|锵/g, 'sword'],
  [/脚步声|踏步|噔噔|咚咚/g, 'footsteps'],
  [/敲门|叩门|咚咚咚/g, 'knocking'],
  [/风声|呼啸|狂风|嗖/g, 'wind'],
  [/雨声|雨滴|淅沥|哗啦/g, 'rain'],
  [/火焰|燃烧|噼啪|烈火/g, 'fire'],
  [/钟声|钟鸣|铛/g, 'bell'],
  [/嗡|嗡嗡|轰鸣声|引擎/g, 'hum'],
  [/水滴|滴答/g, 'drip'],
  [/寂静|无声|安静|静悄悄/g, 'silence'],
]

// Narration keyword patterns
const NARRATION_PATTERNS = [
  /^(\s*)(与此同时|另一边|与此同时|镜头一转|画面一转)/,
  /^(夜色|月光|阳光|天空|大地|远处|近处|四周|周围)/,
  /^(只见|但见|放眼望去|远远望去)/,
  /^(时间|时光|岁月|光阴)/,
]

// Duration estimation (characters per second for reading subtitles)
const CHARS_PER_SECOND = 4 // ~240 chars/min, typical subtitle reading speed

export class ScriptExporterAgent {
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async export(chapterNumber: number): Promise<ScriptOutput> {
    const chapterText = await this.loadChapter(chapterNumber)
    if (!chapterText) {
      throw new Error(`Chapter ${chapterNumber} not found`)
    }

    const scenes = this.convertToScript(chapterText, chapterNumber)
    const totalShots = scenes.reduce((sum, s) => sum + s.shots.length, 0)
    const totalDuration = scenes.reduce((sum, s) => sum + s.shots.reduce((d, sh) => d + sh.duration, 0), 0)

    const output: ScriptOutput = {
      title: `第${chapterNumber}章`,
      scenes,
      metadata: {
        source_chapter: chapterNumber,
        total_scenes: scenes.length,
        total_shots: totalShots,
        estimated_duration_min: Math.round(totalDuration / 60 * 10) / 10,
        generated_at: new Date().toISOString(),
      },
    }

    // Save to exports/scripts/ (internal format)
    await this.saveScript(output, chapterNumber)

    return output
  }

  /**
   * Export to DOCX-compatible JSON structure (for DOCX conversion layer).
   */
  async exportDocxData(chapterNumber: number): Promise<{
    title: string
    scenes: Array<{
      id: number
      location: string
      time: string
      shots: Array<{
        id: number
        type: string
        character: string
        line: string
        action: string
        description: string
        duration: string
        sfx: string
        emotion: string
      }>
    }>
  }> {
    const script = await this.export(chapterNumber)
    return {
      title: script.title,
      scenes: script.scenes.map(scene => ({
        id: scene.scene_id,
        location: scene.location,
        time: scene.time || '未指定',
        shots: scene.shots.map(shot => ({
          id: shot.shot_id,
          type: shot.type,
          character: shot.character || '',
          line: shot.line || '',
          action: shot.action || '',
          description: shot.description,
          duration: `${shot.duration}秒`,
          sfx: shot.sfx || '',
          emotion: shot.emotion || '',
        })),
      })),
    }
  }

  private async loadChapter(chapterNumber: number): Promise<string | null> {
    const filePath = path.join(this.workspacePath, 'chapters', `chapter_${String(chapterNumber).padStart(3, '0')}.md`)
    
    if (!fs.existsSync(filePath)) {
      return null
    }

    return fs.readFileSync(filePath, 'utf-8')
  }

  private convertToScript(text: string, chapterNumber: number): ScriptScene[] {
    // Skip the title line (# Title)
    const lines = text.split('\n')
    let startIdx = 0
    if (lines[0]?.startsWith('#')) {
      startIdx = 1
    }
    const contentText = lines.slice(startIdx).join('\n').trim()

    const paragraphs = contentText.split(/\n\n+/).filter(p => p.trim().length > 0)
    const scenes: ScriptScene[] = []
    let currentScene: ScriptScene | null = null
    let sceneId = 1
    let shotIdCounter = 1

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim()
      
      if (this.isSceneBreak(trimmed)) {
        if (currentScene) {
          scenes.push(currentScene)
        }
        const locAndTime = this.extractLocationAndTime(trimmed)
        currentScene = {
          scene_id: sceneId++,
          location: locAndTime.location,
          time: locAndTime.time,
          shots: [],
        }
        // Add establishing shot for new scene
        currentScene.shots.push({
          shot_id: shotIdCounter++,
          type: 'establishing',
          description: `场景: ${locAndTime.location}${locAndTime.time ? ' - ' + locAndTime.time : ''}`,
          duration: 3,
        })
      } else if (currentScene) {
        const shots = this.paragraphToShots(trimmed, shotIdCounter)
        shotIdCounter += shots.length
        currentScene.shots.push(...shots)
      }
    }

    if (currentScene && currentScene.shots.length > 0) {
      scenes.push(currentScene)
    }

    // Fallback: no scene breaks detected
    if (scenes.length === 0) {
      scenes.push({
        scene_id: 1,
        location: '未指定',
        time: '未指定',
        shots: [
          {
            shot_id: 1,
            type: 'establishing',
            description: '开场',
            duration: 3,
          },
          ...paragraphs.map((p, i) => ({
            shot_id: i + 2,
            type: 'action' as const,
            description: p.substring(0, 150),
            duration: Math.max(2, Math.ceil(p.length / CHARS_PER_SECOND)),
          })),
        ],
      })
    }

    return scenes
  }

  private isSceneBreak(text: string): boolean {
    return text.includes('***') || text.includes('---') || 
           text.startsWith('【') || text.startsWith('Scene') ||
           /^\d+[\.\、\s]/.test(text.trim()) // Numbered scene markers
  }

  private extractLocationAndTime(text: string): { location: string; time?: string } {
    // Pattern: 【地点，时间】 or 【地点】
    const bracketMatch = text.match(/【(.+?)】/)
    if (bracketMatch) {
      const parts = bracketMatch[1].split(/[,，]/)
      return {
        location: parts[0].trim(),
        time: parts.length > 1 ? parts[1].trim() : undefined,
      }
    }

    // Pattern: Scene N: Location
    const sceneMatch = text.match(/Scene\s*\d+[:\s]*(.+)/)
    if (sceneMatch) {
      return { location: sceneMatch[1].trim() }
    }

    return { location: '未指定' }
  }

  private paragraphToShots(paragraph: string, startShotId: number): ScriptShot[] {
    const shots: ScriptShot[] = []
    let shotId = startShotId

    // Detect emotion
    const emotion = this.detectEmotion(paragraph)
    // Detect SFX
    const sfx = this.detectSfx(paragraph)

    // Case 1: Standalone quoted dialogue
    if (paragraph.match(/^["「『"].*["」』"]$/)) {
      const dialogueMatch = paragraph.match(/^["「『"](.+?)["」』"]/)
      if (dialogueMatch) {
        const line = dialogueMatch[1]
        shots.push({
          shot_id: shotId++,
          type: 'dialogue',
          description: '对话',
          line,
          duration: Math.max(2, Math.ceil(line.length / CHARS_PER_SECOND)),
          emotion,
          sfx,
        })
        return shots
      }
    }

    // Case 2: Character + speech verb + dialogue
    const speechVerbs = /(?:道|说|问道|回答|答道|喊道|叫道|吼道|低声道|喃喃道|冷笑道|笑道|怒道|叹道|问道)/
    if (speechVerbs.test(paragraph)) {
      const match = paragraph.match(/(.+?)(?:道|说|问道|回答|答道|喊道|叫道|吼道|低声道|喃喃道|冷笑道|笑道|怒道|叹道)：["「『"](.+?)["」』"]/)
      if (match) {
        const character = match[1].trim()
        const line = match[2]

        // Extract any action preceding the speech
        const actionPrefix = character.replace(/^[^\s]+\s*/, '').trim()
        const charName = character.replace(actionPrefix, '').trim() || character

        if (actionPrefix && actionPrefix !== charName) {
          shots.push({
            shot_id: shotId++,
            type: 'action',
            description: `${charName}${actionPrefix}`,
            character: charName,
            action: actionPrefix,
            duration: 2,
            emotion,
          })
        }

        shots.push({
          shot_id: shotId++,
          type: 'closeup',
          description: `${charName}说话`,
          character: charName,
          line,
          duration: Math.max(2, Math.ceil(line.length / CHARS_PER_SECOND)),
          emotion,
          sfx,
        })
        return shots
      }

      // Try looser match: "XX道：..." without proper quotes
      const looseMatch = paragraph.match(/(.+?)(?:道|说|问道|回答)(?:\uff1a|:)\s*(.+)/)
      if (looseMatch) {
        const character = looseMatch[1].trim()
        const line = looseMatch[2].trim()
        shots.push({
          shot_id: shotId++,
          type: 'dialogue',
          description: '对话',
          character,
          line,
          duration: Math.max(2, Math.ceil(line.length / CHARS_PER_SECOND)),
          emotion,
          sfx,
        })
        return shots
      }
    }

    // Case 3: Detect narration paragraphs
    if (this.isNarration(paragraph)) {
      const desc = paragraph.substring(0, 200)
      shots.push({
        shot_id: shotId++,
        type: 'narration',
        description: desc,
        duration: Math.max(3, Math.ceil(desc.length / CHARS_PER_SECOND)),
        emotion,
        sfx,
      })
      return shots
    }

    // Case 4: Action / description (default)
    const desc = paragraph.substring(0, 200)
    shots.push({
      shot_id: shotId++,
      type: 'action',
      description: desc,
      action: desc,
      duration: Math.max(2, Math.ceil(desc.length / CHARS_PER_SECOND * 0.6)),
      emotion,
      sfx,
    })

    return shots
  }

  /**
   * Detect emotion from paragraph content.
   */
  private detectEmotion(text: string): string | undefined {
    for (const [pattern, emotion] of EMOTION_KEYWORDS) {
      pattern.lastIndex = 0 // Reset due to /g flag
      if (pattern.test(text)) {
        return emotion
      }
    }
    return undefined
  }

  /**
   * Detect sound effects from paragraph content.
   */
  private detectSfx(text: string): string | undefined {
    for (const [pattern, sfx] of SFX_KEYWORDS) {
      pattern.lastIndex = 0 // Reset due to /g flag
      if (pattern.test(text)) {
        return sfx
      }
    }
    return undefined
  }

  /**
   * Determine if a paragraph is narration rather than action/dialogue.
   */
  private isNarration(paragraph: string): boolean {
    // Check for narration patterns
    for (const pattern of NARRATION_PATTERNS) {
      if (pattern.test(paragraph)) {
        return true
      }
    }
    // Long descriptive paragraphs without dialogue markers are likely narration
    if (paragraph.length > 80 && !/[「『"“道说]/.test(paragraph)) {
      return true
    }
    return false
  }

  private async saveScript(output: ScriptOutput, chapterNumber: number): Promise<void> {
    const exportDir = path.join(this.workspacePath, 'exports', 'scripts')
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const filePath = path.join(exportDir, `chapter_${chapterNumber}_script.json`)
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8')
  }
}
