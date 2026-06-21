/**
 * Relationship Graph Data Layer
 * 
 * Provides data fetching and manipulation for the D3 relationship graph.
 */

import { getAuthToken } from './client'
import { logError } from '../utils/logger'

/** Build auth headers for fetch requests */
function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

/** Common request options merged with auth */
function requestOptions(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers as Record<string, string> || {}),
    },
  }
}

export interface GraphNode {
  id: string
  label: string
  type: 'character' | 'location' | 'item' | 'concept' | 'event' | 'organization'
  group: number
  description?: string
  properties?: Record<string, any>
}

export interface GraphLink {
  id?: string
  source: string | GraphNode
  target: string | GraphNode
  type: string
  strength?: number
  description?: string
  properties?: Record<string, any>
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  metadata?: {
    totalNodes: number
    totalLinks: number
    lastUpdated: string
    workspaceId: string
  }
}

export interface RelationshipFilter {
  nodeTypes?: GraphNode['type'][]
  linkTypes?: string[]
  minStrength?: number
  searchTerm?: string
}

export interface NodeNeighbors {
  node: GraphNode | null
  neighbors: GraphNode[]
  links: GraphLink[]
}

/**
 * Fetch relationship graph data from API
 */
export async function fetchGraphData(
  workspaceId: string,
  filter?: RelationshipFilter
): Promise<GraphData> {
  try {
    const params = new URLSearchParams()
    if (filter) {
      if (filter.nodeTypes) params.append('nodeTypes', filter.nodeTypes.join(','))
      if (filter.linkTypes) params.append('linkTypes', filter.linkTypes.join(','))
      if (filter.minStrength) params.append('minStrength', filter.minStrength.toString())
      if (filter.searchTerm) params.append('search', filter.searchTerm)
    }

    const url = `/api/workspace/${workspaceId}/graph?${params}`
    const response = await fetch(url, requestOptions())
    
    if (!response.ok) {
      throw new Error(`Failed to fetch graph data: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    logError('Error fetching graph data', error)
    return { nodes: [], links: [], metadata: { totalNodes: 0, totalLinks: 0, lastUpdated: '', workspaceId } }
  }
}

/**
 * Add a new node to the graph
 */
export async function addGraphNode(
  workspaceId: string,
  node: Omit<GraphNode, 'id'> & Partial<Pick<GraphNode, 'id'>>
): Promise<GraphNode> {
  try {
    const response = await fetch(`/api/workspace/${workspaceId}/graph/nodes`, requestOptions({
      method: 'POST',
      body: JSON.stringify(node),
    }))

    if (!response.ok) {
      throw new Error(`Failed to add node: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    logError('Error adding node', error)
    throw error
  }
}

/**
 * Update an existing node
 */
export async function updateGraphNode(
  workspaceId: string,
  nodeId: string,
  updates: Partial<GraphNode>
): Promise<GraphNode> {
  try {
    const response = await fetch(`/api/workspace/${workspaceId}/graph/nodes/${nodeId}`, requestOptions({
      method: 'PUT',
      body: JSON.stringify(updates),
    }))

    if (!response.ok) {
      throw new Error(`Failed to update node: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    logError('Error updating node', error)
    throw error
  }
}

/**
 * Delete a node from the graph
 */
export async function deleteGraphNode(
  workspaceId: string,
  nodeId: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/workspace/${workspaceId}/graph/nodes/${nodeId}`, requestOptions({
      method: 'DELETE',
    }))

    if (!response.ok) {
      throw new Error(`Failed to delete node: ${response.statusText}`)
    }

    return true
  } catch (error) {
    logError('Error deleting node', error)
    throw error
  }
}

/**
 * Add a new link between nodes
 */
export async function addGraphLink(
  workspaceId: string,
  link: Omit<GraphLink, 'id'> & Partial<Pick<GraphLink, 'id'>>
): Promise<GraphLink> {
  try {
    const response = await fetch(`/api/workspace/${workspaceId}/graph/links`, requestOptions({
      method: 'POST',
      body: JSON.stringify(link),
    }))

    if (!response.ok) {
      throw new Error(`Failed to add link: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    logError('Error adding link', error)
    throw error
  }
}

/**
 * Get related nodes for a specific node
 */
export async function getNodeNeighbors(
  workspaceId: string,
  nodeId: string
): Promise<NodeNeighbors> {
  try {
    const response = await fetch(`/api/workspace/${workspaceId}/graph/nodes/${nodeId}/neighbors`, requestOptions())
    
    if (!response.ok) {
      throw new Error(`Failed to get node neighbors: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    logError('Error getting node neighbors', error)
    return { node: null, neighbors: [], links: [] }
  }
}

/**
 * Highlight subgraph connected to a node
 */
export function highlightSubgraph(
  graphData: GraphData,
  rootNodeId: string
): { nodes: GraphNode[]; links: GraphLink[] } {
  const visited = new Set<string>()
  const subgraphNodes: GraphNode[] = []
  const subgraphLinkIds = new Set<number>()

  // BFS to find all connected nodes
  const queue = [rootNodeId]
  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const node = graphData.nodes.find(n => n.id === currentId)
    if (node) subgraphNodes.push(node)

    // Find all connected links and collect their indices
    graphData.links.forEach((link, index) => {
      if (subgraphLinkIds.has(index)) return
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id

      if (sourceId === currentId || targetId === currentId) {
        subgraphLinkIds.add(index)
        if (!visited.has(sourceId)) queue.push(sourceId)
        if (!visited.has(targetId)) queue.push(targetId)
      }
    })
  }

  // Build subgraph links from collected indices
  const subgraphLinks = Array.from(subgraphLinkIds).sort().map(i => graphData.links[i])

  return { nodes: subgraphNodes, links: subgraphLinks }
}
