import { useState, useEffect, useCallback } from 'react'
import { getMemory, type MemoryItem } from '../api/client'
import { logError } from '../utils/logger'

interface Props {
  workspaceId: string
}

const memoryTypes = [
  { key: 'fact', label: 'ℹ️ 事实', color: 'text-blue-400 bg-blue-900/20' },
  { key: 'event', label: '🎯 事件', color: 'text-yellow-400 bg-yellow-900/20' },
  { key: 'relationship', label: '🤝 关系', color: 'text-pink-400 bg-pink-900/20' },
  { key: 'plot_point', label: '💬 情节点', color: 'text-purple-400 bg-purple-900/20' },
  { key: 'character_state', label: '👤 状态变化', color: 'text-green-400 bg-green-900/20' },
]

export default function MemorySystemPanel({ workspaceId }: Props) {
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> }>({ total: 0, byType: {} })

  useEffect(() => {
    loadMemories()
  }, [workspaceId])

  const loadMemories = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getMemory(workspaceId)
      setMemories(data.memories || [])
      setStats(data.stats || { total: 0, byType: {} })
    } catch (e) {
      logError('Failed to load memories', e)
      setMemories([]); setStats({ total: 0, byType: {} })
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  const filtered = memories.filter(m => {
    const matchType = typeFilter === 'all' || m.type === typeFilter
    const matchSearch = !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase())
    return matchType && matchSearch
  })

  const getTypeStyle = (type: MemoryItem['type']) =>
    memoryTypes.find(t => t.key === type)?.color || 'text-gray-400 bg-gray-800'

  return (
    <div className="p-5 space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>🧠</span> 记忆系统
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">共 {stats.total} 条记忆</span>
          <button onClick={loadMemories} className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition">
            🔄
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="🔍 搜索记忆内容..."
          className="flex-1 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTypeFilter('all')}
          className={`px-3 py-1 rounded-full text-xs transition ${typeFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
          全部
        </button>
        {memoryTypes.map(t => (
          <button key={t.key} onClick={() => setTypeFilter(t.key)}
            className={`px-3 py-1 rounded-full text-xs transition ${typeFilter === t.key ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {memoryTypes.map(t => (
            <div key={t.key} className="bg-gray-800/60 rounded-lg p-2 text-center">
              <p className="text-white font-bold text-lg">{stats.byType[t.key] || 0}</p>
              <p className="text-gray-500 text-[10px] truncate">{t.label.replace(/\s/g, '')}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-gray-500 text-center py-8">加载中...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">🧠</div>
          <p className="text-gray-400 mb-1">暂无记忆数据</p>
          <p className="text-gray-600 text-sm">生成章节后，系统会自动提取和存储故事记忆</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <div key={m.id} className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-[10px] ${getTypeStyle(m.type)}`}>{memoryTypes.find(t => t.key === m.type)?.label}</span>
                {m.sourceChapter && <span className="text-gray-600 text-[10px]">来源: 第{m.sourceChapter}章</span>}
                <span className="ml-auto text-gray-600 text-[10px]">{m.timestamp?.slice(0, 10)}</span>
              </div>
              <p className="text-gray-300 text-sm">{m.content}</p>
              <div className="mt-1 flex items-center gap-1">
                <div className="flex-1 bg-gray-700 h-1 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full rounded-full" style={{ width: `${(m.confidence || 0) * 100}%` }} />
                </div>
                <span className="text-[10px] text-gray-500">{Math.round((m.confidence || 0) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
