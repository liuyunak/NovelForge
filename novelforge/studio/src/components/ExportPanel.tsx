import { useState, useEffect, useCallback } from 'react'
import {
  exportNovel, batchExport, getExportHistory, getExportFiles, deleteExportFile,
  exportScript, getChapters,
  type ExportHistoryItem,
  type ExportFileItem,
  type ScriptOutput,
} from '../api/client'
import { logError, showToast } from '../utils/logger'

type ExportFormat = 'txt' | 'docx' | 'pdf' | 'epub'

interface Props {
  workspaceId: string
}

const FORMAT_LABELS: Record<ExportFormat, { label: string; icon: string; ext: string; color: string }> = {
  txt:  { label: 'TXT 纯文本',     icon: '📄', ext: '.txt',  color: 'border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20' },
  docx: { label: 'DOCX 文档',      icon: '📝', ext: '.docx', color: 'border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20' },
  pdf:  { label: 'PDF 电子书',     icon: '📕', ext: '.pdf',  color: 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20' },
  epub: { label: 'EPUB 电子书',    icon: '📗', ext: '.epub', color: 'border-green-500/40 bg-green-500/10 hover:bg-green-500/20' },
}

export default function ExportPanel({ workspaceId }: Props) {
  const [selectedFormats, setSelectedFormats] = useState<Set<ExportFormat>>(new Set(['txt']))
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [chapterRangeEnabled, setChapterRangeEnabled] = useState(false)
  const [chapterStart, setChapterStart] = useState(1)
  const [chapterEnd, setChapterEnd] = useState(100)
  const [exporting, setExporting] = useState(false)
  const [exportPhase, setExportPhase] = useState('')
  const [history, setHistory] = useState<ExportHistoryItem[]>([])
  const [files, setFiles] = useState<ExportFileItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [scriptChapter, setScriptChapter] = useState(1)
  const [scriptResult, setScriptResult] = useState<ScriptOutput | null>(null)
  const [scriptPreviewExpanded, setScriptPreviewExpanded] = useState(false)
  const [contentPreview, setContentPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // --- Load export history ---
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await getExportHistory(workspaceId)
      setHistory(res.history || [])
    } catch (e) {
      logError('Failed to load export history', e)
    } finally {
      setLoadingHistory(false)
    }
  }, [workspaceId])

  // --- Load exported files ---
  const loadFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const res = await getExportFiles(workspaceId)
      setFiles(res.files || [])
    } catch (e) {
      logError('Failed to load export files', e)
    } finally {
      setLoadingFiles(false)
    }
  }, [workspaceId])

  useEffect(() => {
    loadHistory()
    loadFiles()
  }, [loadHistory, loadFiles])

  // --- Toggle format selection ---
  const toggleFormat = (fmt: ExportFormat) => {
    setSelectedFormats(prev => {
      const next = new Set(prev)
      if (next.has(fmt)) {
        if (next.size > 1) next.delete(fmt)  // keep at least 1
      } else {
        next.add(fmt)
      }
      return next
    })
  }

  // --- Build options ---
  const buildOptions = () => {
    const opts: { includeMetadata: boolean; chapterRange?: { start: number; end: number } } = { includeMetadata }
    if (chapterRangeEnabled) {
      opts.chapterRange = { start: chapterStart, end: chapterEnd }
    }
    return opts
  }

  // --- Preview content ---
  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const res = await getChapters(workspaceId)
      const chapters = res.chapters || []
      const range = chapterRangeEnabled ? { start: chapterStart, end: chapterEnd } : null
      const filtered = range
        ? chapters.filter((ch: any) => ch.number >= range.start && ch.number <= range.end)
        : chapters

      if (filtered.length === 0) {
        showToast('没有可预览的章节', 'info')
        return
      }

      const previewText = filtered
        .slice(0, 10) // limit to 10 chapters for preview
        .map((ch: any, i: number) => {
          const title = ch.title || `第${ch.number}章`
          const content = ch.content || ''
          const excerpt = content.length > 500 ? content.slice(0, 500) + '\n...' : content
          return `第${ch.number}章 ${title}\n${'─'.repeat(40)}\n${excerpt}\n`
        })
        .join('\n\n')

      setContentPreview(previewText)
    } catch (e) {
      logError('Preview failed', e)
      showToast('加载预览失败', 'error')
    } finally {
      setPreviewLoading(false)
    }
  }

  // --- Single format export ---
  const handleExport = async (format: ExportFormat) => {
    setExporting(true)
    setExportPhase(`正在导出 ${FORMAT_LABELS[format].label}...`)
    try {
      const res = await exportNovel(workspaceId, format, buildOptions())
      showToast(`✅ ${FORMAT_LABELS[format].label} 导出成功`, 'success')
      // Trigger download
      window.open(res.url, '_blank')
      loadHistory()
      loadFiles()
    } catch (e) {
      logError(`Failed to export ${format}`, e)
      showToast(`❌ 导出 ${FORMAT_LABELS[format].label} 失败`, 'error')
    } finally {
      setExporting(false)
      setExportPhase('')
    }
  }

  // --- Batch export ---
  const handleBatchExport = async () => {
    const formats = Array.from(selectedFormats)
    if (formats.length === 0) {
      showToast('请至少选择一种导出格式', 'info')
      return
    }
    setExporting(true)
    setExportPhase(`批量导出 ${formats.length} 种格式...`)
    try {
      const res = await batchExport(workspaceId, formats, buildOptions())
      showToast(`✅ 批量导出完成（${res.files.length} 个文件）`, 'success')
      res.files.forEach(f => window.open(f.url, '_blank'))
      loadHistory()
      loadFiles()
    } catch (e) {
      logError('Batch export failed', e)
      showToast('❌ 批量导出失败', 'error')
    } finally {
      setExporting(false)
      setExportPhase('')
    }
  }

  // --- Export script ---
  const handleExportScript = async () => {
    setExporting(true)
    setExportPhase('正在导出短剧脚本...')
    try {
      const res = await exportScript(workspaceId, scriptChapter)
      setScriptResult(res.script)
      showToast('✅ 短剧脚本导出成功', 'success')
      window.open(res.url, '_blank')
      loadHistory()
      loadFiles()
    } catch (e) {
      logError('Script export failed', e)
      showToast('❌ 短剧脚本导出失败', 'error')
    } finally {
      setExporting(false)
      setExportPhase('')
    }
  }

  // --- Delete exported file ---
  const handleDeleteFile = async (filename: string) => {
    try {
      await deleteExportFile(workspaceId, filename)
      showToast('已删除文件', 'success')
      loadFiles()
      loadHistory()
    } catch (e) {
      logError('Failed to delete file', e)
      showToast('删除文件失败', 'error')
    }
  }

  // --- Format file size ---
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="p-5 space-y-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>📦</span> 导出面板
        </h2>
        <button
          onClick={() => { loadHistory(); loadFiles() }}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
        >
          🔄 刷新
        </button>
      </div>

      {/* ==================== Section 1: Format Selection ==================== */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 space-y-3">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <span>📋</span> 导出格式
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {(Object.entries(FORMAT_LABELS) as [ExportFormat, typeof FORMAT_LABELS[ExportFormat]][]).map(([fmt, info]) => {
            const isSelected = selectedFormats.has(fmt)
            return (
              <button
                key={fmt}
                onClick={() => toggleFormat(fmt)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                  isSelected
                    ? `${info.color} border-opacity-100 scale-105 shadow-lg`
                    : 'border-gray-600/30 bg-gray-800/30 hover:bg-gray-700/40 text-gray-500'
                }`}
              >
                <span className="text-3xl">{info.icon}</span>
                <span className={`text-sm font-medium ${isSelected ? 'text-white' : ''}`}>{info.label}</span>
                <span className={`text-xs ${isSelected ? 'text-gray-300' : 'text-gray-600'}`}>{info.ext}</span>
                {isSelected && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-xs text-white">✓</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ==================== Section 2: Options ==================== */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 space-y-4">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <span>⚙️</span> 导出选项
        </h3>

        {/* Include Metadata */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-gray-300 text-sm">包含元数据</span>
            <p className="text-gray-500 text-xs mt-0.5">在导出文件中附加书名、作者、导出时间等信息</p>
          </div>
          <button
            onClick={() => setIncludeMetadata(!includeMetadata)}
            className={`w-11 h-6 rounded-full transition relative ${includeMetadata ? 'bg-purple-600' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition shadow ${includeMetadata ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Chapter Range */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-gray-300 text-sm">指定章节范围</span>
              <p className="text-gray-500 text-xs mt-0.5">仅导出指定章节，留空则导出全部</p>
            </div>
            <button
              onClick={() => setChapterRangeEnabled(!chapterRangeEnabled)}
              className={`w-11 h-6 rounded-full transition relative ${chapterRangeEnabled ? 'bg-purple-600' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition shadow ${chapterRangeEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          {chapterRangeEnabled && (
            <div className="flex items-center gap-3 bg-gray-900/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs">从第</span>
                <input
                  type="number"
                  min={1}
                  value={chapterStart}
                  onChange={e => setChapterStart(Number(e.target.value))}
                  className="w-16 bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-purple-500 outline-none text-center"
                />
                <span className="text-gray-400 text-xs">章</span>
              </div>
              <span className="text-gray-500">—</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs">到第</span>
                <input
                  type="number"
                  min={1}
                  value={chapterEnd}
                  onChange={e => setChapterEnd(Number(e.target.value))}
                  className="w-16 bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-purple-500 outline-none text-center"
                />
                <span className="text-gray-400 text-xs">章</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== Section 3: Export Actions ==================== */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 space-y-4">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <span>🚀</span> 执行导出
        </h3>

        {/* Progress indicator */}
        {exporting && (
          <div className="bg-purple-600/20 border border-purple-500/30 rounded-lg p-3 flex items-center gap-3">
            <span className="animate-spin text-lg">⏳</span>
            <span className="text-purple-300 text-sm">{exportPhase}</span>
          </div>
        )}

        {/* Single format export buttons */}
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(FORMAT_LABELS) as [ExportFormat, typeof FORMAT_LABELS[ExportFormat]][]).map(([fmt, info]) => (
            <button
              key={fmt}
              onClick={() => handleExport(fmt)}
              disabled={exporting}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${info.color} text-white`}
            >
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </button>
          ))}
        </div>

        {/* Batch export button */}
        <button
          onClick={handleBatchExport}
          disabled={exporting}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2"
        >
          <span>📦</span>
          一键批量导出（{selectedFormats.size} 种格式）
        </button>

        {/* Content Preview */}
        <div className="border-t border-gray-700/50 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs">导出内容预览</span>
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              {previewLoading ? (
                <><span className="animate-spin">⏳</span> 加载中...</>
              ) : (
                <><span>👁️</span> {contentPreview ? '刷新预览' : '预览内容'}</>
              )}
            </button>
          </div>
          {contentPreview ? (
            <div className="bg-gray-900/60 rounded-lg border border-gray-700/30 p-3 max-h-48 overflow-y-auto">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                {contentPreview}
              </pre>
              <div className="mt-2 pt-2 border-t border-gray-700/30 text-[10px] text-gray-500 text-center">
                以上为内容预览（最多显示前 10 章），实际导出包含完整章节
              </div>
            </div>
          ) : (
            <div className="bg-gray-900/30 rounded-lg border border-dashed border-gray-700/40 p-3 text-center">
              <span className="text-xs text-gray-600">点击"预览内容"查看导出效果</span>
            </div>
          )}
        </div>
      </div>

      {/* ==================== Section 4: Script Export ==================== */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 space-y-3">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <span>🎬</span> 短剧脚本导出
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">章节号</span>
            <input
              type="number"
              min={1}
              value={scriptChapter}
              onChange={e => setScriptChapter(Number(e.target.value))}
              className="w-20 bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-purple-500 outline-none text-center"
            />
          </div>
          <button
            onClick={handleExportScript}
            disabled={exporting}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <span>🎬</span> 导出脚本
          </button>
        </div>
        <p className="text-gray-500 text-xs">生成包含镜头、旁白、对话的 JSON 格式短剧脚本</p>

        {/* Script preview metadata */}
        {scriptResult && (
          <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-3 space-y-3">
            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center bg-gray-800/60 rounded p-2">
                <div className="text-orange-400 text-lg font-bold">{scriptResult.metadata?.total_scenes ?? scriptResult.scenes.length}</div>
                <div className="text-gray-500 text-[10px]">场景</div>
              </div>
              <div className="text-center bg-gray-800/60 rounded p-2">
                <div className="text-cyan-400 text-lg font-bold">{scriptResult.metadata?.total_shots ?? '-'}</div>
                <div className="text-gray-500 text-[10px]">镜头</div>
              </div>
              <div className="text-center bg-gray-800/60 rounded p-2">
                <div className="text-green-400 text-lg font-bold">{scriptResult.metadata?.estimated_duration_min ?? '-'}min</div>
                <div className="text-gray-500 text-[10px]">预估时长</div>
              </div>
              <div className="text-center bg-gray-800/60 rounded p-2">
                <div className="text-purple-400 text-lg font-bold">{scriptResult.metadata?.source_chapter ?? '-'}</div>
                <div className="text-gray-500 text-[10px]">源章节</div>
              </div>
            </div>

            {/* Scene list toggle */}
            <button
              onClick={() => setScriptPreviewExpanded(!scriptPreviewExpanded)}
              className="w-full text-xs text-gray-400 hover:text-white transition-colors py-1 flex items-center justify-center gap-1"
            >
              {scriptPreviewExpanded ? '▲ 收起场景列表' : '▼ 展开场景列表'}
            </button>

            {scriptPreviewExpanded && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {scriptResult.scenes.map((scene) => (
                  <div key={scene.scene_id} className="bg-gray-800/40 rounded border border-gray-700/30 p-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-orange-400 font-medium">场景 {scene.scene_id}</span>
                      <span className="text-gray-500">{scene.location}{scene.time ? ` · ${scene.time}` : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scene.shots.map((shot) => (
                        <span
                          key={shot.shot_id}
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            shot.type === 'dialogue' ? 'bg-blue-500/20 text-blue-300' :
                            shot.type === 'narration' ? 'bg-gray-500/20 text-gray-400' :
                            shot.type === 'action' ? 'bg-yellow-500/20 text-yellow-300' :
                            shot.type === 'closeup' ? 'bg-pink-500/20 text-pink-300' :
                            'bg-green-500/20 text-green-300'
                          }`}
                          title={shot.description.slice(0, 60)}
                        >
                          {shot.type === 'dialogue' && shot.character ? `${shot.character}: ` : ''}
                          {shot.description.slice(0, 20)}...
                          {shot.emotion && <span className="ml-1 text-[9px] opacity-60">[{shot.emotion}]</span>}
                          {shot.sfx && <span className="ml-1 text-[9px] opacity-60">[{shot.sfx}]</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== Section 5: Export History ==================== */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 space-y-3">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <span>📜</span> 导出历史
        </h3>
        {loadingHistory ? (
          <div className="text-center py-6 text-gray-500 text-sm">加载中...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
            <p className="text-gray-500 text-sm">暂无导出记录</p>
            <p className="text-gray-600 text-xs mt-1">选择格式后点击导出按钮开始</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-900/40 rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-300 truncate">{item.filename}</span>
                  <span className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-400 uppercase">{item.format}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0 ml-3">
                  <span>{formatSize(item.size)}</span>
                  <span>{item.chapter_count} 章</span>
                  <span>{new Date(item.created_at).toLocaleString('zh-CN')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==================== Section 6: Exported Files ==================== */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 space-y-3">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <span>📁</span> 已导出文件
        </h3>
        {loadingFiles ? (
          <div className="text-center py-6 text-gray-500 text-sm">加载中...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
            <p className="text-gray-500 text-sm">暂无导出文件</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((file, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-900/40 rounded-lg px-3 py-2 text-sm group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-300 truncate">{file.filename}</span>
                  <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
                  <span className="text-xs text-gray-600">{new Date(file.created).toLocaleString('zh-CN')}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <a
                    href={`/api/workspace/${encodeURIComponent(workspaceId)}/export/download/${encodeURIComponent(file.filename)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs transition"
                  >
                    下载
                  </a>
                  <button
                    onClick={() => handleDeleteFile(file.filename)}
                    className="text-red-400 hover:text-red-300 text-xs opacity-0 group-hover:opacity-100 transition"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer timestamp */}
      <div className="text-center text-xs text-gray-600 pb-2">
        最后更新: {new Date().toLocaleString('zh-CN')}
      </div>
    </div>
  )
}
