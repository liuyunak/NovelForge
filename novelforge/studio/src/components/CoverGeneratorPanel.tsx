import { useState, useEffect, useCallback } from 'react'
import { generateCover, type CoverResult } from '../api/client'
import { logError, showToast } from '../utils/logger'

interface Props {
  workspaceId: string
}

interface CoverRecord {
  id: string
  result: CoverResult
  timestamp: number
}

const STORAGE_KEY_PREFIX = 'novelforge_cover_history_'

export default function CoverGeneratorPanel({ workspaceId }: Props) {
  // --- State ---
  const [generating, setGenerating] = useState(false)
  const [genPhase, setGenPhase] = useState('')
  const [latestResult, setLatestResult] = useState<CoverResult | null>(null)
  const [history, setHistory] = useState<CoverRecord[]>([])
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)

  // --- Load history from localStorage ---
  const loadHistory = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId)
      if (raw) {
        const parsed: CoverRecord[] = JSON.parse(raw)
        setHistory(parsed)
      }
    } catch {
      // ignore corrupted data
    }
  }, [workspaceId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // --- Save record to history ---
  const saveToHistory = useCallback((result: CoverResult) => {
    const record: CoverRecord = {
      id: `cover_${Date.now()}`,
      result,
      timestamp: Date.now(),
    }
    setHistory(prev => {
      const updated = [record, ...prev].slice(0, 20) // keep last 20
      try {
        localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, JSON.stringify(updated))
      } catch {
        // storage full — silently drop oldest
      }
      return updated
    })
  }, [workspaceId])

  // --- Handle cover generation ---
  const handleGenerate = async () => {
    setGenerating(true)
    setLatestResult(null)

    // Simulate phases for better UX
    const phases = [
      { text: '正在分析小说设定...', delay: 800 },
      { text: '正在生成提示词...', delay: 2000 },
      { text: '正在调用 AI 渲染封面...', delay: 3000 },
    ]

    let phaseIndex = 0
    const phaseInterval = setInterval(() => {
      if (phaseIndex < phases.length) {
        setGenPhase(phases[phaseIndex].text)
        phaseIndex++
      }
    }, 1200)

    try {
      const result = await generateCover(workspaceId)
      clearInterval(phaseInterval)

      if (result.success) {
        setLatestResult(result)
        saveToHistory(result)
        showToast('✅ 封面生成成功！', 'success')
      } else {
        setLatestResult(result)
        showToast(`❌ 封面生成失败: ${result.error || '未知错误'}`, 'error')
      }
    } catch (e) {
      clearInterval(phaseInterval)
      logError('Cover generation failed', e)
      showToast('❌ 封面生成请求失败，请检查网络连接', 'error')
    } finally {
      setGenerating(false)
      setGenPhase('')
    }
  }

  // --- Download image ---
  const handleDownload = (result: CoverResult) => {
    if (!result.imageUrl) return

    try {
      // If backend provided a download URL, use it
      if (result.url) {
        const a = document.createElement('a')
        a.href = result.url
        a.download = `cover_${Date.now()}.png`
        a.click()
        return
      }

      // Otherwise download from base64 data URI
      const a = document.createElement('a')
      a.href = result.imageUrl
      a.download = `cover_${Date.now()}.png`
      a.click()
      showToast('✅ 封面已开始下载', 'success')
    } catch (e) {
      logError('Failed to download cover', e)
      showToast('❌ 下载失败', 'error')
    }
  }

  // --- Copy prompt to clipboard ---
  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      setPromptCopied(true)
      showToast('✅ 提示词已复制', 'success')
      setTimeout(() => setPromptCopied(false), 2000)
    } catch {
      showToast('❌ 复制失败', 'error')
    }
  }

  // --- Delete history record ---
  const handleDeleteRecord = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(r => r.id !== id)
      try {
        localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, JSON.stringify(updated))
      } catch { /* ignore */ }
      return updated
    })
    // Clear latest result if it matches the deleted record
    setLatestResult(prev => {
      const match = history.find(r => r.id === id)
      if (match && prev && prev.prompt === match.result.prompt && prev.imageUrl === match.result.imageUrl) {
        return null
      }
      return prev
    })
  }

  // --- Clear all history ---
  const handleClearHistory = () => {
    setHistory([])
    setLatestResult(null)
    try {
      localStorage.removeItem(STORAGE_KEY_PREFIX + workspaceId)
    } catch { /* ignore */ }
    showToast('✅ 历史记录已清空', 'success')
  }

  // --- Format timestamp ---
  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="p-5 space-y-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>🎨</span> 封面生成
        </h2>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded"
              title="清空历史"
            >
              🗑️ 清空历史
            </button>
          )}
          <button
            onClick={loadHistory}
            className="text-sm text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800/60"
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-500 text-sm leading-relaxed">
        基于小说设定自动生成英文提示词，通过 Stable Diffusion 渲染专属封面图片。
        每次生成需要约 10-30 秒，请耐心等待。
      </p>

      {/* Generate Section */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-5 space-y-4">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <span className="w-1 h-4 bg-purple-500 rounded-full" />
          生成封面
        </h3>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2
            ${generating
              ? 'bg-purple-500/20 text-purple-300 cursor-wait border border-purple-500/30'
              : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 hover:shadow-purple-500/40'
            }`}
        >
          {generating ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              生成中...
            </>
          ) : (
            <>
              <span>🎨</span> 生成封面
            </>
          )}
        </button>

        {/* Phase indicator */}
        {genPhase && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-purple-400 text-xs animate-pulse">
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
              {genPhase}
            </div>
          </div>
        )}

        {/* Latest Result */}
        {latestResult && !generating && (
          <div className="space-y-4 pt-2 border-t border-gray-700/50">
            {/* Success / Error status */}
            {latestResult.success ? (
              <>
                {/* Image Preview */}
                {latestResult.imageUrl && (
                  <div className="space-y-3">
                    <div className="relative group">
                      <img
                        src={latestResult.imageUrl}
                        alt="生成的封面"
                        className={`rounded-lg border border-gray-600/50 shadow-xl transition-all cursor-pointer
                          ${previewExpanded ? 'w-full' : 'w-full max-h-64 object-cover'}`}
                        onClick={() => setPreviewExpanded(!previewExpanded)}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="text-white text-xs bg-black/60 px-3 py-1.5 rounded-full">
                          {previewExpanded ? '点击缩小' : '点击放大'}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(latestResult)}
                        className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>📥</span> 下载封面
                      </button>
                      <button
                        onClick={handleGenerate}
                        className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>🔄</span> 重新生成
                      </button>
                    </div>
                  </div>
                )}

                {/* Prompt Display */}
                {latestResult.prompt && (
                  <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-xs font-medium">AI 生成的提示词</span>
                      <button
                        onClick={() => handleCopyPrompt(latestResult.prompt)}
                        className={`text-xs px-2 py-0.5 rounded transition-colors ${
                          promptCopied
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white'
                        }`}
                      >
                        {promptCopied ? '✅ 已复制' : '📋 复制'}
                      </button>
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed break-words font-mono">
                      {latestResult.prompt}
                    </p>
                  </div>
                )}
              </>
            ) : (
              /* Error state */
              <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <span className="text-red-400 text-sm mt-0.5">⚠️</span>
                  <div className="space-y-1">
                    <p className="text-red-300 text-sm font-medium">生成失败</p>
                    <p className="text-red-400/80 text-xs">{latestResult.error || '未知错误'}</p>
                  </div>
                </div>
                <button
                  onClick={handleGenerate}
                  className="mt-3 w-full py-1.5 bg-red-600/30 hover:bg-red-600/50 text-red-300 text-xs rounded-lg transition-colors"
                >
                  🔄 重试
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* History Section */}
      {history.length > 0 && (
        <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-5 space-y-4">
          <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
            <span className="w-1 h-4 bg-cyan-500 rounded-full" />
            生成历史
            <span className="text-gray-600 text-xs font-normal ml-1">({history.length})</span>
          </h3>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.map((record) => (
              <div
                key={record.id}
                className="bg-gray-900/40 rounded-lg border border-gray-700/30 p-3 flex items-center gap-3 group hover:border-gray-600/50 transition-colors"
              >
                {/* Thumbnail */}
                {record.result.imageUrl ? (
                  <img
                    src={record.result.imageUrl}
                    alt="封面缩略图"
                    className="w-14 h-10 rounded object-cover border border-gray-700/50 flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-10 rounded bg-gray-800 border border-gray-700/50 flex-shrink-0 flex items-center justify-center">
                    <span className="text-gray-600 text-xs">❌</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${record.result.success ? 'text-green-400' : 'text-red-400'}`}>
                      {record.result.success ? '✅ 成功' : '❌ 失败'}
                    </span>
                    <span className="text-gray-600 text-[10px]">{formatTime(record.timestamp)}</span>
                  </div>
                  {record.result.prompt && (
                    <p className="text-gray-500 text-[11px] truncate mt-0.5" title={record.result.prompt}>
                      {record.result.prompt.slice(0, 60)}...
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {record.result.success && record.result.imageUrl && (
                    <button
                      onClick={() => handleDownload(record.result)}
                      className="p-1 text-gray-500 hover:text-green-400 transition-colors text-xs"
                      title="下载"
                    >
                      📥
                    </button>
                  )}
                  {record.result.success && record.result.prompt && (
                    <button
                      onClick={() => handleCopyPrompt(record.result.prompt)}
                      className="p-1 text-gray-500 hover:text-cyan-400 transition-colors text-xs"
                      title="复制提示词"
                    >
                      📋
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteRecord(record.id)}
                    className="p-1 text-gray-600 hover:text-red-400 transition-colors text-xs"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State (no history, not generating, no result) */}
      {history.length === 0 && !generating && !latestResult && (
        <div className="bg-gray-800/30 rounded-xl border border-dashed border-gray-700 text-center py-16">
          <div className="text-5xl mb-4">🎨</div>
          <p className="text-gray-500 text-sm">尚未生成封面</p>
          <p className="text-gray-600 text-xs mt-1">点击上方"生成封面"按钮开始</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-gray-600 text-[10px] text-right">
        封面图片由 Stable Diffusion 生成 · 本地存储历史记录
      </div>
    </div>
  )
}
