/**
 * RelationshipGraphPanel - Full-featured relationship graph management panel
 * 
 * Provides visualization, filtering, and CRUD operations for the story graph.
 */

import { useState, useEffect, useCallback } from 'react'
import RelationshipGraph from '../components/RelationshipGraph'
import {
  fetchGraphData,
  addGraphNode,
  updateGraphNode,
  deleteGraphNode,
  addGraphLink,
  type GraphNode,
  type GraphLink,
  type GraphData,
  type RelationshipFilter,
} from '../api/relationship-graph'
import { showToast, logError } from '../utils/logger'

interface Props {
  workspaceId: string
}

export default function RelationshipGraphPanel({ workspaceId }: Props) {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<RelationshipFilter>({})
  const [showAddNode, setShowAddNode] = useState(false)
  const [showAddLink, setShowAddLink] = useState(false)
  const [showEditNode, setShowEditNode] = useState(false)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  // New node form states
  const [newNodeType, setNewNodeType] = useState<GraphNode['type']>('character')
  const [newNodeLabel, setNewNodeLabel] = useState('')
  const [newNodeDesc, setNewNodeDesc] = useState('')

  // New link form states (with source/target selectors)
  const [newLinkSource, setNewLinkSource] = useState('')
  const [newLinkTarget, setNewLinkTarget] = useState('')
  const [newLinkType, setNewLinkType] = useState('')
  const [newLinkStrength, setNewLinkStrength] = useState(1)
  const [newLinkDesc, setNewLinkDesc] = useState('')

  // Edit node form states
  const [editLabel, setEditLabel] = useState('')
  const [editType, setEditType] = useState<GraphNode['type']>('character')
  const [editDesc, setEditDesc] = useState('')

  // Load graph data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchGraphData(workspaceId, filter)
      setGraphData(data)
    } catch (error) {
      logError('Failed to load graph data', error)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, filter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle node creation
  const handleAddNode = async () => {
    if (!newNodeLabel.trim()) return
    try {
      const newNode: Omit<GraphNode, 'id'> = {
        type: newNodeType,
        label: newNodeLabel.trim(),
        description: newNodeDesc.trim(),
        group: 1,
      }
      await addGraphNode(workspaceId, newNode)
      setNewNodeLabel('')
      setNewNodeDesc('')
      setShowAddNode(false)
      showToast(`节点"${newNodeLabel}"已添加`, 'success')
      loadData()
    } catch (error) {
      showToast('添加节点失败', 'error')
    }
  }

  // Handle link creation
  const handleAddLink = async () => {
    if (!newLinkSource || !newLinkTarget || !newLinkType.trim()) {
      showToast('请选择源节点、目标节点并填写关系类型', 'error')
      return
    }
    if (newLinkSource === newLinkTarget) {
      showToast('源节点和目标节点不能相同', 'error')
      return
    }
    try {
      const newLink: Omit<GraphLink, 'id'> = {
        source: newLinkSource,
        target: newLinkTarget,
        type: newLinkType.trim(),
        strength: newLinkStrength,
        description: newLinkDesc.trim(),
      }
      await addGraphLink(workspaceId, newLink)
      setNewLinkSource('')
      setNewLinkTarget('')
      setNewLinkType('')
      setNewLinkDesc('')
      setNewLinkStrength(1)
      setShowAddLink(false)
      showToast('关系链接已添加', 'success')
      loadData()
    } catch (error) {
      showToast('添加链接失败', 'error')
    }
  }

  // Handle node edit
  const handleEditNode = async () => {
    if (!selectedNode || !editLabel.trim()) return
    try {
      await updateGraphNode(workspaceId, selectedNode.id, {
        label: editLabel.trim(),
        type: editType,
        description: editDesc.trim(),
      })
      showToast(`节点"${editLabel}"已更新`, 'success')
      setShowEditNode(false)
      setSelectedNode(null)
      loadData()
    } catch (error) {
      showToast('更新节点失败', 'error')
    }
  }

  // Handle node deletion
  const handleDeleteNode = async (nodeId: string) => {
    if (!confirm('确定要删除此节点吗？关联的连线也会被移除。')) return
    try {
      await deleteGraphNode(workspaceId, nodeId)
      setSelectedNode(null)
      setShowEditNode(false)
      showToast('节点已删除', 'success')
      loadData()
    } catch (error) {
      showToast('删除节点失败', 'error')
    }
  }

  // Open edit modal for a node
  const openEditNode = (node: GraphNode) => {
    setSelectedNode(node)
    setEditLabel(node.label)
    setEditType(node.type)
    setEditDesc(node.description || '')
    setShowEditNode(true)
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">🕸️ 关系图谱</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddNode(true)}
              className="bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded text-sm transition"
            >
              + 添加节点
            </button>
            <button
              onClick={() => {
                setNewLinkSource('')
                setNewLinkTarget('')
                setShowAddLink(true)
              }}
              disabled={!graphData || graphData.nodes.length < 2}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-3 py-1.5 rounded text-sm transition"
            >
              + 添加关系
            </button>
            <button
              onClick={loadData}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm transition"
            >
              🔄 刷新
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={filter.nodeTypes?.[0] || 'all'}
            onChange={(e) => setFilter({ ...filter, nodeTypes: e.target.value === 'all' ? undefined : [e.target.value as any] })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="all">全部类型</option>
            <option value="character">👤 角色</option>
            <option value="location">📍 地点</option>
            <option value="item">📦 物品</option>
            <option value="concept">💡 概念</option>
            <option value="event">📅 事件</option>
          </select>

          <input
            type="text"
            placeholder="搜索..."
            value={filter.searchTerm || ''}
            onChange={(e) => setFilter({ ...filter, searchTerm: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm flex-1 min-w-[150px]"
          />
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 p-4">
        {graphData && graphData.nodes.length > 0 ? (
          <RelationshipGraph
            data={graphData}
            loading={loading}
            onNodeClick={(node) => {
              setSelectedNode(node)
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
            <div className="text-center">
              <div className="text-6xl mb-4">🕸️</div>
              <div className="text-gray-400 text-lg mb-2">暂无关系数据</div>
              <div className="text-gray-500 text-sm">
                添加角色、地点、物品等节点，开始构建你的故事关系图
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Node detail/edit bar (shown when node is selected in graph) */}
      {selectedNode && !showEditNode && (
        <div className="h-16 bg-gray-900 border-t border-gray-800 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">已选中:</span>
            <span className="text-white font-medium">{selectedNode.label}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 capitalize">{selectedNode.type}</span>
            {selectedNode.description && (
              <span className="text-gray-500 text-xs truncate max-w-md">{selectedNode.description}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => openEditNode(selectedNode)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs transition">
              ✏️ 编辑
            </button>
            <button onClick={() => handleDeleteNode(selectedNode.id)}
              className="bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 px-3 py-1 rounded text-xs transition">
              🗑️ 删除
            </button>
            <button onClick={() => setSelectedNode(null)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs transition">
              ✕ 取消
            </button>
          </div>
        </div>
      )}

      {/* Add Node Modal */}
      {showAddNode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96">
            <h3 className="text-white text-lg font-semibold mb-4">添加新节点</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">类型</label>
                <select
                  value={newNodeType}
                  onChange={(e) => setNewNodeType(e.target.value as GraphNode['type'])}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                >
                  <option value="character">👤 角色</option>
                  <option value="location">📍 地点</option>
                  <option value="item">📦 物品</option>
                  <option value="concept">💡 概念</option>
                  <option value="event">📅 事件</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">名称 *</label>
                <input type="text" value={newNodeLabel}
                  onChange={(e) => setNewNodeLabel(e.target.value)}
                  placeholder="如：林风"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  onKeyDown={e => e.key === 'Enter' && handleAddNode()}
                  autoFocus />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">描述</label>
                <textarea value={newNodeDesc}
                  onChange={(e) => setNewNodeDesc(e.target.value)}
                  placeholder="可选描述..."
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  rows={3} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddNode}
                className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded transition">
                添加
              </button>
              <button onClick={() => setShowAddNode(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded transition">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Link Modal (with source/target selectors) */}
      {showAddLink && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96">
            <h3 className="text-white text-lg font-semibold mb-4">添加新关系</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">源节点 *</label>
                <select value={newLinkSource}
                  onChange={(e) => setNewLinkSource(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm">
                  <option value="">-- 选择源节点 --</option>
                  {graphData?.nodes.map(n => (
                    <option key={n.id} value={n.id}>{n.label} ({n.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">目标节点 *</label>
                <select value={newLinkTarget}
                  onChange={(e) => setNewLinkTarget(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm">
                  <option value="">-- 选择目标节点 --</option>
                  {graphData?.nodes.filter(n => n.id !== newLinkSource).map(n => (
                    <option key={n.id} value={n.id}>{n.label} ({n.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">关系类型 *</label>
                <input type="text" value={newLinkType}
                  onChange={(e) => setNewLinkType(e.target.value)}
                  placeholder="如：师徒、挚友、敌对、暗恋"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  onKeyDown={e => e.key === 'Enter' && handleAddLink()} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">强度 (1-5): {newLinkStrength}</label>
                <input type="range" min="1" max="5" value={newLinkStrength}
                  onChange={(e) => setNewLinkStrength(parseInt(e.target.value))}
                  className="w-full accent-purple-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">描述（可选）</label>
                <input type="text" value={newLinkDesc}
                  onChange={(e) => setNewLinkDesc(e.target.value)}
                  placeholder="如：林风拜入此人门下"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddLink}
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded transition">
                添加关系
              </button>
              <button onClick={() => setShowAddLink(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded transition">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Node Modal */}
      {showEditNode && selectedNode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96">
            <h3 className="text-white text-lg font-semibold mb-4">编辑节点</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">类型</label>
                <select value={editType}
                  onChange={(e) => setEditType(e.target.value as GraphNode['type'])}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
                  <option value="character">👤 角色</option>
                  <option value="location">📍 地点</option>
                  <option value="item">📦 物品</option>
                  <option value="concept">💡 概念</option>
                  <option value="event">📅 事件</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">名称</label>
                <input type="text" value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  onKeyDown={e => e.key === 'Enter' && handleEditNode()}
                  autoFocus />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">描述</label>
                <textarea value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  rows={3} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleEditNode}
                className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded transition">
                保存修改
              </button>
              <button onClick={() => { setShowEditNode(false); setSelectedNode(null) }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded transition">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
