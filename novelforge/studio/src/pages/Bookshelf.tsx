import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWorkspaces, createWorkspace, deleteWorkspace, clearAuthToken } from '../api/client'
import { Workspace } from '../types'
import { showToast, logError } from '../utils/logger'

export default function Bookshelf() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newBook, setNewBook] = useState({ title: '', genre: '玄幻修仙', corePremise: '' })
  const [isCreating, setIsCreating] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const navigate = useNavigate()

  const loadWorkspaces = useCallback(async () => {
    setLoadError(false)
    try {
      const data = await fetchWorkspaces()
      setWorkspaces(data.workspaces || [])
    } catch (error) {
      logError('Failed to load workspaces', error)
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const handleCreate = async () => {
    if (!newBook.title.trim()) {
      showToast('请输入书名', 'error')
      return
    }
    if (isCreating) return

    setIsCreating(true)
    try {
      const result = await createWorkspace(newBook)
      setShowCreateModal(false)
      setNewBook({ title: '', genre: '玄幻修仙', corePremise: '' })
      await loadWorkspaces()
      showToast('创建成功', 'success')
      // Navigate to the new workspace
      navigate(`/workspace/${result.id}`)
    } catch (error) {
      logError('Failed to create workspace', error)
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        showToast('登录已过期，请重新登录', 'error')
        clearAuthToken()
        navigate('/login', { replace: true })
      } else {
        showToast('创建失败，请确认后端服务是否已启动', 'error')
      }
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('确定要删除这本书吗？此操作不可恢复。')) return

    try {
      await deleteWorkspace(id)
      await loadWorkspaces()
      showToast('已删除', 'success')
    } catch (error) {
      logError('Failed to delete workspace', error)
      showToast('删除失败', 'error')
    }
  }

  const handleLogout = () => {
    clearAuthToken()
    navigate('/login', { replace: true })
  }

  const getGenreEmoji = (genre: string) => {
    const emojis: Record<string, string> = {
      '玄幻修仙': '⚔️',
      '都市重生': '🏙️',
      '科幻末世': '🚀',
      '悬疑灵异': '🔍',
      '古代言情': '💕',
    }
    return emojis[genre] || '📖'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">NovelForge</h1>
            <p className="text-gray-400 mt-1">AI辅助网文创作工作台</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-300 text-sm transition"
              title="退出登录"
            >
              退出
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition flex items-center gap-2"
            >
              <span className="text-xl">+</span>
              <span>创建新书</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              onClick={() => navigate(`/workspace/${ws.id}`)}
              className="bg-gray-800 rounded-lg p-6 cursor-pointer hover:bg-gray-700 transition border border-gray-700 hover:border-blue-500 relative group"
            >
              <button
                onClick={(e) => handleDelete(e, ws.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded bg-gray-900/50 transition"
              >
                删除
              </button>
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{getGenreEmoji(ws.genre)}</span>
                <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                  {ws.genre || '未分类'}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {ws.title}
              </h3>
              <p className="text-gray-400 text-sm">点击进入创作</p>
            </div>
          ))}

          {loadError && workspaces.length === 0 && (
            <div className="col-span-full text-center py-16">
              <div className="text-6xl mb-4">⚠️</div>
              <p className="text-gray-500 text-lg mb-2">无法连接到服务器</p>
              <p className="text-gray-600 text-sm">
                请确认后端服务已启动（端口 3001），然后
                <button onClick={loadWorkspaces} className="text-blue-400 hover:text-blue-300 ml-1 transition">
                  点击重试
                </button>
              </p>
            </div>
          )}

          {!loadError && workspaces.length === 0 && (
            <div className="col-span-full text-center py-16">
              <div className="text-6xl mb-4">📚</div>
              <p className="text-gray-500 text-lg mb-2">还没有作品</p>
              <p className="text-gray-600 text-sm">点击"创建新书"开始你的创作之旅</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6">创建新书</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">书名 *</label>
                <input
                  type="text"
                  value={newBook.title}
                  onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="输入书名"
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">题材</label>
                <select
                  value={newBook.genre}
                  onChange={(e) => setNewBook({ ...newBook, genre: e.target.value })}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="玄幻修仙">⚔️ 玄幻修仙</option>
                  <option value="都市重生">🏙️ 都市重生</option>
                  <option value="科幻末世">🚀 科幻末世</option>
                  <option value="悬疑灵异">🔍 悬疑灵异</option>
                  <option value="古代言情">💕 古代言情</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">核心设定</label>
                <textarea
                  value={newBook.corePremise}
                  onChange={(e) => setNewBook({ ...newBook, corePremise: e.target.value })}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                  placeholder="一句话概括故事核心（可选）"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg transition"
              >
                {isCreating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
