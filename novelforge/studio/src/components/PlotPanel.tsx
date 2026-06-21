import { useState, useEffect, useCallback } from 'react'
import {
  getPlots, createHook, updateHook, deleteHook, scanHooks,
  PlotHook, PlotThreadsResponse,
} from '../api/client'
import MdImportDialog from './MdImportDialog'
import { logError, showToast } from '../utils/logger'

interface Props {
  workspaceId: string
}

const hookTypeLabels: Record<PlotHook['type'], string> = {
  setup: '📌 铺垫',
  payoff: '✅ 回收',
  cliffhanger: '⚠️ 悬念',
}

const hookTypeColors: Record<PlotHook['type'], string> = {
  setup: 'text-blue-400 bg-blue-900/20',
  payoff: 'text-green-400 bg-green-900/20',
  cliffhanger: 'text-yellow-400 bg-yellow-900/20',
}

const statusLabels: Record<PlotHook['status'], string> = {
  active: '进行中',
  overdue: '已逾期',
  resolved: '已回收',
}

const statusColors: Record<PlotHook['status'], string> = {
  active: 'bg-blue-500',
  overdue: 'bg-red-500',
  resolved: 'bg-green-500',
}

const debtTrendLabels: Record<string, string> = {
  increasing: '📈 增长中',
  stable: '➡️ 持平',
  decreasing: '📉 下降中',
}

const debtTrendColors: Record<string, string> = {
  increasing: 'text-red-400',
  stable: 'text-yellow-400',
  decreasing: 'text-green-400',
}

export default function PlotPanel({ workspaceId }: Props) {
  const [plots, setPlots] = useState<PlotThreadsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [showImport, setShowImport] = useState(false)

  // --- New hook form state ---
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<PlotHook['type']>('setup')
  const [newChapter, setNewChapter] = useState(1)
  const [newPayoffChapter, setNewPayoffChapter] = useState<number | ''>('')
  const [newStrength, setNewStrength] = useState(5)

  const loadPlots = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPlots(workspaceId)
      setPlots(data)
    } catch (e) {
      logError('Failed to load plots', e)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    loadPlots()
  }, [loadPlots])

  // --- Create hook ---
  const handleCreate = async () => {
    if (!newContent.trim()) return
    try {
      await createHook(workspaceId, {
        content: newContent,
        type: newType,
        setup_chapter: newChapter,
        expected_payoff_chapter: newPayoffChapter || undefined,
        strength: newStrength / 10,
      })
      setNewContent(''); setNewType('setup'); setNewChapter(1)
      setNewPayoffChapter(''); setNewStrength(5); setShowNew(false)
      await loadPlots()
    } catch (e) {
      logError('Failed to create hook', e)
    }
  }

  // --- Update hook status ---
  const handleUpdateStatus = async (hook: PlotHook, status: PlotHook['status']) => {
    try {
      await updateHook(workspaceId, { id: hook.id, status })
      await loadPlots()
    } catch (e) {
      logError('Failed to update hook', e)
    }
  }

  // --- Delete hook ---
  const handleDelete = async (hookId: string) => {
    try {
      await deleteHook(workspaceId, hookId)
      await loadPlots()
    } catch (e) {
      logError('Failed to delete hook', e)
    }
  }

  // --- Auto-scan ---
  const handleScan = async () => {
    setScanning(true)
    try {
      const result = await scanHooks(workspaceId)
      showToast(`扫描完成：发现 ${result.discovered} 个新伏笔`, 'success')
      await loadPlots()
    } catch (e) {
      logError('Failed to scan hooks', e)
    } finally {
      setScanning(false)
    }
  }

  /** Parse Markdown into plot hook entries.
   *  Supported formats:
   *   - `## 伏笔标题` or numbered: `1. 伏笔内容`
   *   - `- 类型: setup/payoff/cliffhanger` (default: setup)
   *   - `- 设置章节: 3` or `- 章节: 3`
   *   - `- 回收章节: 10` or `- 预期回收: 10`
   *   - Line content = hook content
   */
  const parsePlotMd = (md: string): Array<{ content: string; type: PlotHook['type']; setup_chapter: number; expected_payoff_chapter?: number; strength: number }> => {
    const items: Array<{ content: string; type: PlotHook['type']; setup_chapter: number; expected_payoff_chapter?: number; strength: number }> = []
    const lines = md.split('\n')
    let current: { content: string; type: PlotHook['type']; setup_chapter: number; expected_payoff_chapter?: number; strength: number } | null = null

    const finalize = () => {
      if (current && current.content.trim()) {
        items.push({ ...current })
      }
      current = null
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) { finalize(); continue }

      const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/)
      const numMatch = trimmed.match(/^(\d+)[\.\、\s]+(.+)/)

      if (headingMatch || numMatch) {
        finalize()
        const content = (headingMatch || numMatch)![headingMatch ? 1 : 2].trim()
        current = { content, type: 'setup', setup_chapter: 1, strength: 0.5 }
        continue
      }

      if (!current) continue

      const propMatch = trimmed.match(/^[-*]\s*(.+?)[:：]\s*(.+)/)
      if (propMatch) {
        const key = propMatch[1].trim()
        const value = propMatch[2].trim()
        switch (key) {
          case '类型': case 'type':
            if (['setup', 'payoff', 'cliffhanger'].includes(value)) current.type = value as PlotHook['type']
            break
          case '设置章节': case '章节': case 'chapter': case 'setup_chapter':
            current.setup_chapter = parseInt(value) || 1
            break
          case '回收章节': case '预期回收': case 'payoff': case 'expected_payoff_chapter':
            current.expected_payoff_chapter = parseInt(value) || undefined
            break
          case '强度': case 'strength': case '重要度':
            current.strength = Math.min(1, Math.max(0, (parseInt(value) || 50) / 100))
            break
        }
        continue
      }

      // Append to content
      current.content = `${current.content}\n${trimmed}`
    }
    finalize()
    return items
  }

  const handleImport = async (mdContent: string) => {
    const parsed = parsePlotMd(mdContent)
    if (parsed.length === 0) {
      showToast('未识别到有效的伏笔数据。请使用 ## 标题 或 1. 内容 格式。', 'error')
      return
    }
    let successCount = 0
    for (const item of parsed) {
      try {
        await createHook(workspaceId, item)
        successCount++
      } catch (e) {
        logError('Failed to import hook', e)
      }
    }
    await loadPlots()
    showToast(`成功导入 ${successCount}/${parsed.length} 个伏笔`, 'success')
  }

  const hooks = plots?.hooks || []
  const subplots = plots?.subplots || []
  const readingDebt = plots?.reading_debt || { current: 0, target: 0, trend: 'stable' as const }

  // Stats
  const activeHooks = hooks.filter(h => h.status === 'active').length
  const overdueHooks = hooks.filter(h => h.status === 'overdue').length
  const resolvedHooks = hooks.filter(h => h.status === 'resolved').length

  return (
    <div className="p-5 space-y-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>🎯</span> 伏笔看板
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="text-sm px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 rounded-lg transition"
          >
            📥 导入 MD
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition disabled:opacity-50"
          >
            {scanning ? '🔍 扫描中...' : '🔍 智能扫描'}
          </button>
          <button onClick={loadPlots} className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition">
            🔄
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-800/60 rounded-lg p-3 text-center">
          <p className="text-white font-bold text-xl">{hooks.length}</p>
          <p className="text-gray-500 text-xs">总伏笔</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3 text-center">
          <p className="text-blue-400 font-bold text-xl">{activeHooks}</p>
          <p className="text-gray-500 text-xs">进行中</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3 text-center">
          <p className="text-red-400 font-bold text-xl">{overdueHooks}</p>
          <p className="text-gray-500 text-xs">已逾期</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3 text-center">
          <p className="text-green-400 font-bold text-xl">{resolvedHooks}</p>
          <p className="text-gray-500 text-xs">已回收</p>
        </div>
      </div>

      {/* Reading Debt */}
      <div className="bg-gray-800/40 rounded-lg p-4 border border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-300 text-sm font-medium">阅读债务</span>
          <span className={`text-sm ${debtTrendColors[readingDebt.trend] || 'text-gray-400'}`}>
            {debtTrendLabels[readingDebt.trend] || readingDebt.trend}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-yellow-500 to-red-500 h-full rounded-full transition-all"
              style={{ width: `${readingDebt.target > 0 ? Math.min((readingDebt.current / readingDebt.target) * 100, 100) : 0}%` }}
            />
          </div>
          <span className="text-gray-400 text-xs whitespace-nowrap">{readingDebt.current} / {readingDebt.target}</span>
        </div>
      </div>

      {/* Add Hook Button */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium transition"
        >
          + 添加伏笔
        </button>
      </div>

      {/* New Hook Form */}
      {showNew && (
        <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700 space-y-3">
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="伏笔内容描述..."
            className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 resize-none h-20"
          />
          <div className="grid grid-cols-4 gap-2">
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as PlotHook['type'])}
              className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="setup">📌 铺垫</option>
              <option value="payoff">✅ 回收</option>
              <option value="cliffhanger">⚠️ 悬念</option>
            </select>
            <input
              type="number"
              value={newChapter}
              onChange={e => setNewChapter(Number(e.target.value))}
              placeholder="设置章节"
              min={1}
              className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
            />
            <input
              type="number"
              value={newPayoffChapter}
              onChange={e => setNewPayoffChapter(e.target.value ? Number(e.target.value) : '')}
              placeholder="预期回收章节"
              min={1}
              className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex items-center gap-1">
              <input
                type="range"
                value={newStrength}
                onChange={e => setNewStrength(Number(e.target.value))}
                min={1}
                max={10}
                className="flex-1 accent-purple-500"
              />
              <span className="text-gray-400 text-xs w-5">{newStrength}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 py-1.5 text-gray-400 hover:text-white text-sm">取消</button>
            <button onClick={handleCreate} className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm">创建</button>
          </div>
        </div>
      )}

      {/* Subplots Section */}
      {subplots.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-gray-300 text-sm font-medium flex items-center gap-1">
            <span>📋</span> 支线剧情
          </h3>
          {subplots.map(sp => (
            <div key={sp.id} className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-sm font-medium">{sp.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  sp.status === 'active' ? 'text-blue-400 bg-blue-900/20' :
                  sp.status === 'paused' ? 'text-yellow-400 bg-yellow-900/20' :
                  'text-green-400 bg-green-900/20'
                }`}>
                  {sp.status === 'active' ? '进行中' : sp.status === 'paused' ? '暂停' : '已完结'}
                </span>
              </div>
              <p className="text-gray-500 text-xs mb-2">{sp.description}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full rounded-full" style={{ width: `${sp.progress * 100}%` }} />
                </div>
                <span className="text-gray-500 text-[10px]">{Math.round(sp.progress * 100)}%</span>
              </div>
              {sp.milestones.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {sp.milestones.map((m, i) => (
                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${
                      m.completed ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-500'
                    }`}>
                      第{m.chapter}章: {m.event.slice(0, 12)}{m.event.length > 12 ? '...' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hooks List */}
      {loading ? (
        <p className="text-gray-500 text-center py-8">加载中...</p>
      ) : hooks.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-gray-400 mb-1">暂无伏笔数据</p>
          <p className="text-gray-600 text-sm mb-3">手动添加伏笔、智能扫描或导入已有的 MD 伏笔文件</p>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1 px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded-lg text-sm hover:bg-purple-600/30 transition"
          >
            📥 导入 MD 伏笔
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-gray-300 text-sm font-medium">伏笔列表</h3>
          {hooks.map(hook => (
            <div key={hook.id} className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition group">
              <div className="flex items-start gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-[10px] ${hookTypeColors[hook.type]}`}>
                  {hookTypeLabels[hook.type]}
                </span>
                <span className={`ml-auto px-2 py-0.5 rounded text-[10px] text-white ${statusColors[hook.status]}`}>
                  {statusLabels[hook.status]}
                </span>
              </div>
              <p className="text-gray-300 text-sm mb-2 whitespace-pre-wrap">{hook.content}</p>
              <div className="flex items-center gap-3 text-[10px] text-gray-500">
                <span>设置: 第{hook.setup_chapter}章</span>
                {hook.expected_payoff_chapter && <span>预期回收: 第{hook.expected_payoff_chapter}章</span>}
                {hook.actual_payoff_chapter && <span className="text-green-400">已回收: 第{hook.actual_payoff_chapter}章</span>}
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  <div className="w-12 bg-gray-700 h-1 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${hook.strength * 100}%` }} />
                  </div>
                  <span>{Math.round(hook.strength * 100)}%</span>
                </div>
              </div>
              {/* Action buttons */}
              <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                {hook.status === 'active' && (
                  <button
                    onClick={() => handleUpdateStatus(hook, 'resolved')}
                    className="text-[10px] px-2 py-0.5 bg-green-900/30 text-green-400 hover:bg-green-900/50 rounded"
                  >
                    标记回收
                  </button>
                )}
                {hook.status !== 'overdue' && hook.expected_payoff_chapter && (
                  <button
                    onClick={() => handleUpdateStatus(hook, 'overdue')}
                    className="text-[10px] px-2 py-0.5 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded"
                  >
                    标记逾期
                  </button>
                )}
                {hook.status !== 'active' && (
                  <button
                    onClick={() => handleUpdateStatus(hook, 'active')}
                    className="text-[10px] px-2 py-0.5 bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 rounded"
                  >
                    重新激活
                  </button>
                )}
                <button
                  onClick={() => handleDelete(hook.id)}
                  className="text-[10px] px-2 py-0.5 bg-gray-700 text-gray-400 hover:bg-red-900/30 hover:text-red-400 rounded ml-auto"
                >
                  ✕ 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Last Updated */}
      {plots?.last_updated && (
        <p className="text-gray-600 text-[10px] text-right">
          最后更新: {new Date(plots.last_updated).toLocaleString('zh-CN')}
        </p>
      )}

      {/* MD Import Dialog */}
      <MdImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="📥 导入伏笔 Markdown"
        description="使用 ## 标题 或 1. 内容 格式，可指定类型、章节、回收章节等属性"
        placeholder={`## 神秘玉佩的来历\n- 类型: setup\n- 设置章节: 3\n- 回收章节: 50\n- 重要度: 80\n主角在遗迹中发现了一块刻有远古符文的玉佩...\n\n## 大师兄的真实身份\n- 类型: cliffhanger\n- 章节: 10\n大师兄看似和善，但总在关键时刻出现...\n`}
      />
    </div>
  )
}
