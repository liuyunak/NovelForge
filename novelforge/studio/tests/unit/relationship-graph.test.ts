import { describe, it, expect } from 'vitest'
import {
  highlightSubgraph,
  type GraphNode,
  type GraphLink,
  type GraphData,
} from '../../src/api/relationship-graph'

describe('Relationship Graph API Utilities', () => {
  describe('highlightSubgraph()', () => {
    it('should return subgraph connected to a node', () => {
      const graphData: GraphData = {
        nodes: [
          { id: '1', label: 'A', type: 'character', group: 1 },
          { id: '2', label: 'B', type: 'character', group: 1 },
          { id: '3', label: 'C', type: 'location', group: 2 },
          { id: '4', label: 'D', type: 'item', group: 3 },
        ],
        links: [
          { source: '1', target: '2', type: 'friends' },
          { source: '2', target: '3', type: 'lives_in' },
          { source: '4', target: '4', type: 'isolated' }, // disconnected node
        ],
      }

      const result = highlightSubgraph(graphData, '1')

      expect(result.nodes.length).toBe(3)
      expect(result.links.length).toBe(2)
      expect(result.nodes.map(n => n.id)).toContain('1')
      expect(result.nodes.map(n => n.id)).toContain('2')
      expect(result.nodes.map(n => n.id)).toContain('3')
      expect(result.nodes.map(n => n.id)).not.toContain('4')
    })

    it('should handle isolated node', () => {
      const graphData: GraphData = {
        nodes: [
          { id: '1', label: 'A', type: 'character', group: 1 },
          { id: '2', label: 'B', type: 'character', group: 1 },
        ],
        links: [],
      }

      const result = highlightSubgraph(graphData, '1')

      expect(result.nodes.length).toBe(1)
      expect(result.links.length).toBe(0)
      expect(result.nodes[0].id).toBe('1')
    })

    it('should handle complex graph with multiple connections', () => {
      const graphData: GraphData = {
        nodes: [
          { id: '1', label: 'Protagonist', type: 'character', group: 1 },
          { id: '2', label: 'Mentor', type: 'character', group: 1 },
          { id: '3', label: 'Antagonist', type: 'character', group: 2 },
          { id: '4', label: 'Kingdom', type: 'location', group: 3 },
        ],
        links: [
          { source: '1', target: '2', type: 'mentors', strength: 3 },
          { source: '1', target: '3', type: 'conflicts', strength: 5 },
          { source: '1', target: '4', type: 'lives_in', strength: 2 },
        ],
      }

      const result = highlightSubgraph(graphData, '1')

      expect(result.nodes.length).toBe(4)
      expect(result.links.length).toBe(3)
    })

    it('should return empty for non-existent node', () => {
      const graphData: GraphData = {
        nodes: [
          { id: '1', label: 'A', type: 'character', group: 1 },
        ],
        links: [],
      }

      const result = highlightSubgraph(graphData, '999')

      expect(result.nodes.length).toBe(0)
      expect(result.links.length).toBe(0)
    })
  })
})

describe('Graph Data Types', () => {
  it('should validate node types', () => {
    const validNodes: GraphNode[] = [
      { id: '1', label: 'Character', type: 'character', group: 1 },
      { id: '2', label: 'Location', type: 'location', group: 2 },
      { id: '3', label: 'Item', type: 'item', group: 3 },
      { id: '4', label: 'Concept', type: 'concept', group: 4 },
      { id: '5', label: 'Event', type: 'event', group: 5 },
    ]

    expect(validNodes.length).toBe(5)
  })

  it('should validate link structure', () => {
    const link: GraphLink = {
      source: '1',
      target: '2',
      type: 'friends',
      strength: 3,
      description: 'Good friends',
    }

    expect(link.source).toBe('1')
    expect(link.target).toBe('2')
    expect(link.type).toBe('friends')
    expect(link.strength).toBe(3)
  })
})
