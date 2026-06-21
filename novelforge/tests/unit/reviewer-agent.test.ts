import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReviewerAgent } from '../../src/agents/reviewer'
import { ModelRouter } from '../../src/router'
import { StateManager } from '../../src/state/manager'
import { FullTextMemory } from '../../src/memory/full-text-memory'

describe('ReviewerAgent', () => {
  let reviewer: ReviewerAgent
  let mockStateManager: StateManager
  let mockFullTextMemory: FullTextMemory
  let mockModelRouter: ModelRouter

  beforeEach(() => {
    // Mock StateManager
    mockStateManager = {
      read: vi.fn().mockResolvedValue({
        title: 'Test Novel',
        genre: 'Fantasy',
      }),
      write: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager

    // Mock FullTextMemory
    mockFullTextMemory = {
      getRecentChapters: vi.fn().mockResolvedValue(
        'The ancient forest stretched endlessly before them, its towering oaks creating a canopy that blocked out most of the sunlight. Shadows danced across the moss-covered ground as a gentle breeze rustled the leaves above. Elara moved carefully through the undergrowth, her boots sinking slightly into the damp earth with each step.'
      ),
      addChapter: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as FullTextMemory

    // Mock ModelRouter
    mockModelRouter = {
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          healthReport: {
            consistencyScore: 85,
            rhythmScore: 78,
            hookHealth: '良好',
            stallWarnings: ['Chapter 12 shows signs of pacing slowdown'],
            issues: [
              {
                type: 'pacing',
                severity: 'medium',
                description: 'Pacing slows in the middle section',
              },
            ],
          },
          readerSimulation: {
            engagementCurve: [0.9, 0.85, 0.8, 0.75, 0.82],
            abandonRiskPoints: ['Middle of Chapter 12'],
            satisfactionHits: ['Opening description', 'Character introduction'],
            wouldContinue: true,
          },
          recommendations: [
            'Consider adding more dialogue to maintain engagement',
            'Enhance the climax in Chapter 13',
          ],
        })
      ),
    } as unknown as ModelRouter

    reviewer = new ReviewerAgent(mockModelRouter, mockStateManager, mockFullTextMemory)
  })

  describe('review()', () => {
    it('should perform a review and return valid result', async () => {
      const result = await reviewer.review()

      expect(result).toBeDefined()
      expect(result.healthReport).toBeDefined()
      expect(result.readerSimulation).toBeDefined()
      expect(typeof result.healthReport.consistencyScore).toBe('number')
      expect(typeof result.healthReport.rhythmScore).toBe('number')
      expect(['良好', '一般', '较差']).toContain(result.healthReport.hookHealth)
    })

    it('should use provided chapter text when available', async () => {
      const customText = 'This is a custom chapter text for review.'
      const result = await reviewer.review(customText)

      expect(result).toBeDefined()
      expect(mockModelRouter.generate).toHaveBeenCalled()
    })

    it('should handle LLM failure gracefully', async () => {
      mockModelRouter.generate = vi.fn().mockResolvedValue('Invalid JSON response')

      const result = await reviewer.review()

      expect(result).toBeDefined()
      expect(result.healthReport.consistencyScore).toBe(70) // Default value
      expect(result.healthReport.rhythmScore).toBe(70) // Default value
    })

    it('should handle malformed JSON response', async () => {
      mockModelRouter.generate = vi.fn().mockResolvedValue('{ invalid json }')

      const result = await reviewer.review()

      expect(result).toBeDefined()
      expect(result.healthReport.consistencyScore).toBe(70)
    })

    it('should validate response structure', async () => {
      mockModelRouter.generate = vi.fn().mockResolvedValue(
        JSON.stringify({
          healthReport: {
            consistencyScore: 'not a number', // Wrong type
            rhythmScore: 80,
            hookHealth: 'excellent', // Invalid enum value
            stallWarnings: [],
          },
          readerSimulation: {
            engagementCurve: [0.8, 0.7],
            abandonRiskPoints: [],
            satisfactionHits: [],
            wouldContinue: true,
          },
        })
      )

      const result = await reviewer.review()

      // Should fall back to default when validation fails
      expect(result.healthReport.consistencyScore).toBe(70)
    })
  })

  describe('getDefaultResult()', () => {
    it('should return sensible defaults', () => {
      const result = reviewer['getDefaultResult']()

      expect(result).toEqual({
        healthReport: {
          consistencyScore: 70,
          rhythmScore: 70,
          hookHealth: '一般',
          stallWarnings: [],
        },
        readerSimulation: {
          engagementCurve: [0.8, 0.75, 0.7, 0.65, 0.7],
          abandonRiskPoints: [],
          satisfactionHits: [],
          wouldContinue: true,
        },
      })
    })
  })

  describe('integration with StateManager', () => {
    it('should read MASTER_SETTING from state', async () => {
      await reviewer.review()

      expect(mockStateManager.read).toHaveBeenCalledWith('MASTER_SETTING')
    })
  })

  describe('integration with FullTextMemory', () => {
    it('should fetch recent chapters when no text provided', async () => {
      await reviewer.review()

      expect(mockFullTextMemory.getRecentChapters).toHaveBeenCalledWith(5)
    })

    it('should skip memory fetch when chapter text is provided', async () => {
      await reviewer.review('Custom text')

      expect(mockFullTextMemory.getRecentChapters).not.toHaveBeenCalled()
    })
  })

  describe('review result structure', () => {
    it('should return complete review result with all fields', async () => {
      const result = await reviewer.review()

      expect(result).toHaveProperty('healthReport')
      expect(result).toHaveProperty('readerSimulation')
      expect(result.healthReport).toHaveProperty('consistencyScore')
      expect(result.healthReport).toHaveProperty('rhythmScore')
      expect(result.healthReport).toHaveProperty('hookHealth')
      expect(result.healthReport).toHaveProperty('stallWarnings')
      expect(result.readerSimulation).toHaveProperty('engagementCurve')
      expect(result.readerSimulation).toHaveProperty('abandonRiskPoints')
      expect(result.readerSimulation).toHaveProperty('satisfactionHits')
      expect(result.readerSimulation).toHaveProperty('wouldContinue')
    })

    it('should include recommendations when available', async () => {
      mockModelRouter.generate = vi.fn().mockResolvedValue(
        JSON.stringify({
          healthReport: {
            consistencyScore: 80,
            rhythmScore: 75,
            hookHealth: '良好',
            stallWarnings: [],
          },
          readerSimulation: {
            engagementCurve: [0.85],
            abandonRiskPoints: [],
            satisfactionHits: [],
            wouldContinue: true,
          },
          recommendations: ['Add more conflict', 'Improve character development'],
        })
      )

      const result = await reviewer.review()

      expect(result.recommendations).toBeDefined()
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(result.recommendations!.length).toBeGreaterThan(0)
    })

    it('should include issues array when available', async () => {
      mockModelRouter.generate = vi.fn().mockResolvedValue(
        JSON.stringify({
          healthReport: {
            consistencyScore: 75,
            rhythmScore: 70,
            hookHealth: '一般',
            stallWarnings: ['Slow pacing detected'],
            issues: [
              { type: 'pacing', severity: 'medium', description: 'Pacing issue' },
              { type: 'dialogue', severity: 'low', description: 'Dialogue too formal' },
            ],
          },
          readerSimulation: {
            engagementCurve: [0.7, 0.65, 0.7],
            abandonRiskPoints: [],
            satisfactionHits: [],
            wouldContinue: true,
          },
        })
      )

      const result = await reviewer.review()

      expect(result.healthReport.issues).toBeDefined()
      expect(Array.isArray(result.healthReport.issues)).toBe(true)
      expect(result.healthReport.issues!.length).toBe(2)
      expect(result.healthReport.issues![0].severity).toBe('medium')
    })
  })
})
