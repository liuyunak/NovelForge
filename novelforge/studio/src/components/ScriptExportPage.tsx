import { useState, useEffect, useCallback } from 'react'
import {
  exportScript, getChapters,
  type ScriptOutput,
  type ScriptScene,
  type ScriptShot,
} from '../api/client'
import { logError, showToast } from '../utils/logger'

interface Props {
  workspaceId: string
}

interface ChapterMeta {
  number: number
  title: string
}

interface ExportedChapter {
  chapterNumber: number
  chapterTitle: string
  script: ScriptOutput
  url: string
}

const SHOT_TYPE_LABELS: Record<ScriptShot['type'], { label: string; color: string; bg: string; icon: string }> = {
  establishing: { label: '建立镜头', color: 'text-green-300', bg: 'bg-green-500/20 border-green-500/30', icon: '🎬' },
  dialogue:     { label: '对话',     color: 'text-blue-300',  bg: 'bg-blue-500/20 border-blue-500/30',  icon: '💬' },
  action:       { label: '动作',     color: 'text-yellow-300',bg: 'bg-yellow-500/20 border-yellow-500/30',icon: '🎯' },
  closeup:      { label: '特写',     color: 'text-pink-300',  bg: 'bg-pink-500/20 border-pink-500/30',  icon: '🔍' },
  narration:    { label: '旁白',     color: 'text-gray-300',  bg: 'bg-gray-500/20 border-gray-500/30',  icon: '📖' },
}

const EMOTION_LABELS: Record<string, string> = {
  tension: '紧张', anger: '愤怒', sadness: '悲伤', fear: '恐惧',
  surprise: '惊讶', calm: '冷静', joy: '喜悦', contempt: '轻蔑',
}

export default function ScriptExportPage({ workspaceId }: Props) {
  // --- Chapter list ---
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [loadingChapters, setLoadingChapters] = useState(false)

  // --- Selection ---
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set())

  // --- Export state ---
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 })
  const [exportedChapters, setExportedChapters] = useState<ExportedChapter[]>([])

  // --- Preview state ---
  const [previewChapter, setPreviewChapter] = useState<number | null>(null)
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set())
  const [expandedShots, setExpandedShots] = useState<Set<number>>(new Set())

  // --- Editing state ---
  const [editingShot, setEditingShot] = useState<{ chapterIdx: number; sceneIdx: number; shotIdx: number } | null>(null)
  const [editForm, setEditForm] = useState<Partial<ScriptShot>>({})

  // --- Load chapters ---
  const loadChapters = useCallback(async () => {
    setLoadingChapters(true)
    try {
      const res = await getChapters(workspaceId)
      setChapters(res.chapters.map(c => ({ number: c.number, title: c.title })))
    } catch (e) {
      logError('Failed to load chapters', e)
      showToast('❌ 加载章节列表失败', 'error')
    } finally {
      setLoadingChapters(false)
    }
  }, [workspaceId])

  useEffect(() => {
    loadChapters()
  }, [loadChapters])

  // --- Toggle chapter selection ---
  const toggleChapter = (num: number) => {
    setSelectedChapters(prev => {
      const next = new Set(prev)
      if (next.has(num)) {
        next.delete(num)
      } else {
        next.add(num)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (selectedChapters.size === chapters.length) {
      setSelectedChapters(new Set())
    } else {
      setSelectedChapters(new Set(chapters.map(c => c.number)))
    }
  }

  // --- Export selected chapters ---
  const handleExport = async () => {
    if (selectedChapters.size === 0) {
      showToast('⚠️ 请先选择要导出的章节', 'info')
      return
    }

    setExporting(true)
    const chapterNums = Array.from(selectedChapters).sort((a, b) => a - b)
    setExportProgress({ current: 0, total: chapterNums.length })
    const results: ExportedChapter[] = []

    for (let i = 0; i < chapterNums.length; i++) {
      setExportProgress({ current: i + 1, total: chapterNums.length })
      try {
        const res = await exportScript(workspaceId, chapterNums[i])
        const chapterMeta = chapters.find(c => c.number === chapterNums[i])
        results.push({
          chapterNumber: chapterNums[i],
          chapterTitle: chapterMeta?.title || `第${chapterNums[i]}章`,
          script: res.script,
          url: res.url,
        })
      } catch (e) {
        logError(`Script export failed for chapter ${chapterNums[i]}`, e)
        showToast(`❌ 第${chapterNums[i]}章导出失败`, 'error')
      }
    }

    setExportedChapters(results)
    setExporting(false)

    if (results.length > 0) {
      // Auto-preview first exported chapter
      setPreviewChapter(results[0].chapterNumber)
      showToast(`✅ 成功导出 ${results.length}/${chapterNums.length} 章`, 'success')
    }
  }

  // --- Download ---
  const handleDownload = (ec: ExportedChapter) => {
    window.open(ec.url, '_blank')
  }

  const handleDownloadAll = () => {
    exportedChapters.forEach((ec, i) => {
      setTimeout(() => window.open(ec.url, '_blank'), i * 300)
    })
    showToast(`✅ 正在下载 ${exportedChapters.length} 个脚本`, 'success')
  }

  // --- Scene expand toggle ---
  const toggleScene = (sceneId: number) => {
    setExpandedScenes(prev => {
      const next = new Set(prev)
      if (next.has(sceneId)) next.delete(sceneId)
      else next.add(sceneId)
      return next
    })
  }

  const toggleShot = (shotId: number) => {
    setExpandedShots(prev => {
      const next = new Set(prev)
      if (next.has(shotId)) next.delete(shotId)
      else next.add(shotId)
      return next
    })
  }

  // --- Edit shot ---
  const startEdit = (chapterIdx: number, sceneIdx: number, shotIdx: number, shot: ScriptShot) => {
    setEditingShot({ chapterIdx, sceneIdx, shotIdx })
    setEditForm({
      description: shot.description,
      line: shot.line,
      character: shot.character,
      action: shot.action,
      emotion: shot.emotion,
      sfx: shot.sfx,
      duration: shot.duration,
      type: shot.type,
    })
  }

  const saveEdit = () => {
    if (!editingShot) return
    setExportedChapters(prev => {
      const updated = [...prev]
      const ec = updated[editingShot.chapterIdx]
      if (!ec) return prev
      const scene = ec.script.scenes[editingShot.sceneIdx]
      if (!scene) return prev
      const shot = scene.shots[editingShot.shotIdx]
      if (!shot) return prev

      // Apply edits
      if (editForm.description !== undefined) shot.description = editForm.description
      if (editForm.line !== undefined) shot.line = editForm.line
      if (editForm.character !== undefined) shot.character = editForm.character
      if (editForm.action !== undefined) shot.action = editForm.action
      if (editForm.emotion !== undefined) shot.emotion = editForm.emotion || undefined
      if (editForm.sfx !== undefined) shot.sfx = editForm.sfx || undefined
      if (editForm.duration !== undefined) shot.duration = editForm.duration
      if (editForm.type !== undefined) shot.type = editForm.type

      return updated
    })
    setEditingShot(null)
    showToast('✅ 镜头已更新', 'success')
  }

  const cancelEdit = () => {
    setEditingShot(null)
    setEditForm({})
  }

  // --- Compute totals ---
  const totalScenes = exportedChapters.reduce((sum, ec) => sum + ec.script.scenes.length, 0)
  const totalShots = exportedChapters.reduce((sum, ec) => sum + (ec.script.metadata?.total_shots ?? ec.script.scenes.reduce((s, sc) => s + sc.shots.length, 0)), 0)
  const totalDuration = exportedChapters.reduce((sum, ec) => sum + (ec.script.metadata?.estimated_duration_min ?? 0), 0)

  // --- Get preview data ---
  const previewData = previewChapter !== null
    ? exportedChapters.find(ec => ec.chapterNumber === previewChapter)
    : null

  return (
    <div className="p-5 space-y-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>🎬</span> 短剧导出
        </h2>
        <button
          onClick={loadChapters}
          className="text-sm text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800/60"
        >
          🔄 刷新章节
        </button>
      </div>

      {/* Description */}
      <p className="text-gray-500 text-sm leading-relaxed">
        将小说章节转换为短剧/漫剧剧本格式，自动识别场景、对话、旁白、情绪和音效。
        支持多章节批量导出，导出后可编辑镜头细节。
      </p>

      {/* Section 1: Chapter Selection */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
            <span className="w-1 h-4 bg-orange-500 rounded-full" />
            选择章节
          </h3>
          <button
            onClick={toggleAll}
            className="text-xs text-gray-500 hover:text-orange-400 transition-colors"
          >
            {selectedChapters.size === chapters.length ? '取消全选' : '全选'}
          </button>
        </div>

        {loadingChapters ? (
          <div className="text-center py-8 text-gray-500 text-sm">加载中...</div>
        ) : chapters.length === 0 ? (
          <div className="bg-gray-800/30 rounded-xl border border-dashed border-gray-700 text-center py-8">
            <p className="text-gray-500 text-sm">暂无章节</p>
            <p className="text-gray-600 text-xs mt-1">请先创建章节内容</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-48 overflow-y-auto">
              {chapters.map(ch => (
                <button
                  key={ch.number}
                  onClick={() => toggleChapter(ch.number)}
                  className={`text-xs py-2 px-3 rounded-lg border transition-all text-left truncate ${
                    selectedChapters.has(ch.number)
                      ? 'bg-orange-600/20 border-orange-500/50 text-orange-300'
                      : 'bg-gray-900/40 border-gray-700/40 text-gray-500 hover:border-gray-600/50 hover:text-gray-400'
                  }`}
                  title={`第${ch.number}章 ${ch.title}`}
                >
                  <span className="font-mono text-[10px] text-gray-600">Ch{ch.number}</span>
                  <br />
                  {ch.title.slice(0, 8)}{ch.title.length > 8 ? '…' : ''}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>已选 {selectedChapters.size}/{chapters.length} 章</span>
              <button
                onClick={handleExport}
                disabled={exporting || selectedChapters.size === 0}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    导出中 {exportProgress.current}/{exportProgress.total}
                  </>
                ) : (
                  <>
                    <span>🎬</span> 导出选中章节
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Section 2: Results & Preview */}
      {exportedChapters.length > 0 && (
        <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
              <span className="w-1 h-4 bg-cyan-500 rounded-full" />
              导出结果
              <span className="text-gray-600 text-xs font-normal ml-1">
                ({exportedChapters.length} 章 · {totalScenes} 场景 · {totalShots} 镜头 · {totalDuration.toFixed(1)}min)
              </span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadAll}
                className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                📥 下载全部
              </button>
            </div>
          </div>

          {/* Chapter tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {exportedChapters.map(ec => (
              <button
                key={ec.chapterNumber}
                onClick={() => setPreviewChapter(ec.chapterNumber)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  previewChapter === ec.chapterNumber
                    ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-gray-900/40 border-gray-700/40 text-gray-500 hover:border-gray-600/50 hover:text-gray-400'
                }`}
              >
                Ch{ec.chapterNumber}
              </button>
            ))}
          </div>

          {/* Preview */}
          {previewData && (
            <div className="space-y-3">
              {/* Chapter header */}
              <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-3 flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium text-sm">{previewData.script.title}</h4>
                  <div className="flex gap-3 mt-1 text-[11px] text-gray-500">
                    <span>{previewData.script.scenes.length} 场景</span>
                    <span>{previewData.script.metadata?.total_shots ?? '-'} 镜头</span>
                    <span>{previewData.script.metadata?.estimated_duration_min ?? '-'}min</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(previewData)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  📥 下载
                </button>
              </div>

              {/* Scene list */}
              <div className="space-y-2">
                {previewData.script.scenes.map((scene, sceneIdx) => {
                  const ecIdx = exportedChapters.findIndex(ec => ec.chapterNumber === previewChapter)
                  const isExpanded = expandedScenes.has(scene.scene_id)

                  return (
                    <div key={scene.scene_id} className="bg-gray-900/40 rounded-lg border border-gray-700/30 overflow-hidden">
                      {/* Scene header */}
                      <button
                        onClick={() => toggleScene(scene.scene_id)}
                        className="w-full p-3 flex items-center gap-3 hover:bg-gray-800/40 transition-colors text-left"
                      >
                        <span className="text-gray-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400 text-xs font-mono font-bold">
                              S{scene.scene_id}
                            </span>
                            <span className="text-gray-300 text-sm font-medium truncate">
                              {scene.location}
                            </span>
                            {scene.time && (
                              <span className="text-gray-600 text-xs">· {scene.time}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-gray-600 text-[10px]">{scene.shots.length} 镜头</span>
                      </button>

                      {/* Scene shots */}
                      {isExpanded && (
                        <div className="border-t border-gray-700/30 px-3 py-2 space-y-1.5">
                          {scene.shots.map((shot, shotIdx) => {
                            const typeInfo = SHOT_TYPE_LABELS[shot.type]
                            const isShotExpanded = expandedShots.has(shot.shot_id)
                            const isEditing = editingShot?.chapterIdx === ecIdx &&
                              editingShot?.sceneIdx === sceneIdx &&
                              editingShot?.shotIdx === shotIdx

                            return (
                              <div key={shot.shot_id}>
                                <div
                                  className={`group flex items-start gap-2 p-2 rounded border ${typeInfo.bg} cursor-pointer hover:opacity-90 transition-opacity`}
                                  onClick={() => toggleShot(shot.shot_id)}
                                >
                                  <span className="text-xs mt-0.5">{isShotExpanded ? '▼' : '▶'}</span>
                                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${typeInfo.bg} ${typeInfo.color}`}>
                                    {typeInfo.icon} {typeInfo.label}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    {shot.type === 'dialogue' ? (
                                      <div>
                                        {shot.character && (
                                          <span className="text-blue-400 text-xs font-medium">{shot.character}：</span>
                                        )}
                                        <span className="text-gray-300 text-xs">{shot.line || shot.description}</span>
                                        {shot.action && (
                                          <span className="text-gray-500 text-[10px] ml-1">({shot.action})</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-300 text-xs line-clamp-2">{shot.description}</span>
                                    )}
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                      {shot.emotion && (
                                        <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1 rounded">
                                          {EMOTION_LABELS[shot.emotion] || shot.emotion}
                                        </span>
                                      )}
                                      {shot.sfx && (
                                        <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1 rounded">
                                          🔊 {shot.sfx}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-gray-600">{shot.duration}s</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); startEdit(ecIdx, sceneIdx, shotIdx, shot) }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white text-xs transition-opacity px-1.5"
                                    title="编辑"
                                  >
                                    ✏️
                                  </button>
                                </div>

                                {/* Shot detail + inline editor */}
                                {isShotExpanded && (
                                  <div className="ml-8 mt-1 mb-2 bg-gray-900/60 rounded-lg border border-gray-700/30 p-3">
                                    {isEditing ? (
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-gray-500 text-[10px] block mb-1">类型</label>
                                            <select
                                              value={editForm.type || shot.type}
                                              onChange={e => setEditForm(p => ({ ...p, type: e.target.value as ScriptShot['type'] }))}
                                              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none"
                                            >
                                              <option value="establishing">🎬 建立镜头</option>
                                              <option value="dialogue">💬 对话</option>
                                              <option value="action">🎯 动作</option>
                                              <option value="closeup">🔍 特写</option>
                                              <option value="narration">📖 旁白</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-gray-500 text-[10px] block mb-1">时长(秒)</label>
                                            <input
                                              type="number"
                                              min={0.5}
                                              step={0.5}
                                              value={editForm.duration || shot.duration}
                                              onChange={e => setEditForm(p => ({ ...p, duration: Number(e.target.value) }))}
                                              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-gray-500 text-[10px] block mb-1">描述</label>
                                          <textarea
                                            value={editForm.description || shot.description}
                                            onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                                            rows={2}
                                            className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none resize-none"
                                          />
                                        </div>
                                        {editForm.type === 'dialogue' && (
                                          <>
                                            <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                <label className="text-gray-500 text-[10px] block mb-1">角色</label>
                                                <input
                                                  value={editForm.character || ''}
                                                  onChange={e => setEditForm(p => ({ ...p, character: e.target.value }))}
                                                  className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-gray-500 text-[10px] block mb-1">台词</label>
                                                <input
                                                  value={editForm.line || ''}
                                                  onChange={e => setEditForm(p => ({ ...p, line: e.target.value }))}
                                                  className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none"
                                                />
                                              </div>
                                            </div>
                                            <div>
                                              <label className="text-gray-500 text-[10px] block mb-1">动作提示</label>
                                              <input
                                                value={editForm.action || ''}
                                                onChange={e => setEditForm(p => ({ ...p, action: e.target.value }))}
                                                className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none"
                                              />
                                            </div>
                                          </>
                                        )}
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-gray-500 text-[10px] block mb-1">情绪</label>
                                            <select
                                              value={editForm.emotion || ''}
                                              onChange={e => setEditForm(p => ({ ...p, emotion: e.target.value }))}
                                              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none"
                                            >
                                              <option value="">无</option>
                                              <option value="tension">紧张</option>
                                              <option value="anger">愤怒</option>
                                              <option value="sadness">悲伤</option>
                                              <option value="fear">恐惧</option>
                                              <option value="surprise">惊讶</option>
                                              <option value="calm">冷静</option>
                                              <option value="joy">喜悦</option>
                                              <option value="contempt">轻蔑</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-gray-500 text-[10px] block mb-1">音效</label>
                                            <select
                                              value={editForm.sfx || ''}
                                              onChange={e => setEditForm(p => ({ ...p, sfx: e.target.value }))}
                                              className="w-full bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-cyan-500 outline-none"
                                            >
                                              <option value="">无</option>
                                              <option value="thunder">雷声</option>
                                              <option value="explosion">爆炸</option>
                                              <option value="sword">剑鸣</option>
                                              <option value="footsteps">脚步</option>
                                              <option value="wind">风声</option>
                                              <option value="rain">雨声</option>
                                              <option value="fire">火焰</option>
                                              <option value="knocking">敲门</option>
                                              <option value="bell">钟声</option>
                                              <option value="shatter">碎裂</option>
                                              <option value="hum">嗡鸣</option>
                                              <option value="drip">水滴</option>
                                              <option value="silence">静默</option>
                                            </select>
                                          </div>
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                          <button
                                            onClick={saveEdit}
                                            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs py-1.5 rounded-lg font-medium transition-colors"
                                          >
                                            💾 保存修改
                                          </button>
                                          <button
                                            onClick={cancelEdit}
                                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-1.5 rounded-lg transition-colors"
                                          >
                                            取消
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-1">
                                        <div className="flex gap-4 text-[11px]">
                                          <span className="text-gray-500">类型: <span className="text-gray-300">{SHOT_TYPE_LABELS[shot.type].label}</span></span>
                                          <span className="text-gray-500">时长: <span className="text-gray-300">{shot.duration}s</span></span>
                                          {shot.emotion && <span className="text-gray-500">情绪: <span className="text-purple-400">{EMOTION_LABELS[shot.emotion] || shot.emotion}</span></span>}
                                          {shot.sfx && <span className="text-gray-500">音效: <span className="text-amber-400">{shot.sfx}</span></span>}
                                        </div>
                                        {shot.type === 'dialogue' && shot.character && (
                                          <p className="text-blue-400 text-xs">{shot.character}：{shot.line || shot.description}</p>
                                        )}
                                        {shot.action && (
                                          <p className="text-gray-500 text-[11px] italic">动作: {shot.action}</p>
                                        )}
                                        <button
                                          onClick={() => startEdit(ecIdx, sceneIdx, shotIdx, shot)}
                                          className="text-xs text-gray-600 hover:text-cyan-400 transition-colors mt-1"
                                        >
                                          ✏️ 编辑此镜头
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {exportedChapters.length === 0 && !exporting && (
        <div className="bg-gray-800/30 rounded-xl border border-dashed border-gray-700 text-center py-16">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-gray-500 text-sm">尚未导出短剧脚本</p>
          <p className="text-gray-600 text-xs mt-1">选择章节后点击"导出选中章节"按钮</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-gray-600 text-[10px] text-right">
        脚本由 ScriptExporter Agent 自动生成 · 支持手动编辑镜头细节
      </div>
    </div>
  )
}
