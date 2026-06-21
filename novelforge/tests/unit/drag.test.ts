import { describe, it, expect } from 'vitest'
import { NOVELFORGE_DAG } from '../../src/core/dag.js'

describe('DAG Definition', () => {
  it('should have correct number of nodes', () => {
    expect(NOVELFORGE_DAG.nodes.length).toBe(14)  // Added reviewer node
  })

  it('should have correct number of edges', () => {
    expect(NOVELFORGE_DAG.edges.length).toBe(16)  // Added reviewer edges
  })

  it('should have planner as first node with no dependencies', () => {
    const planner = NOVELFORGE_DAG.nodes.find(n => n.id === 'planner')
    expect(planner).toBeDefined()
    expect(planner!.dependencies).toEqual([])
  })

  it('should have 4 parallel nodes after planner', () => {
    const styleextractor = NOVELFORGE_DAG.nodes.find(n => n.id === 'styleextractor')
    const composer = NOVELFORGE_DAG.nodes.find(n => n.id === 'composer')
    const preaudit = NOVELFORGE_DAG.nodes.find(n => n.id === 'preaudit')
    const contextprep = NOVELFORGE_DAG.nodes.find(n => n.id === 'contextprep')
    
    expect(styleextractor?.parallel).toBe(true)
    expect(composer?.parallel).toBe(true)
    expect(preaudit?.parallel).toBe(true)
    expect(contextprep?.parallel).toBe(true)
    
    expect(styleextractor?.dependencies).toEqual(['planner'])
    expect(composer?.dependencies).toEqual(['planner'])
    expect(preaudit?.dependencies).toEqual(['planner'])
    expect(contextprep?.dependencies).toEqual(['planner'])
  })

  it('should have writer depending on all 4 parallel nodes', () => {
    const writer = NOVELFORGE_DAG.nodes.find(n => n.id === 'writer')
    expect(writer?.dependencies).toContain('styleextractor')
    expect(writer?.dependencies).toContain('composer')
    expect(writer?.dependencies).toContain('preaudit')
    expect(writer?.dependencies).toContain('contextprep')
  })

  it('should have approval nodes with human-approval agent type', () => {
    const approval1 = NOVELFORGE_DAG.nodes.find(n => n.id === 'approval1')
    const approval2 = NOVELFORGE_DAG.nodes.find(n => n.id === 'approval2')
    
    expect(approval1?.agent).toBe('human-approval')
    expect(approval2?.agent).toBe('human-approval')
    expect(approval1?.approvalRequired).toBe(true)
    expect(approval2?.approvalRequired).toBe(true)
  })

  it('should have analyst after approval1', () => {
    const analyst = NOVELFORGE_DAG.nodes.find(n => n.id === 'analyst')
    expect(analyst?.dependencies).toEqual(['approval1'])
  })

  it('should have polisher after analyst', () => {
    const polisher = NOVELFORGE_DAG.nodes.find(n => n.id === 'polisher')
    expect(polisher?.dependencies).toEqual(['analyst'])
  })

  it('should have memoryupdate after reviewer', () => {
    const mem = NOVELFORGE_DAG.nodes.find(n => n.id === 'memoryupdate')
    expect(mem?.dependencies).toEqual(['reviewer'])
  })

  it('should have approval2 as final node', () => {
    const approval2 = NOVELFORGE_DAG.nodes.find(n => n.id === 'approval2')
    expect(approval2?.dependencies).toEqual(['memoryupdate'])
    
    // approval2 should be the last node (no other node depends on it)
    const dependsOnApproval2 = NOVELFORGE_DAG.nodes.filter(n => n.dependencies.includes('approval2'))
    expect(dependsOnApproval2.length).toBe(0)
  })

  it('should have all nodes with valid timeouts', () => {
    for (const node of NOVELFORGE_DAG.nodes) {
      if (node.timeout !== undefined) {
        expect(node.timeout).toBeGreaterThan(0)
      }
    }
  })
})

describe('DAG topological validity', () => {
  it('should have no circular dependencies', () => {
    const nodeMap = new Map(NOVELFORGE_DAG.nodes.map(n => [n.id, n]))
    
    // Simple BFS to check no cycles
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    function hasCycle(nodeId: string): boolean {
      if (visiting.has(nodeId)) return true
      if (visited.has(nodeId)) return false
      
      visiting.add(nodeId)
      const node = nodeMap.get(nodeId)
      if (node) {
        for (const dep of node.dependencies) {
          if (hasCycle(dep)) return true
        }
      }
      visiting.delete(nodeId)
      visited.add(nodeId)
      return false
    }
    
    for (const node of NOVELFORGE_DAG.nodes) {
      expect(hasCycle(node.id)).toBe(false)
    }
  })

  it('should have all edges match node definitions', () => {
    const nodeIds = new Set(NOVELFORGE_DAG.nodes.map(n => n.id))
    
    for (const [from, to] of NOVELFORGE_DAG.edges) {
      expect(nodeIds.has(from)).toBe(true)
      expect(nodeIds.has(to)).toBe(true)
      
      const targetNode = NOVELFORGE_DAG.nodes.find(n => n.id === to)
      expect(targetNode?.dependencies).toContain(from)
    }
  })
})
