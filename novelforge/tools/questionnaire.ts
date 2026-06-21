import * as readline from 'readline'
import { StateManager } from '../src/state/manager.js'
import { createDefaultMasterSetting, createDefaultCharacters, createDefaultPlotThreads } from '../src/state/schemas/index.js'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim())
    })
  })
}

interface QuestionnaireAnswers {
  title: string
  genre: string
  corePremise: string
  coreConflict: string
  goldenFingerType: string
  goldenFingerDescription: string
  mainCharacterName: string
  mainCharacterBackground: string
  targetAudience: string
  endingDirection: string
}

async function runQuestionnaire(): Promise<QuestionnaireAnswers> {
  console.log('\n=== NovelForge 新书创建问卷 ===\n')
  
  const answers: QuestionnaireAnswers = {
    title: '',
    genre: '',
    corePremise: '',
    coreConflict: '',
    goldenFingerType: '',
    goldenFingerDescription: '',
    mainCharacterName: '',
    mainCharacterBackground: '',
    targetAudience: '男频',
    endingDirection: '传统大圆满',
  }

  answers.title = await ask('1. 书名: ')
  answers.genre = await ask('2. 题材 (玄幻/都市/科幻/悬疑/古言): ')
  answers.corePremise = await ask('3. 核心设定 (一句话概括): ')
  answers.coreConflict = await ask('4. 核心冲突: ')
  answers.goldenFingerType = await ask('5. 金手指类型 (系统/重生记忆/天赋等): ')
  answers.goldenFingerDescription = await ask('6. 金手指描述: ')
  answers.mainCharacterName = await ask('7. 主角名字: ')
  answers.mainCharacterBackground = await ask('8. 主角背景: ')
  answers.targetAudience = await ask('9. 目标读者 (男频/女频): ') || '男频'
  answers.endingDirection = await ask('10. 结局方向 (传统大圆满/开放式/悲剧): ') || '传统大圆满'

  return answers
}

async function generateFromAnswers(answers: QuestionnaireAnswers, workspacePath: string): Promise<void> {
  const stateManager = new StateManager(workspacePath)
  await stateManager.initialize()

  const masterSetting = createDefaultMasterSetting({
    work_id: `novel_${Date.now()}`,
    title: answers.title,
    genre: answers.genre,
    target_audience: {
      age: '20-35',
      preference: answers.targetAudience,
      reading_scenario: '睡前手机阅读',
    },
    core_premise: answers.corePremise,
    core_conflict: answers.coreConflict,
    selling_point: `${answers.goldenFingerType} + ${answers.coreConflict}`,
    ending_direction: answers.endingDirection,
    world_rules: [],
    golden_finger: {
      type: answers.goldenFingerType,
      description: answers.goldenFingerDescription,
      limitations: [],
    },
  })

  await stateManager.write('MASTER_SETTING', masterSetting)

  const characters = createDefaultCharacters()
  const protagonist = createDefaultCharacter(answers.mainCharacterName, 'protagonist')
  protagonist.basic.background = answers.mainCharacterBackground
  characters.characters.push(protagonist)
  await stateManager.write('characters', characters)

  const plotThreads = createDefaultPlotThreads()
  await stateManager.write('plot_threads', plotThreads)

  console.log(`\n作品 "${answers.title}" 创建成功！`)
  console.log(`工作目录: ${workspacePath}`)
}

function createDefaultCharacter(name: string, role: 'protagonist' | 'antagonist' | 'supporting' | 'minor') {
  return {
    name,
    role,
    basic: { background: '' },
    ocean: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    speech: { style: '', catchphrases: [], taboo_words: [] },
    behavior_rules: [],
    relationships: [],
    emotional_arc: [],
    growth_milestones: [],
  }
}

function createDefaultCharacters() {
  return { characters: [], last_updated: new Date().toISOString() }
}

export async function main() {
  try {
    const answers = await runQuestionnaire()
    
    console.log('\n确认创建? (y/n)')
    const confirm = await ask('')
    
    if (confirm.toLowerCase() !== 'y') {
      console.log('已取消')
      rl.close()
      return
    }

    const workspacePath = process.argv[2] || './workspace/novel_new'
    await generateFromAnswers(answers, workspacePath)
    
    rl.close()
  } catch (error) {
    console.error('Error:', error)
    rl.close()
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
