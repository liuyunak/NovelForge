import { useState, useEffect, useCallback } from 'react'
import {
  triggerDream, getDreamHistory, getDreamSummary, getLastDream,
  type DreamResult, type DreamLog,
} from '../api/client'
import { logError, showToast } from '../utils/logger'

interface Props {
  workspaceId: string
}

export default function DreamPanel({ workspaceId }: Props) {
  const [dreamHistory, setDreamHistory] = useState<DreamLog[]>([])
  const [currentSummary, setCurrentSummary] = useState<string | null>(null)
  const [lastDream, setLastDream] = useState<DreamResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  // --- Load dream data ---
  const loadDreamData = useCallback(async () => {
    setLoading(true)
    try {
      const [historyRes, summaryRes, lastRes] = await Promise.all([
        getDreamHistory(workspaceId),
        getDreamSummary(workspaceId),
        getLastDream(workspaceId),
      ])
      setDreamHistory(historyRes.logs || [])
      setCurrentSummary(summaryRes.summary || null)
      setLastDream(lastRes.result || null)
    } catch (e) {
      logError('Failed to load dream data', e)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    loadDreamData()
  }, [loadDreamData])

  // --- Trigger dream manually ---
  const handleTriggerDream = async () => {
    setTriggering(true)
    try {
      const result = await triggerDream(workspaceId)
      showToast(`✅ /dream 记忆整合完成（${result.chaptersIntegrated}）`, 'success')
      setLastDream(result)
      await loadDreamData()
    } catch (e) {
      logError('Dream trigger failed', e)
      showToast('❌ 记忆整合失败', 'error')
    } finally {
      setTriggering(false)
    }
  }

  // --- Format date ---
  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🌙</span> /dream 记忆整合
          </h2>
          <p className="text-gray-500 text-xs mt-1">
            每 10 章自动触发，将近期记忆压缩为摘要，追踪伏笔状态
          </p>
        </div>
        <button
          onClick={handleTriggerDream}
          disabled={triggering}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
        >
          {triggering ? (
            <><span className="animate-spin">⏳</span> 整合中...</>
          ) : (
            <><span>🌙</span> 手动触发 /dream</>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="animate-spin text-2xl mr-2">⏳</span>
          <span className="text-gray-400">加载 dream 数据...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Current Working Memory Summary */}
          {currentSummary && (
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4 space-y-2">
              <h3 className="text-indigo-300 font-semibold text-sm flex items-center gap-2">
                <span>🧠</span> 当前工作记忆摘要
              </h3>
              <div className="bg-gray-900/60 rounded-lg border border-gray-700/30 p-3">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {currentSummary}
                </pre>
              </div>
            </div>
          )}

          {/* Last Dream Result */}
          {lastDream && (
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4 space-y-3">
              <h3 className="text-purple-300 font-semibold text-sm flex items-center gap-2">
                <span>✨</span> 最近一次 /dream
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center bg-gray-800/60 rounded p-2">
                  <div className="text-purple-400 text-lg font-bold">{lastDream.triggerChapter}</div>
                  <div className="text-gray-500 text-[10px]">触发章节</div>
                </div>
                <div className="text-center bg-gray-800/60 rounded p-2">
                  <div className="text-cyan-400 text-lg font-bold">{lastDream.chaptersIntegrated}</div>
                  <div className="text-gray-500 text-[10px]">整合范围</div>
                </div>
                <div className="text-center bg-gray-800/60 rounded p-2">
                  <div className="text-yellow-400 text-lg font-bold">{lastDream.conflictsDetected}</div>
                  <div className="text-gray-500 text-[10px]">检测冲突</div>
                </div>
              </div>
              <div className="bg-gray-900/60 rounded-lg border border-gray-700/30 p-3">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {lastDream.summary}
                </pre>
              </div>
              <div className="text-[10px] text-gray-500">
                {formatDate(lastDream.timestamp)}
              </div>
            </div>
          )}

          {/* Dream History */}
          <div className="space-y-3">
            <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
              <span>📜</span> Dream 执行历史
            </h3>

            {dreamHistory.length === 0 ? (
              <div className="bg-gray-800/40 rounded-xl border border-dashed border-gray-700/50 p-8 text-center">
                <div className="text-4xl mb-3">🌙</div>
                <p className="text-gray-500 text-sm">尚无 dream 执行记录</p>
                <p className="text-gray-600 text-xs mt-1">
                  每完成 10 章写作后，系统会自动触发 /dream 进行记忆整合
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {dreamHistory.map((log) => (
                  <div
                    key={log.id}
                    className="bg-gray-800/40 rounded-lg border border-gray-700/40 overflow-hidden"
                  >
                    {/* Log header */}
                    <button
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-700/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-indigo-400 text-xs font-mono">
                          第 {log.triggerChapter} 章
                        </span>
                        <span className="text-gray-400 text-xs">
                          整合 {log.chaptersIntegrated}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-600 text-[10px]">
                          {formatDate(log.createdAt)}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {expandedLog === log.id ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {/* Log detail */}
                    {expandedLog === log.id && (
                      <div className="border-t border-gray-700/40 p-3">
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                          {log.summary}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Empty state (no data at all) */}
          {!currentSummary && !lastDream && dreamHistory.length === 0 && (
            <div className="bg-gray-800/40 rounded-xl border border-dashed border-gray-700/50 p-12 text-center">
              <div className="text-5xl mb-4">🌙</div>
              <h3 className="text-gray-400 font-medium mb-2">/dream 记忆整合</h3>
              <p className="text-gray-600 text-sm max-w-md mx-auto">
                系统会定期自动整合短期记忆为长期记忆，生成章节简报，并追踪伏笔状态。
                点击上方按钮可手动触发一次 /dream。
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
