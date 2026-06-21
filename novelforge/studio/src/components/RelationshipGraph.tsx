import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'

interface GraphNode {
  id: string
  label: string
  type: 'character' | 'location' | 'item' | 'concept' | 'event'
  group: number
  description?: string
  [key: string]: any
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: string
  strength?: number
  description?: string
}

interface RelationshipGraphProps {
  width?: number
  height?: number
  data?: {
    nodes: GraphNode[]
    links: GraphLink[]
  }
  loading?: boolean
  onNodeClick?: (node: GraphNode) => void
  onLinkClick?: (link: GraphLink) => void
}

const NODE_COLORS = {
  character: '#f472b6', // pink-400
  location: '#60a5fa', // blue-400
  item: '#fbbf24', // amber-400
  concept: '#a78bfa', // violet-400
  event: '#34d399', // emerald-400
}

const NODE_SIZES = {
  character: 8,
  location: 6,
  item: 5,
  concept: 5,
  event: 6,
}

export default function RelationshipGraph({
  width = 800,
  height = 600,
  data,
  loading = false,
  onNodeClick,
  onLinkClick,
}: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Generate mock data if none provided
  const graphData = data || generateMockData()

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node)
    setSelectedLink(null)
    onNodeClick?.(node)
  }, [onNodeClick])

  const handleLinkClick = useCallback((link: GraphLink) => {
    setSelectedLink(link)
    setSelectedNode(null)
    onLinkClick?.(link)
  }, [onLinkClick])

  // Render the graph
  useEffect(() => {
    if (!svgRef.current || !graphData) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    const g = svg.append('g')

    // Create simulation
    const simulation = d3.forceSimulation<GraphNode>(graphData.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graphData.links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40))

    simulationRef.current = simulation

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('stroke', '#4b5563')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => (d.strength || 1) * 1.5)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        handleLinkClick(d)
      })
      .on('mouseenter', function(event, d) {
        d3.select(this)
          .attr('stroke', '#f472b6')
          .attr('stroke-width', (d.strength || 1) * 2.5)
      })
      .on('mouseleave', function(event, d) {
        if (selectedLink !== d) {
          d3.select(this)
            .attr('stroke', '#4b5563')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', (d.strength || 1) * 1.5)
        }
      })

    // Link labels
    const linkLabel = g.append('g')
      .selectAll('text')
      .data(graphData.links)
      .join('text')
      .text(d => d.type)
      .attr('font-size', '10px')
      .attr('fill', '#9ca3af')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)

    // Draw nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .join('circle')
      .attr('r', d => NODE_SIZES[d.type] || 6)
      .attr('fill', d => NODE_COLORS[d.type] || '#9ca3af')
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, GraphNode>()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded)
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        handleNodeClick(d)
      })
      .on('mouseenter', function(event, d) {
        setHoveredNode(d.id)
        d3.select(this)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 3)
      })
      .on('mouseleave', function(event, d) {
        setHoveredNode(null)
        if (selectedNode?.id !== d.id) {
          d3.select(this)
            .attr('stroke', '#1f2937')
            .attr('stroke-width', 2)
        }
      })

    // Node labels
    const label = g.append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .join('text')
      .text(d => d.label)
      .attr('font-size', '11px')
      .attr('fill', '#e5e7eb')
      .attr('text-anchor', 'middle')
      .attr('dy', d => (NODE_SIZES[d.type] || 6) + 14)
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 3px rgba(0, 0, 0, 0.8)')

    // Update positions
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x)
        .attr('y1', d => (d.source as GraphNode).y)
        .attr('x2', d => (d.target as GraphNode).x)
        .attr('y2', d => (d.target as GraphNode).y)

      linkLabel
        .attr('x', d => {
          const s = d.source as GraphNode
          const t = d.target as GraphNode
          return (s.x + t.x) / 2
        })
        .attr('y', d => {
          const s = d.source as GraphNode
          const t = d.target as GraphNode
          return (s.y + t.y) / 2
        })

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y)
    })

    // Drag functions
    function dragStarted(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragEnded(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [graphData, width, height, selectedNode, selectedLink, handleNodeClick, handleLinkClick])

  return (
    <div className="flex gap-4 h-full">
      {/* Graph container */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#0d1117] rounded-lg border border-gray-800 overflow-hidden"
      >
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="w-full h-full"
        />
        
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="text-white text-lg mb-2">Loading graph...</div>
              <div className="animate-spin text-3xl">⚙️</div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-gray-900/90 p-3 rounded-lg border border-gray-700">
          <div className="text-xs font-semibold text-gray-400 mb-2">Legend</div>
          <div className="space-y-1">
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-300 capitalize">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="absolute top-4 right-4 bg-gray-900/90 p-3 rounded-lg border border-gray-700">
          <div className="text-xs text-gray-400">
            <div>Nodes: <span className="text-white font-semibold">{graphData?.nodes.length || 0}</span></div>
            <div>Links: <span className="text-white font-semibold">{graphData?.links.length || 0}</span></div>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {(selectedNode || selectedLink) && (
        <div className="w-80 bg-[#0d1117] rounded-lg border border-gray-800 p-4 overflow-y-auto">
          <h3 className="text-white font-semibold text-lg mb-4">Details</h3>
          
          {selectedNode && (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-400">Name</div>
                <div className="text-white font-medium">{selectedNode.label}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Type</div>
                <div className="text-white capitalize">{selectedNode.type}</div>
              </div>
              {selectedNode.description && (
                <div>
                  <div className="text-xs text-gray-400">Description</div>
                  <div className="text-gray-300 text-sm mt-1">{selectedNode.description}</div>
                </div>
              )}
              <div className="pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-400 mb-2">Connections</div>
                <div className="text-sm text-gray-300">
                  {graphData?.links.filter(l =>
                    (l.source as any)?.id === selectedNode.id ||
                    (l.target as any)?.id === selectedNode.id
                  ).length || 0} links
                </div>
              </div>
            </div>
          )}

          {selectedLink && (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-400">Type</div>
                <div className="text-white font-medium capitalize">{selectedLink.type}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">From</div>
                <div className="text-gray-300 text-sm">
                  {(selectedLink.source as any)?.label || (selectedLink.source as string)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">To</div>
                <div className="text-gray-300 text-sm">
                  {(selectedLink.target as any)?.label || (selectedLink.target as string)}
                </div>
              </div>
              {selectedLink.description && (
                <div>
                  <div className="text-xs text-gray-400">Description</div>
                  <div className="text-gray-300 text-sm mt-1">{selectedLink.description}</div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => { setSelectedNode(null); setSelectedLink(null) }}
            className="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-white text-sm py-2 px-4 rounded transition"
          >
            Clear Selection
          </button>
        </div>
      )}
    </div>
  )
}

// Generate mock data for demonstration
function generateMockData() {
  const nodes: GraphNode[] = [
    { id: '1', label: 'Protagonist', type: 'character', group: 1, description: 'Main character' },
    { id: '2', label: 'Mentor', type: 'character', group: 1, description: 'Wise guide' },
    { id: '3', label: 'Antagonist', type: 'character', group: 2, description: 'Main villain' },
    { id: '4', label: 'Allies', type: 'character', group: 1, description: 'Supporting team' },
    { id: '5', label: 'Kingdom', type: 'location', group: 3, description: 'Main setting' },
    { id: '6', label: 'Forest', type: 'location', group: 3, description: 'Mystical forest' },
    { id: '7', label: 'Magic Sword', type: 'item', group: 4, description: 'Legendary weapon' },
    { id: '8', label: 'Prophecy', type: 'concept', group: 5, description: 'Ancient prediction' },
    { id: '9', label: 'Battle', type: 'event', group: 6, description: 'Epic confrontation' },
  ]

  const links: GraphLink[] = [
    { source: '1', target: '2', type: 'mentors', strength: 3 },
    { source: '1', target: '3', type: 'conflicts', strength: 5 },
    { source: '1', target: '4', type: 'allies', strength: 2 },
    { source: '1', target: '5', type: 'lives_in', strength: 2 },
    { source: '1', target: '7', type: 'possesses', strength: 2 },
    { source: '2', target: '8', type: 'knows', strength: 2 },
    { source: '3', target: '5', type: 'rules', strength: 3 },
    { source: '5', target: '6', type: 'contains', strength: 2 },
    { source: '8', target: '9', type: 'predicts', strength: 3 },
    { source: '1', target: '9', type: 'participates_in', strength: 4 },
    { source: '3', target: '9', type: 'leads', strength: 4 },
  ]

  return { nodes, links }
}
