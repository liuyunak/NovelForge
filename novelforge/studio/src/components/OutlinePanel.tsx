import { useState, useEffect } from 'react'
import MdImportDialog from './MdImportDialog'
import { showToast } from '../utils/logger'
import { getOutlines, saveOutlines, type OutlineItem } from '../api/client'

interface Props {
  workspaceId: string
}

export default function OutlinePanel({ workspaceId }: Props) {
  const [outlines, setOutlines] = useState<OutlineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showImport, setShowImport] = useState(false)

  const loadOutlines = async () => {
    setLoading(true)
    try {
      const data = await getOutlines(workspaceId)
      setOutlines(data.outlines || [])
    } catch {
      setOutlines([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOutlines() }, [workspaceId])

  /** Parse Markdown into OutlineItem[].
   *  Supported formats:
   *   - `# 章节标题` → outline item (chapterNumber auto-increments)
   *   - `## 章节标题` → outline item
   *   - Numbered: `1. 标题` or `第1章 标题`
   *   - Subsequent paragraphs under a heading become summary/beats
   */
  const parseOutlineMd = (md: string): OutlineItem[] => {
    const items: OutlineItem[] = []
    const lines = md.split('\n')
    let chNum = 0

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Match heading patterns
      let title = ''
      let numFromLine: number | undefined

      const h1Match = trimmed.match(/^#\s+(.+)/)
      const h2Match = trimmed.match(/^##\s+(.+)/)
      const numMatch = trimmed.match(/^(\d+)[\.\、\s]+(.+)/)
      const chMatch = trimmed.match(/^第(\d+)章\s*(.+)/)

      if (chMatch) {
        numFromLine = parseInt(chMatch[1])
        title = chMatch[2].trim() || `第${chMatch[1]}章`
      } else if (numMatch) {
        numFromLine = parseInt(numMatch[1])
        title = numMatch[2].trim()
      } else if (h1Match || h2Match) {
        title = (h1Match || h2Match)![1].trim()
      } else {
        // Append as beat to last item
        if (items.length > 0) {
          const last = items[items.length - 1]
          if (!last.beats) last.beats = []
          last.beats.push(trimmed)
          if (!last.summary) last.summary = trimmed
        }
        continue
      }

      if (title) {
        chNum = numFromLine || (chNum + 1)
        items.push({
          id: `outline_${Date.now()}_${items.length}`,
          title,
          chapterNumber: chNum,
          summary: '',
          status: 'planned',
          beats: [],
        })
      }
    }
    return items
  }

  const handleImport = async (mdContent: string) => {
    const parsed = parseOutlineMd(mdContent)
    if (parsed.length === 0) {
      showToast('未识别到有效的大纲条目', 'error')
      return
    }
    try {
      const merged = [...outlines, ...parsed]
      await saveOutlines(workspaceId, merged)
      showToast(`成功导入 ${parsed.length} 条大纲`, 'success')
      await loadOutlines()
    } catch {
      // Fallback: merge locally if endpoint fails
      setOutlines(prev => [...prev, ...parsed])
      showToast(`已导入 ${parsed.length} 条大纲（本地）`, 'success')
    }
  }

  const statusColor = (s: OutlineItem['status']) => {
    switch (s) {
      case 'completed': return 'bg-green-900/30 text-green-400'
      case 'writing': return 'bg-blue-900/30 text-blue-400'
      case 'revised': return 'bg-purple-900/30 text-purple-400'
      default: return 'bg-gray-800 text-gray-400'
    }
  }

  const statusLabel = (s: OutlineItem['status']) => {
    switch (s) { case 'planned': return '📋 计划中'; case 'writing': return '✍️ 写作中'; case 'completed': return '✅ 已完成'; case 'revised': return '📝 修订中' }
  }

  return (
    <div className="p-5 space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>📋</span> 大纲规划
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="text-sm px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 rounded-lg transition"
          >
            📥 导入 MD
          </button>
          <button
            onClick={loadOutlines}
            className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><p className="text-gray-500">加载大纲中...</p></div>
      ) : outlines.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/50 rounded-xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">📐</div>
          <p className="text-gray-400 mb-1">暂无大纲数据</p>
          <p className="text-gray-600 text-sm mb-3">导入已有的 MD 大纲文件，或通过 AI 生成</p>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1 px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded-lg text-sm hover:bg-purple-600/30 transition"
          >
            📥 导入 MD 大纲
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {outlines.map(item => (
            <div key={item.id} className="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition">
              <div className="flex items-center justify-between mb-2">
                {editingId === item.id ? (
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => { setEditingId(null) }}
                    onKeyDown={e => e.key === 'Enter' && setEditingId(null)}
                    className="bg-gray-900 text-white px-2 py-1 rounded text-sm flex-1 mr-2 outline-none"
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 font-mono text-xs">第{item.chapterNumber}章</span>
                      <span className="text-white font-medium" onDoubleClick={() => { setEditingId(item.id); setEditTitle(item.title) }}>{item.title}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColor(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                  </>
                )}
              </div>
              {item.summary && <p className="text-gray-400 text-sm mt-1">{item.summary}</p>}
              {item.beats && item.beats.length > 0 && (
                <div className="mt-2 space-y-1">
                  {item.beats.map((beat, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                      <span className="text-gray-700 mt-0.5">▶</span>
                      <span>{beat}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MD Import Dialog */}
      <MdImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="📥 导入大纲 Markdown"
        description="支持 # 标题、数字列表(1. 标题) 或「第N章」格式，非标题行自动识别为节拍(beat)"
        placeholder={`# 序章·陨落的天才\n主角从巅峰跌落，失去一切...\n\n# 第一章·重生的少年\n意外获得神秘传承，踏上逆袭之路...\n\n# 第二章·宗门考核\n`}
      />
    </div>
  )
}
