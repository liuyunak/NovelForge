import { useState } from 'react'
import { WorkspaceDetail, Chapter } from '../types'
import { showToast } from '../utils/logger'

interface Props {
  workspace: WorkspaceDetail
  chapters: Chapter[]
  onNavigateEditor: () => void
  onRename?: (newTitle: string) => Promise<void>
  onDelete?: () => void
}

export default function ProjectManageView({ workspace, chapters, onNavigateEditor, onRename, onDelete }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showRename, setShowRename] = useState(false)
  const [renameTitle, setRenameTitle] = useState(workspace.title)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Compute stats
  const totalWords = chapters.reduce((s, ch) => s + (ch.content?.replace(/\s/g, '').length || 0), 0)
  const sortedChapters = [...chapters].sort((a, b) => a.number - b.number)

  const filteredChapters = searchTerm.trim()
    ? sortedChapters.filter(ch =>
        ch.title.includes(searchTerm) ||
        ch.content?.includes(searchTerm)
      )
    : sortedChapters

  const handleRename = async () => {
    if (!renameTitle.trim() || renameTitle === workspace.title) {
      setShowRename(false)
      return
    }
    try {
      await onRename?.(renameTitle)
      showToast(`项目已重命名为"${renameTitle}"`, 'success')
    } catch {
      showToast('重命名失败', 'error')
    }
    setShowRename(false)
  }

  const handleDeleteConfirm = () => {
    onDelete?.()
    setShowDeleteConfirm(false)
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-white font-bold text-xl">{workspace.title}</h2>
          <p className="text-gray-500 text-sm mt-1">
            ID: {workspace.id.slice(0, 8)}... · {workspace.genre} · {chapters.length} 章
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setRenameTitle(workspace.title); setShowRename(true) }}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-xs transition">
            ✏️ 重命名
          </button>
          <button onClick={() => setShowDeleteConfirm(true)}
            className="bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 px-3 py-2 rounded-lg text-xs transition">
            🗑️ 删除项目
          </button>
          <button onClick={onNavigateEditor} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition">
            ✍️ 进入编辑器
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="📋 类型" value={workspace.genre} />
          <StatCard label="📕 章节数" value={`${chapters.length}`} />
          <StatCard label="📝 总字数" value={`${(totalWords / 10000).toFixed(1)}万`} />
          <StatCard label="📊 均章字数" value={chapters.length > 0 ? `${Math.round(totalWords / chapters.length).toLocaleString()}` : '--'} />
        </div>

        {/* Chapter list */}
        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">📕 章节列表</h3>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索章节..."
              className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg outline-none w-48 border border-gray-700 focus:border-purple-500"
            />
          </div>
          {filteredChapters.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">
              {chapters.length === 0 ? '暂无章节，进入编辑器开始写作' : '无匹配章节'}
            </p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filteredChapters.map((ch) => {
                const wc = ch.content?.replace(/\s/g, '').length || 0
                const preview = ch.content?.replace(/[#\n]/g, ' ').slice(0, 60) || ''
                return (
                  <div key={ch.number} className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700/30 text-sm group">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-purple-400 font-mono w-16 shrink-0">第{ch.number}章</span>
                      <span className="text-gray-300 truncate">{ch.title}</span>
                      <span className="text-gray-600 text-xs truncate hidden sm:block flex-1">{preview}...</span>
                    </div>
                    <span className="text-gray-500 text-xs ml-3 shrink-0">{wc.toLocaleString()} 字</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rename Modal */}
      {showRename && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700">
            <h3 className="text-white font-bold text-lg mb-3">重命名项目</h3>
            <input type="text" value={renameTitle}
              onChange={e => setRenameTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg mb-4 outline-none border border-gray-700 focus:border-purple-500"
              autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRename(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition">取消</button>
              <button onClick={handleRename}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm transition">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700">
            <h3 className="text-red-400 font-bold text-lg mb-2">⚠️ 确认删除</h3>
            <p className="text-gray-400 text-sm mb-4">
              确定要删除项目 <span className="text-white font-medium">"{workspace.title}"</span> 吗？
              此操作将删除所有章节和设置，且无法恢复。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition">取消</button>
              <button onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm transition">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gradient-to-b from-purple-600/10 to-transparent rounded-lg border border-purple-500/20 p-3">
      <p className="text-gray-500 text-[11px] mb-0.5">{label}</p>
      <p className="text-purple-300 font-bold text-base">{value}</p>
    </div>
  )
}
