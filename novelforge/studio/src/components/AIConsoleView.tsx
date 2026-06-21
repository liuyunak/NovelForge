import { useState, useEffect, useRef, useCallback } from 'react'
import AIControlPanel from './AIControlPanel'
import ControlCard from './ControlCard'
import { getPipelineStatus } from '../api/client'
import { showToast } from '../utils/logger'

interface Props {
  workspaceId: string
  isGenerating: boolean
  onWrite: (options?: { mode: string; intensity: number; length: number }) => void
  bottomPanel: string | null
  onToggleBottomPanel: (p: string | null) => void
  onShowStats?: () => void
}

const PIPELINE_STAGES = [
  { id: 'planner', label: 'Planner', desc: '章纲+场景卡' },
  { id: 'composer', label: 'Composer', desc: '知识检索' },
  { id: 'pre-audit', label: 'PreAudit', desc: '快速门禁' },
  { id: 'context-prep', label: 'ContextPrep', desc: '前文装配' },
  { id: 'writer', label: 'Writer', desc: '核心生成' },
  { id: 'fast-audit', label: 'FastAudit', desc: '12项检查' },
  { id: 'deep-audit', label: 'DeepAudit', desc: '深度审计' },
  { id: 'analyst', label: 'Analyst', desc: '事实提取' },
  { id: 'polisher', label: 'Polisher', desc: '去AI味' },
  { id: 'memory-update', label: 'Memory', desc: '记忆更新' },
]

export default function AIConsoleView({
  workspaceId,
  isGenerating,
  onWrite,
  onToggleBottomPanel,
  onShowStats,
}: Props) {
  const [pipelineStatus, setPipelineStatus] = useState<string>('空闲')
  const [showBatchConfig, setShowBatchConfig] = useState(false)
  const [batchCount, setBatchCount] = useState(3)
  const [batchGap, setBatchGap] = useState(2)  // seconds between batch chapters

  // Unified write config — single source of truth for sidebar, single-chapter, and batch
  const [writeMode, setWriteMode] = useState('剧情推进')
  const [writeIntensity, setWriteIntensity] = useState(50)
  const [writeLength, setWriteLength] = useState(3000)

  // Ref to track latest isGenerating inside async batch loop
  const generatingRef = useRef(isGenerating)
  useEffect(() => { generatingRef.current = isGenerating }, [isGenerating])

  // Cancellation token for batch loop — cleaned up on unmount
  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    return () => { cancelledRef.current = true }
  }, [])

  /**
   * Wait until generation starts (generatingRef flips to true).
   * Replaces hardcoded 2s delay with state-aware polling.
   */
  const waitForGenerationStart = () => new Promise<void>((resolve, reject) => {
    if (cancelledRef.current) { reject(new Error('cancelled')); return }
    if (generatingRef.current) { resolve(); return }
    const check = setInterval(() => {
      if (cancelledRef.current) { clearInterval(check); reject(new Error('cancelled')); return }
      if (generatingRef.current) { clearInterval(check); resolve() }
    }, 200)
  })

  /**
   * Wait until generation completes (generatingRef flips back to false).
   * Respects cancellation on component unmount.
   */
  const waitForGenerationComplete = () => new Promise<void>((resolve, reject) => {
    if (cancelledRef.current) { reject(new Error('cancelled')); return }
    if (!generatingRef.current) { resolve(); return }
    const check = setInterval(() => {
      if (cancelledRef.current) { clearInterval(check); reject(new Error('cancelled')); return }
      if (!generatingRef.current) {
        clearInterval(check)
        // Small buffer to ensure store state has settled
        setTimeout(resolve, 500)
      }
    }, 500)
  })

  // Adaptive pipeline status polling + event-driven refresh
  // Fast poll (2s) when generating, slow poll (15s) when idle, plus event-driven refresh
  const pollStatus = useCallback(async () => {
    try {
      const result = await getPipelineStatus(workspaceId)
      setPipelineStatus(result.status)
    } catch {
      // ignore network errors
    }
  }, [workspaceId])

  useEffect(() => {
    let active = true
    pollStatus()

    // Adaptive interval: faster when generating, slower when idle
    let intervalId: ReturnType<typeof setInterval> | null = null
    const scheduleNext = () => {
      if (!active) return
      const delay = isGenerating ? 2000 : 15000
      intervalId = setTimeout(async () => {
        if (!active) return
        await pollStatus()
        scheduleNext()
      }, delay)
    }
    scheduleNext()

    // Listen for chapter refresh events as an immediate status update signal
    const onChapterRefresh = () => {
      if (active) pollStatus()
    }
    window.addEventListener('novelforge:refresh-chapters', onChapterRefresh)

    return () => {
      active = false
      if (intervalId) clearTimeout(intervalId)
      window.removeEventListener('novelforge:refresh-chapters', onChapterRefresh)
    }
  }, [workspaceId, isGenerating, pollStatus])

  const statusColor = pipelineStatus === 'running' ? 'text-yellow-400' :
    pipelineStatus === 'paused' ? 'text-orange-400' : 'text-green-400'

  const handleBatchGenerate = async () => {
    if (isGenerating) {
      showToast('当前有章节正在生成中，请等待完成', 'error')
      return
    }
    showToast(`批量生成 ${batchCount} 章 · ${writeMode} · ${writeLength}字/章 · 强度${writeIntensity}% · 间隔${batchGap}秒`, 'info')
    setShowBatchConfig(false)

    for (let i = 0; i < batchCount; i++) {
      // Guard: stop if unmounted or already generating something else
      if (cancelledRef.current) break
      if (generatingRef.current) break

      onWrite({ mode: writeMode, intensity: writeIntensity, length: writeLength })

      // Wait for generation to actually start
      try { await waitForGenerationStart() } catch { break }

      // Wait until this chapter's generation completes
      try { await waitForGenerationComplete() } catch { break }

      // Configurable gap between chapters (except after the last one)
      if (i < batchCount - 1 && batchGap > 0) {
        try {
          await new Promise<void>((resolve, reject) => {
            if (cancelledRef.current) { reject(new Error('cancelled')); return }
            const deadline = Date.now() + batchGap * 1000
            const check = setInterval(() => {
              if (cancelledRef.current) { clearInterval(check); reject(new Error('cancelled')); return }
              if (Date.now() >= deadline) { clearInterval(check); resolve() }
            }, 200)
          })
        } catch { break }
      }
    }
    if (!cancelledRef.current) {
      showToast(`批量生成完成: ${batchCount} 章已生成`, 'success')
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 overflow-y-auto">
        <h2 className="text-white font-bold text-xl mb-2">🤖 AI 写作控制台</h2>
        <p className="text-gray-500 text-sm mb-6">
          工作空间: {workspaceId} · 流水线: <span className={statusColor}>{pipelineStatus}</span>
        </p>

        <div className="space-y-4">
          <ControlCard
            title="单章生成"
            description={`通过完整 DAG 流水线生成一个新章节（${writeMode} · 强度${writeIntensity}% · ${writeLength}字）`}
            buttonText={isGenerating ? '⏳ 生成中...' : '▶ 开始生成'}
            onAction={() => onWrite({ mode: writeMode, intensity: writeIntensity, length: writeLength })}
            disabled={isGenerating}
          />
          <ControlCard
            title="批量生成"
            description={`连续生成多个章节（${writeMode} · ${writeLength}字/章 · 间隔${batchGap}秒 · ${batchCount}章）`}
            buttonText="⚙️ 配置批量"
            onAction={() => setShowBatchConfig(true)}
            disabled={isGenerating}
          />
          <ControlCard
            title="审批管理"
            description="查看待审批的流水线节点，进行人工审批"
            buttonText="查看"
            onAction={() => onToggleBottomPanel('审批')}
          />

          {/* Batch config modal */}
          {showBatchConfig && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96">
                <h3 className="text-white text-lg font-semibold mb-4">批量生成配置</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">生成章数</label>
                    <input type="number" min={1} max={50} value={batchCount}
                      onChange={e => setBatchCount(Number(e.target.value))}
                      className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">写作模式</label>
                    <select value={writeMode} onChange={e => setWriteMode(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                      <option>剧情推进</option><option>爽点制造</option><option>慢节奏铺垫</option>
                      <option>战斗模式</option><option>人物刻画</option><option>世界观扩展</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">生成长度 (字)</label>
                    <div className="flex gap-2">
                      {[500, 1000, 1500, 2000, 3000].map(len => (
                        <button key={len} onClick={() => setWriteLength(len)}
                          className={`flex-1 py-1.5 rounded text-xs ${writeLength === len ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                          {len}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">强度: {writeIntensity}%</label>
                    <input type="range" min={0} max={100} value={writeIntensity}
                      onChange={e => setWriteIntensity(Number(e.target.value))}
                      className="w-full accent-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">章节间隔 (秒)</label>
                    <div className="flex gap-2">
                      {[0, 1, 2, 3, 5].map(gap => (
                        <button key={gap} onClick={() => setBatchGap(gap)}
                          className={`flex-1 py-1.5 rounded text-xs ${batchGap === gap ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                          {gap === 0 ? '无间隔' : `${gap}s`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={handleBatchGenerate}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded transition text-white">
                    🚀 开始批量生成
                  </button>
                  <button onClick={() => setShowBatchConfig(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded transition text-white">
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pipeline visual status */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5 mt-6">
            <h3 className="text-white font-medium text-sm mb-3">📊 DAG 流水线状态</h3>
            <div className="space-y-2">
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition ${
                    isGenerating ? 'bg-purple-600/10 border border-purple-500/20' : 'bg-gray-800/30'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    isGenerating ? 'bg-purple-400 animate-pulse' : 'bg-green-600'
                  }`} />
                  <span className="text-gray-300 font-medium w-24">{stage.label}</span>
                  <span className="text-gray-500 flex-1">{stage.desc}</span>
                  <span className="text-gray-600">{isGenerating ? '待执行' : '就绪'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="w-80 border-l border-gray-800 p-4 overflow-y-auto">
        <AIControlPanel
          onWrite={onWrite}
          isGenerating={isGenerating}
          onToggleBottomPanel={onToggleBottomPanel}
          onShowStats={onShowStats}
          writeMode={writeMode}
          writeIntensity={writeIntensity}
          writeLength={writeLength}
          onWriteModeChange={setWriteMode}
          onWriteIntensityChange={setWriteIntensity}
          onWriteLengthChange={setWriteLength}
        />
      </div>
    </div>
  )
}
