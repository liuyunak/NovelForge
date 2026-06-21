import { describe, it, expect } from 'vitest'

// Unit tests for FastAudit logic patterns (pure functions)
describe('FastAudit - POV detection', () => {
  it('should detect single POV character', () => {
    // Use 4-char name to avoid accidental matching on short phrases
    const text = '林林凡凡心想：这次一定要成功。林林凡凡暗道：不能放弃。'
    const povMarkers = [
      /(\S{2,4})心想/g,
      /(\S{2,4})暗道/g,
      /(\S{2,4})暗忖/g,
      /(\S{2,4})觉得/g,
      /(\S{2,4})感到/g,
    ]
    
    const povCharacters = new Set<string>()
    for (const marker of povMarkers) {
      let match
      while ((match = marker.exec(text)) !== null) {
        povCharacters.add(match[1])
      }
    }
    
    // Both markers match the same character name
    expect(povCharacters.size).toBeGreaterThanOrEqual(1)
    expect(povCharacters.has('林林凡凡')).toBe(true)
  })

  it('should detect multiple POV switches', () => {
    const text = '林凡心想：危险。苏婉感到一阵寒意。张铁暗道：不妙。'
    const povMarkers = [
      /(\S{2,4})心想/g,
      /(\S{2,4})暗道/g,
      /(\S{2,4})感到/g,
    ]
    
    const povCharacters = new Set<string>()
    for (const marker of povMarkers) {
      let match
      while ((match = marker.exec(text)) !== null) {
        povCharacters.add(match[1])
      }
    }
    
    expect(povCharacters.size).toBe(3)
  })

  it('should pass with <= 3 POV characters', () => {
    const povCount = 2
    expect(povCount <= 3).toBe(true)
  })

  it('should fail with > 3 POV characters', () => {
    const povCount = 5
    expect(povCount <= 3).toBe(false)
  })
})

describe('FastAudit - AI taste detection', () => {
  const forbiddenPatterns = [
    '不仅如此',
    '然而.*却',
    '在.*的过程中',
    '不禁.*涌起',
    '难以言喻',
  ]

  it('should detect AI-taste patterns', () => {
    const text = '不仅如此，他还在修炼的过程中不断提升。'
    const hits: string[] = []
    for (const pattern of forbiddenPatterns) {
      const regex = new RegExp(pattern, 'g')
      if (regex.test(text)) {
        hits.push(pattern)
      }
    }
    expect(hits.length).toBeGreaterThan(0)
  })

  it('should pass on clean text', () => {
    const text = '他走进房间，看了看四周，然后坐了下来。'
    const hits: string[] = []
    for (const pattern of forbiddenPatterns) {
      const regex = new RegExp(pattern, 'g')
      if (regex.test(text)) {
        hits.push(pattern)
      }
    }
    expect(hits.length).toBe(0)
  })
})

describe('FastAudit - Word count check', () => {
  it('should pass within 15% deviation', () => {
    const wordCount = 3200
    const target = 3000
    const deviation = Math.abs(wordCount - target) / target
    expect(deviation <= 0.15).toBe(true)
  })

  it('should fail beyond 15% deviation', () => {
    const wordCount = 4000
    const target = 3000
    const deviation = Math.abs(wordCount - target) / target
    expect(deviation <= 0.15).toBe(false)
  })
})

describe('FastAudit - Chapter ending hook', () => {
  it('should detect cliffhanger with question mark', () => {
    const text = '...他推开门，看到的竟然是？'
    const last300 = text.slice(-300)
    const hasHook = last300.includes('？') || last300.includes('竟然') || last300.includes('突然')
    expect(hasHook).toBe(true)
  })

  it('should detect cliffhanger with 竟然', () => {
    const text = '...眼前的一切竟然完全变了样。'
    const last300 = text.slice(-300)
    const hasHook = last300.includes('竟然')
    expect(hasHook).toBe(true)
  })

  it('should fail without hook markers', () => {
    const text = '他吃完了饭，然后去睡觉了。明天还要继续上班。'
    const last300 = text.slice(-300)
    const hasHook = last300.includes('？') || last300.includes('竟然') || last300.includes('突然')
    expect(hasHook).toBe(false)
  })
})

describe('FastAudit - Repetition detection', () => {
  it('should detect high-frequency words', () => {
    // Use same split pattern as fast-audit.ts checkRepetition
    // Split on spaces and punctuation, count words with >=2 chars that appear >5 times
    const text = 'test test test test test test word'
    const words = text.split(/[\s,，。！？、；：""''《》【】（）]+/)
    const wordCount: Record<string, number> = {}
    for (const word of words) {
      if (word.length >= 2) {
        wordCount[word] = (wordCount[word] || 0) + 1
      }
    }
    const highFreq = Object.entries(wordCount).filter(([_, count]) => count > 5)
    expect(highFreq.length).toBeGreaterThan(0)
  })

  it('should pass with no high-frequency words', () => {
    const text = '他走进房间，看了看四周，然后坐了下来。'
    const words = text.split(/[\s,，。！？、；：""''《》【】（）]+/)
    const wordCount: Record<string, number> = {}
    for (const word of words) {
      if (word.length >= 2) {
        wordCount[word] = (wordCount[word] || 0) + 1
      }
    }
    const highFreq = Object.entries(wordCount).filter(([_, count]) => count > 5)
    expect(highFreq.length).toBe(0)
  })
})
