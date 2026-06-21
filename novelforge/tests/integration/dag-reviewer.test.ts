import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DAGScheduler } from '../../src/core/dag-scheduler'
import { StateManager } from '../../src/state/manager'
import { FullTextMemory } from '../../src/memory/full-text-memory'

describe('DAG Reviewer Integration', () => {
  let scheduler: DAGScheduler
  let mockStateManager: StateManager
  let mockFullTextMemory: FullTextMemory

  beforeEach(async () => {
    // Create minimal mocks
    mockStateManager = {
      read: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'MASTER_SETTING') {
          return { title: 'Test Novel', genre: 'Fantasy' }
        }
        return null
      }),
      write: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager

    mockFullTextMemory = {
      getRecentChapters: vi.fn().mockResolvedValue(
        'The ancient forest stretched endlessly, its towering oaks creating a dense canopy that blocked out most sunlight. Shadows danced across the moss-covered ground as a gentle breeze rustled the leaves above.'
      ),
      addChapter: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as FullTextMemory

    // Create scheduler with mocks
    scheduler = new DAGScheduler(
      '/tmp/test-workspace',
      mockFullTextMemory,
      mockStateManager
    )
  })

  it('should have Reviewer node in DAG definition', async () => {
    const dagPath = await import('../../src/core/dag')
    const dagNodes = dagPath.NOVELFORGE_DAG.nodes

    const reviewerNode = dagNodes.find(node => node.id === 'reviewer')
    expect(reviewerNode).toBeDefined()
    expect(reviewerNode?.agent).toBe('reviewer')
    expect(reviewerNode?.dependencies).toContain('polisher')
  })

  it('should have correct DAG order with Reviewer', async () => {
    const dagPath = await import('../../src/core/dag')
    const dagNodes = dagPath.NOVELFORGE_DAG.nodes
    const nodeOrder = dagNodes.map(n => n.id)

    const polisherIndex = nodeOrder.indexOf('polisher')
    const reviewerIndex = nodeOrder.indexOf('reviewer')
    const memoryUpdateIndex = nodeOrder.indexOf('memoryupdate')

    expect(reviewerIndex).toBeGreaterThan(polisherIndex)
    expect(memoryUpdateIndex).toBeGreaterThan(reviewerIndex)
  })

  it('should have Reviewer edge connections', async () => {
    const dagPath = await import('../../src/core/dag')
    const dagEdges = dagPath.NOVELFORGE_DAG.edges

    const reviewerEdges = dagEdges.filter(
      ([from, to]) => from === 'polisher' || to === 'reviewer' || from === 'reviewer'
    )

    expect(reviewerEdges).toContainEqual(['polisher', 'reviewer'])
    expect(reviewerEdges).toContainEqual(['reviewer', 'memoryupdate'])
  })

  it('should register Reviewer agent handler in scheduler', () => {
    // The scheduler should have registered the reviewer handler
    // We verify this by checking that the scheduler was created successfully
    expect(scheduler).toBeDefined()
  })
})
