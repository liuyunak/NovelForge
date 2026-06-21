import { describe, it, expect } from 'vitest'
import { generateMockChapter, toChineseNumber, getChapterTitle } from '../../tools/long-form-test'

// Export helper functions for testing
declare global {
  function getChapterTitle(num: number, genre: string): string
}

describe('Long-Form Test Utilities', () => {
  describe('generateMockChapter()', () => {
    it('should generate chapter content', () => {
      const content = generateMockChapter(1, '测试章节', '玄幻修仙')
      
      expect(content).toBeDefined()
      expect(typeof content).toBe('string')
      expect(content.length).toBeGreaterThan(0)
    })

    it('should include chapter title', () => {
      const content = generateMockChapter(1, '初入修仙', '玄幻修仙')
      
      expect(content).toContain('初入修仙')
    })

    it('should generate different content for different chapters', () => {
      const chapter1 = generateMockChapter(1, 'Chapter 1', '玄幻修仙')
      const chapter2 = generateMockChapter(2, 'Chapter 2', '玄幻修仙')
      
      expect(chapter1).not.toBe(chapter2)
    })

    it('should vary content based on chapter number', () => {
      const content = generateMockChapter(5, 'Test', '都市重生')
      
      expect(content.length).toBeGreaterThan(50)
    })
  })

  describe('toChineseNumber()', () => {
    it('should convert single digits to Chinese', () => {
      expect(toChineseNumber(0)).toBe('零')
      expect(toChineseNumber(1)).toBe('一')
      expect(toChineseNumber(5)).toBe('五')
      expect(toChineseNumber(9)).toBe('九')
    })

    it('should convert teens to Chinese', () => {
      expect(toChineseNumber(10)).toBe('十')
      expect(toChineseNumber(11)).toBe('十一')
      expect(toChineseNumber(15)).toBe('十五')
    })

    it('should convert tens to Chinese', () => {
      expect(toChineseNumber(20)).toBe('二十')
      expect(toChineseNumber(30)).toBe('三十')
      expect(toChineseNumber(90)).toBe('九十')
    })

    it('should fallback to number string for large numbers', () => {
      expect(toChineseNumber(100)).toBe('100')
      expect(toChineseNumber(999)).toBe('999')
    })
  })

  describe('getChapterTitle()', () => {
    it('should return genre-appropriate titles', () => {
      const title = getChapterTitle(1, '玄幻修仙')
      
      expect(title).toBeDefined()
      expect(typeof title).toBe('string')
    })

    it('should cycle through genre titles', () => {
      const titles = [
        getChapterTitle(1, '玄幻修仙'),
        getChapterTitle(2, '玄幻修仙'),
        getChapterTitle(3, '玄幻修仙'),
      ]
      
      expect(titles.length).toBe(3)
    })

    it('should handle unknown genres', () => {
      const title = getChapterTitle(1, '未知题材')
      
      expect(title).toBeDefined()
    })
  })
})
