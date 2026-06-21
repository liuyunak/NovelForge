import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { FineTuneDataGenerator } from '../../tools/fine-tune-generator.js'
import os from 'os'

/**
 * Integration tests for fine-tune data generation pipeline.
 * 
 * Tests the complete flow:
 * 1. Create mock processed book data
 * 2. Generate training samples
 * 3. Validate output format and quality
 * 4. Verify metadata report
 */
describe('Fine-tune Data Generation Pipeline', () => {
  let tmpDir: string
  let processedPath: string
  let trainingPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-finetune-test-'))
    processedPath = path.join(tmpDir, 'processed')
    trainingPath = path.join(tmpDir, 'training')
    fs.mkdirSync(processedPath, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('should generate training samples from processed book data', async () => {
    // Create mock processed book
    const mockBook = {
      id: 'test_novel_001',
      title: '测试小说',
      genre: '玄幻',
      chapters: [
        {
          number: 1,
          title: '第一章',
          content: '林辰睁开眼，发现自己重生到了修仙世界。周围是苍茫群山，灵气浓郁得几乎化为实质。空气中弥漫着淡淡的青草香气，远处云雾缭绕，宛如仙境。\n\n他握紧拳头，感受着体内微弱的气劲。"这就是练气期的力量吗？"他喃喃自语，眼中闪过一丝兴奋。微风拂过他的脸庞，带来阵阵凉意。\n\n远处传来一声鹤唳，清脆悠长。林辰抬头望去，只见一只白鹤掠过天际，羽翼在阳光下闪烁着银光。那白鹤盘旋几圈后，朝着深山飞去。\n\n"看来我得尽快找到一处洞府，稳固境界。"他深吸一口气，开始规划接下来的路线。脚下的碎石发出沙沙的声响，仿佛在为他送行。',
          wordCount: 156,
          dialogueRatio: 0.25,
          sceneCount: 2,
        },
        {
          number: 2,
          title: '第二章',
          content: '山路崎岖，林辰走了整整半天才看到一处村落。村落不大，只有十几户人家，炊烟袅袅升起。田野里，几个农夫正在劳作，看到林辰后停下手中的活计，好奇地打量着他。\n\n"客官要打尖还是住店？"村口的小摊上，一个胖掌柜笑眯眯地迎上来。他穿着一身蓝色长袍，腰间系着一条黄色腰带，看起来颇有几分掌柜的派头。\n\n"住店。"林辰的声音有些沙哑，他已经一天没喝水了。喉咙干渴得像要冒烟，急需补充水分。\n\n"五十灵石一晚。"掌柜儿的语气瞬间冷了下来，脸上的笑容也收敛了几分。他上下打量着林辰的衣着，似乎在判断对方的财力。\n\n林辰皱了皱眉，从怀中掏出一个小袋子——里面只有三枚灵石。他在这具身体的记忆中找到了相关信息：练气期修士每月俸禄仅此而已。\n\n"能不能便宜些？我刚来此地，身上灵石不多。"林辰诚恳地说道，希望能得到掌柜儿的体谅。',
          wordCount: 198,
          dialogueRatio: 0.4,
          sceneCount: 1,
        },
      ],
      stats: {
        totalChapters: 2,
        totalWords: 354,
        avgChapterLength: 177,
        avgDialogueRatio: 0.325,
      },
    }

    // Save mock data
    const genrePath = path.join(processedPath, '玄幻')
    fs.mkdirSync(genrePath, { recursive: true })
    fs.writeFileSync(path.join(genrePath, 'test_novel_001.json'), JSON.stringify(mockBook, null, 2))

    // Generate training data
    const generator = new FineTuneDataGenerator(processedPath, trainingPath, 1000)
    const report = await generator.generate()

    // Validate output file exists
    const outputFile = path.join(trainingPath, 'finetune_data.json')
    expect(fs.existsSync(outputFile)).toBe(true)

    // Validate metadata
    const metadataFile = path.join(trainingPath, 'generation-metadata.json')
    expect(fs.existsSync(metadataFile)).toBe(true)

    // Validate report structure
    expect(report.total_processed).toBe(2)
    expect(report.total_generated).toBeGreaterThan(0)
    expect(report.total_filtered).toBeGreaterThanOrEqual(0)
    expect(report.input_chapters).toBe(2)
    expect(report.input_words).toBe(354)
    expect(report.samples_by_genre['玄幻']).toBeGreaterThan(0)
    expect(report.avg_quality_score).toBeGreaterThan(0)
    expect(report.processing_time_ms).toBeGreaterThan(0)
  })

  it('should filter out low-quality samples', async () => {
    const mockBook = {
      id: 'test_short',
      title: '短篇测试',
      genre: '都市',
      chapters: [
        {
          number: 1,
          title: '第一章',
          content: '很短的内容。', // Less than minSceneLength (100)
          wordCount: 5,
          dialogueRatio: 0,
          sceneCount: 1,
        },
        {
          number: 2,
          title: '第二章',
          content: '这一章稍微长一些，但场景之间的分隔不够明显，可能无法正确分割成多个场景。',
          wordCount: 40,
          dialogueRatio: 0,
          sceneCount: 1,
        },
      ],
      stats: {
        totalChapters: 2,
        totalWords: 45,
        avgChapterLength: 22.5,
        avgDialogueRatio: 0,
      },
    }

    const genrePath = path.join(processedPath, '都市')
    fs.mkdirSync(genrePath, { recursive: true })
    fs.writeFileSync(path.join(genrePath, 'test_short.json'), JSON.stringify(mockBook, null, 2))

    const generator = new FineTuneDataGenerator(processedPath, trainingPath, 1000)
    const report = await generator.generate()

    // Should have 0 or very few samples due to short content
    expect(report.total_generated).toBeLessThanOrEqual(1)
  })

  it('should handle multiple genres', async () => {
    const genres = {
      '玄幻': {
        chapters: [
          {
            number: 1,
            title: '第一章',
            content: '林辰睁开眼，发现自己重生到了修仙世界。周围是苍茫群山，灵气浓郁得几乎化为实质。空气中弥漫着淡淡的青草香气，远处云雾缭绕，宛如仙境。他深吸一口气，感受着灵力的流动，体内经脉隐隐发热。\n\n他握紧拳头，感受着体内微弱的气劲。"这就是练气期的力量吗？"他喃喃自语，眼中闪过一丝兴奋。微风拂过他的脸庞，带来阵阵凉意，同时也吹散了他心中的迷茫。\n\n远处传来一声鹤唳，清脆悠长。林辰抬头望去，只见一只白鹤掠过天际，羽翼在阳光下闪烁着银光。那白鹤盘旋几圈后，朝着深山飞去，留下一道优美的弧线。',
            wordCount: 100,
            dialogueRatio: 0.2,
            sceneCount: 2,
          },
        ],
        stats: { totalChapters: 1, totalWords: 100, avgChapterLength: 100, avgDialogueRatio: 0.2 },
      },
      '都市': {
        chapters: [
          {
            number: 1,
            title: '第一章',
            content: '城市的霓虹灯闪烁不息，李明站在天桥上俯瞰着车流如织的街道。高楼大厦林立，玻璃幕墙反射着五彩斑斓的光芒。夜风吹过，带来阵阵凉意，也吹散了他额前的碎发。\n\n"又是一个不眠之夜。"他自言自语道，点燃一支烟。烟雾在风中散开，如同他此刻迷茫的心情。远处的音乐声隐约传来，诉说着这座城市的喧嚣与繁华，也衬托出他内心的孤独。\n\n手机震动了一下，是老板发来的消息：明天早点来公司，有个重要的项目要讨论。他叹了口气，将烟头扔进垃圾桶，转身融入了人流之中。',
            wordCount: 85,
            dialogueRatio: 0.25,
            sceneCount: 2,
          },
        ],
        stats: { totalChapters: 1, totalWords: 85, avgChapterLength: 85, avgDialogueRatio: 0.25 },
      },
    }

    for (const [genre, bookData] of Object.entries(genres)) {
      const genrePath = path.join(processedPath, genre)
      fs.mkdirSync(genrePath, { recursive: true })
      fs.writeFileSync(
        path.join(genrePath, `test_${genre}.json`),
        JSON.stringify({ id: `test_${genre}`, title: genre, genre, chapters: [bookData.chapters[0]], stats: bookData.stats }, null, 2)
      )
    }

    const generator = new FineTuneDataGenerator(processedPath, trainingPath, 1000)
    const report = await generator.generate()

    // Should have samples from both genres
    expect(Object.keys(report.samples_by_genre).length).toBe(2)
    expect(report.samples_by_genre['玄幻']).toBeGreaterThan(0)
    expect(report.samples_by_genre['都市']).toBeGreaterThan(0)
  })

  it('should respect max-samples limit', async () => {
    const chapters = Array.from({ length: 10 }, (_, i) => ({
      number: i + 1,
      title: `第${i + 1}章`,
      content: `这是第${i + 1}章的内容。`.repeat(50), // Repeat to ensure > 100 chars
      wordCount: 200,
      dialogueRatio: 0.1,
      sceneCount: 1,
    }))

    const mockBook = {
      id: 'test_limit',
      title: '测试限制',
      genre: '科幻',
      chapters,
      stats: { totalChapters: 10, totalWords: 2000, avgChapterLength: 200, avgDialogueRatio: 0.1 },
    }

    const genrePath = path.join(processedPath, '科幻')
    fs.mkdirSync(genrePath, { recursive: true })
    fs.writeFileSync(path.join(genrePath, 'test_limit.json'), JSON.stringify(mockBook, null, 2))

    // Limit to 5 samples
    const generator = new FineTuneDataGenerator(processedPath, trainingPath, 5)
    const report = await generator.generate()

    expect(report.total_generated).toBeLessThanOrEqual(5)
  })

  it('should throw error when input path does not exist', async () => {
    const generator = new FineTuneDataGenerator('./nonexistent/path', trainingPath)
    
    await expect(generator.generate()).rejects.toThrow('Input directory not found')
  })

  it('should generate valid training sample structure', async () => {
    // Create a fresh tmp dir for this test
    const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-finetune-struct-'))
    const testProcessedPath = path.join(testTmpDir, 'processed')
    const testTrainingPath = path.join(testTmpDir, 'training')
    fs.mkdirSync(testProcessedPath, { recursive: true })

    const mockBook = {
      id: 'test_structure',
      title: '结构测试',
      genre: '奇幻',
      chapters: [
        {
          number: 1,
          title: '第一章',
          content: '清晨的阳光透过窗户洒进来，艾莉娅伸了个懒腰。房间里弥漫着淡淡的薰衣草香气，窗帘随风轻轻摆动，带来阵阵凉爽。床头的闹钟指向七点，新的一天开始了。\n\n"今天要去见那个人吗？"她自言自语道，嘴角露出一丝微笑。镜中的她眼神明亮，透着几分期待与紧张，手指不自觉地绞着衣角。她深吸一口气，整理了一下裙摆。\n\n推开房门，街市的喧闹声扑面而来。摊贩们的叫卖声此起彼伏，孩子们的欢笑声在巷弄间回荡。阳光洒在青石板路上，斑驳的光影随着行人脚步摇曳。街角的面包店飘出阵阵香气，让人垂涎欲滴。整个世界充满了生机与活力。',
          wordCount: 80,
          dialogueRatio: 0.3,
          sceneCount: 2,
        },
      ],
      stats: { totalChapters: 1, totalWords: 80, avgChapterLength: 80, avgDialogueRatio: 0.3 },
    }

    const genrePath = path.join(testProcessedPath, '奇幻')
    fs.mkdirSync(genrePath, { recursive: true })
    fs.writeFileSync(path.join(genrePath, 'test_structure.json'), JSON.stringify(mockBook, null, 2))

    const generator = new FineTuneDataGenerator(testProcessedPath, testTrainingPath, 1000)
    await generator.generate()

    const outputFile = path.join(testTrainingPath, 'finetune_data.json')
    const samples = JSON.parse(fs.readFileSync(outputFile, 'utf-8'))

    expect(samples.length).toBeGreaterThan(0)

    // Validate sample structure
    const sample = samples[0]
    expect(sample).toHaveProperty('instruction')
    expect(sample).toHaveProperty('input')
    expect(sample).toHaveProperty('output')
    expect(sample).toHaveProperty('quality_score')
    expect(sample).toHaveProperty('genre')
    expect(sample).toHaveProperty('chapter_range')
    expect(typeof sample.quality_score).toBe('number')
    expect(sample.quality_score).toBeGreaterThanOrEqual(1.0)
    expect(sample.quality_score).toBeLessThanOrEqual(10.0)
    expect(Array.isArray(sample.chapter_range)).toBe(true)
    expect(sample.chapter_range.length).toBe(2)
  })
})
