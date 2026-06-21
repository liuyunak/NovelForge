import { useState, useMemo } from 'react'
import type { Chapter } from '../types'
import { showToast } from '../utils/logger'
import { countWords } from '../utils/text'

interface WriteOptions {
  mode: string
  intensity: number
  length: number
}

interface Props {
  onWrite: (options?: WriteOptions) => void
  isGenerating: boolean
  onToggleBottomPanel: (panel: string | null) => void
  onAutoSummary?: () => void
  onChapterSummary?: () => void
  onShowStats?: () => void
  chapters?: Chapter[]
  currentChapter?: number
  editorContent?: string
  /** Shared write config — controlled from parent */
  writeMode: string
  writeIntensity: number
  writeLength: number
  onWriteModeChange: (mode: string) => void
  onWriteIntensityChange: (intensity: number) => void
  onWriteLengthChange: (length: number) => void
}

const writeModes = ['剧情推进', '爽点制造', '慢节奏铺垫', '战斗模式', '人物刻画', '世界观扩展']
const genLengths = [500, 1000, 1500, 3000]

export default function AIControlPanel({
  onWrite, isGenerating, onToggleBottomPanel,
  onAutoSummary, onChapterSummary, onShowStats,
  chapters, currentChapter, editorContent,
  writeMode, writeIntensity, writeLength,
  onWriteModeChange, onWriteIntensityChange, onWriteLengthChange,
}: Props) {
  const [activeBottom, setActiveBottom] = useState<string | null>(null)

  const bottomPanels = ['审批', '审计', '角色', '风格', '大纲规划', '记忆系统']

  const handleBottomToggle = (panel: string) => {
    const newVal = activeBottom === panel ? null : panel
    setActiveBottom(newVal)
    onToggleBottomPanel(newVal)
  }

  const handleGenerate = (length: number) => {
    onWrite({ mode: writeMode, intensity: writeIntensity, length })
    // Show estimated time
    const estimated = Math.round(length / 100)
    showToast(`开始生成约${length}字 (${writeMode}模式·强度${writeIntensity}%)，预计${estimated}秒`, 'info')
  }

  // Dynamic context info from real data
  const contextInfo = useMemo(() => {
    const ch = chapters?.find(c => c.number === currentChapter)
    const prevCh = chapters?.find(c => c.number === (currentChapter || 0) - 1)
    const wordCount = countWords(editorContent)
    const totalWords = chapters?.reduce((s, c) => s + countWords(c.content), 0) || 0

    return {
      currentTitle: ch?.title || (currentChapter ? `第${currentChapter}章` : '未选择'),
      wordCount,
      totalChapters: chapters?.length || 0,
      totalWords,
      prevChapterTitle: prevCh?.title || '无前一章',
    }
  }, [chapters, currentChapter, editorContent])

  return (
    <div className="w-[320px] bg-[#0d1117] border-l border-gray-800 flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-gray-800 flex items-center gap-2">
        <span className="text-xl">🤖</span>
        <h2 className="text-white font-bold">AI写作控制台</h2>
      </div>

      <div className="p-4 space-y-5">
        <div>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-purple-400 text-sm">✦</span>
            <span className="text-gray-300 text-sm font-medium">写作模式</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {writeModes.map(mode => (
              <button key={mode} onClick={() => onWriteModeChange(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs transition ${
                  writeMode === mode ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>{mode}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300 text-sm">生成强度</span>
            <span className="text-purple-400 text-xs">{writeIntensity}%</span>
          </div>
          <input type="range" min="0" max="100" value={writeIntensity} onChange={e => onWriteIntensityChange(Number(e.target.value))} className="w-full accent-purple-500" />
          <div className="flex justify-between text-xs text-gray-600 mt-1"><span>保守</span><span>激进</span></div>
        </div>

        <div>
          <div className="text-gray-300 text-sm mb-2">生成长度</div>
          <div className="flex gap-2">
            {genLengths.map(len => (
              <button key={len} onClick={() => onWriteLengthChange(len)}
                className={`flex-1 py-2 rounded-lg text-sm transition ${
                  writeLength === len ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>{len}字</button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-gray-300 text-sm mb-2">一键操作</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleGenerate(1500)}
              disabled={isGenerating}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white py-2 px-3 rounded-lg text-xs transition">
              {isGenerating ? '⏳ 生成中...' : '▶ 续写1500字'}
            </button>
            <button
              onClick={() => handleGenerate(3000)}
              disabled={isGenerating}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white py-2 px-3 rounded-lg text-xs transition">
              📝 生成3000字整章
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onAutoSummary}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-xs transition">
              🔍 自动摘要
            </button>
            <button
              onClick={onChapterSummary}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-xs transition">
              📋 章节总结
            </button>
            <button
              onClick={onShowStats}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-xs transition">
              📊 数据统计
            </button>
          </div>
        </div>

        <div>
          <div className="text-gray-300 text-sm mb-2">底部面板</div>
          <div className="flex flex-wrap gap-2">
            {bottomPanels.map(panel => (
              <button key={panel} onClick={() => handleBottomToggle(panel)}
                className={`px-3 py-1.5 rounded-lg text-xs transition ${
                  activeBottom === panel ? 'bg-purple-600/30 text-purple-300 border border-purple-500' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>{panel}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto p-4 border-t border-gray-800 space-y-3">
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">📖 当前章节</div>
          <p className="text-xs text-gray-300">{contextInfo.currentTitle}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{contextInfo.wordCount.toLocaleString()} 字</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">📚 全书概览</div>
          <p className="text-[10px] text-gray-400">
            {contextInfo.totalChapters}章 · {(contextInfo.totalWords / 10000).toFixed(1)}万字
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5">前一章: {contextInfo.prevChapterTitle}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">⚙️ 当前配置</div>
          <p className="text-[10px] text-gray-400">
            模式: {writeMode} · 强度: {writeIntensity}% · {writeLength}字
          </p>
        </div>
      </div>
    </div>
  )
}
