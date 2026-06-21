import { useState, useEffect, useCallback } from 'react'
import { getChapters, getVolumes, saveVolumes, VolumeData } from '../api/client'
import { logError, showToast } from '../utils/logger'

interface Props {
  workspaceId: string
  currentChapter: number
  onSelectChapter: (num: number, content: string) => void
  /** Callback after creating a new empty chapter */
  onChapterCreated?: () => void
  /** Delegate chapter creation to parent store (BUG-004 fix: single source of truth) */
  onCreateChapter: (workspaceId: string, title: string, volumeId: string) => Promise<boolean>
}

export default function ChapterTree({ workspaceId, currentChapter, onSelectChapter, onChapterCreated, onCreateChapter }: Props) {
  const [volumes, setVolumes] = useState<VolumeData[]>([])
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set(['v1']))
  const [chapterTitles, setChapterTitles] = useState<Record<number, string>>({})

  // --- Modals ---
  const [showNewVolume, setShowNewVolume] = useState(false)
  const [showNewChapter, setShowNewChapter] = useState(false)
  const [showRenameVolume, setShowRenameVolume] = useState(false)
  const [newVolumeTitle, setNewVolumeTitle] = useState('')
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newChapterVolumeId, setNewChapterVolumeId] = useState('')
  const [renameVolumeId, setRenameVolumeId] = useState('')
  const [renameVolumeTitle, setRenameVolumeTitle] = useState('')
  const [saving, setSaving] = useState(false)

  // --- Context menu ---
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; volumeId?: string; chapterNum?: number } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [chData, volData] = await Promise.all([
        getChapters(workspaceId),
        getVolumes(workspaceId),
      ])
      const titles: Record<number, string> = {}
      if (chData.chapters) {
        for (const ch of chData.chapters) {
          titles[ch.number] = ch.title
        }
      }
      setChapterTitles(titles)

      if (volData.volumes && volData.volumes.length > 0) {
        setVolumes(volData.volumes)
      } else {
        // FIXME: Fallback for workspaces created before volumes endpoint existed
        if (chData.chapters && chData.chapters.length > 0) {
          const chNums = chData.chapters.map(ch => ch.number)
          const fallback: VolumeData[] = [{ id: 'v1', title: '卷一', chapters: chNums }]
          setVolumes(fallback)
          try { await saveVolumes(workspaceId, fallback) } catch { /* best-effort */ }
        } else {
          setVolumes([{ id: 'v1', title: '卷一', chapters: [] }])
        }
      }
    } catch (e) {
      logError('Failed to load chapters/volumes', e)
    }
  }, [workspaceId])

  useEffect(() => { loadData() }, [loadData])

  // Refresh when chapters are cycled externally (e.g. after handleWrite)
  useEffect(() => {
    const handler = () => loadData()
    window.addEventListener('novelforge:refresh-chapters', handler)
    return () => window.removeEventListener('novelforge:refresh-chapters', handler)
  }, [loadData])

  const handleChapterClick = async (num: number) => {
    try {
      const data = await getChapters(workspaceId)
      const chapter = data.chapters?.find(ch => ch.number === num)
      if (chapter) {
        onSelectChapter(num, chapter.content)
      }
    } catch (e) {
      logError('Failed to load chapter', e)
      showToast('加载章节内容失败，请稍后重试', 'error')
    }
  }

  const toggleVolume = (id: string) => {
    const next = new Set(expandedVolumes)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpandedVolumes(next)
  }

  // --- Volume creation ---
  const handleCreateVolume = async () => {
    const title = newVolumeTitle.trim()
    if (!title) return
    setSaving(true)
    try {
      const newVol: VolumeData = {
        id: `v${crypto.randomUUID().slice(0, 8)}`,
        title,
        chapters: [],
      }
      const updated = [...volumes, newVol]
      await saveVolumes(workspaceId, updated)
      setVolumes(updated)
      setExpandedVolumes(prev => new Set(prev).add(newVol.id))
      setNewVolumeTitle('')
      setShowNewVolume(false)
    } catch (e) {
      logError('Failed to create volume', e)
      showToast('创建卷失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  // --- Chapter creation (delegates to store for single source of truth) ---
  const handleCreateChapter = async () => {
    const title = newChapterTitle.trim()
    if (!title || !newChapterVolumeId) {
      showToast('请输入章节标题并选择所属卷', 'error')
      return
    }
    setSaving(true)
    try {
      const ok = await onCreateChapter(workspaceId, title, newChapterVolumeId)
      if (ok) {
        setNewChapterTitle('')
        setShowNewChapter(false)
        onChapterCreated?.()
        // Reload local data to sync with store state
        await loadData()
      }
    } catch (e) {
      logError('Failed to create chapter', e)
      showToast('创建章节失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  // --- Right-click context menu ---
  const handleContextMenu = (e: React.MouseEvent, volumeId?: string, chapterNum?: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, volumeId, chapterNum })
  }

  const handleRenameVolume = () => {
    if (!contextMenu?.volumeId) return
    const vol = volumes.find(v => v.id === contextMenu.volumeId)
    setRenameVolumeId(contextMenu.volumeId)
    setRenameVolumeTitle(vol?.title || '')
    setShowRenameVolume(true)
    setContextMenu(null)
  }

  const handleRenameVolumeConfirm = async () => {
    const newName = renameVolumeTitle.trim()
    if (!newName) return
    setSaving(true)
    try {
      const updated = volumes.map(v => v.id === renameVolumeId ? { ...v, title: newName } : v)
      await saveVolumes(workspaceId, updated)
      setVolumes(updated)
      setShowRenameVolume(false)
      showToast(`已重命名为"${newName}"`, 'success')
    } catch (e) {
      logError('Failed to rename volume', e)
      showToast('重命名卷失败，请稍后重试', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVolume = async () => {
    if (!contextMenu?.volumeId) return
    if (volumes.length <= 1) { showToast('至少保留一个卷', 'error'); setContextMenu(null); return }
    if (!confirm('确定删除该卷？卷内章节不会被删除，将移入默认卷。')) { setContextMenu(null); return }
    const targetId = contextMenu.volumeId
    setContextMenu(null)
    try {
      const targetVol = volumes.find(v => v.id === targetId)
      const defaultVol = volumes[0].id === targetId ? volumes[1] : volumes[0]
      const updated = volumes
        .filter(v => v.id !== targetId)
        .map(v => {
          if (v.id === defaultVol.id && targetVol) {
            return { ...v, chapters: [...v.chapters, ...targetVol.chapters].sort((a, b) => a - b) }
          }
          return v
        })
      await saveVolumes(workspaceId, updated)
      setVolumes(updated)
      showToast(`卷"${targetVol?.title}"已删除`, 'success')
    } catch (e) {
      logError('Failed to delete volume', e)
      showToast('删除卷失败，请稍后重试', 'error')
    }
  }

  const handleMoveChapter = async (toVolumeId: string) => {
    if (!contextMenu?.chapterNum) return
    const chNum = contextMenu.chapterNum
    setContextMenu(null)
    try {
      const updated = volumes.map(v => {
        if (v.chapters.includes(chNum)) {
          return { ...v, chapters: v.chapters.filter(c => c !== chNum) }
        }
        if (v.id === toVolumeId) {
          return { ...v, chapters: [...v.chapters, chNum].sort((a, b) => a - b) }
        }
        return v
      })
      await saveVolumes(workspaceId, updated)
      setVolumes(updated)
      const targetVol = volumes.find(v => v.id === toVolumeId)
      showToast(`已将第${chNum}章移至"${targetVol?.title || toVolumeId}"`, 'success')
    } catch (e) {
      logError('Failed to move chapter', e)
      showToast('移动章节失败，请稍后重试', 'error')
    }
  }

  // Close context menu on any click
  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  return (
    <div className="w-[250px] bg-[#0d1117] border-r border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-white font-semibold text-sm">章节目录</span>
        <button
          onClick={loadData}
          className="text-gray-400 hover:text-white text-sm px-1"
          title="刷新"
        >
          🔄
        </button>
      </div>

      {/* Volume & Chapter tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {volumes.map(vol => (
          <div key={vol.id}>
            <button
              onClick={() => toggleVolume(vol.id)}
              onContextMenu={e => handleContextMenu(e, vol.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              <span className="text-xs">{expandedVolumes.has(vol.id) ? '▼' : '▶'}</span>
              <span className="truncate">{vol.title}</span>
              <span className="ml-auto text-gray-600 text-[10px]">{vol.chapters.length}</span>
            </button>
            {expandedVolumes.has(vol.id) && (
              <div className="ml-4">
                {vol.chapters.length === 0 ? (
                  <p className="px-3 py-2 text-gray-600 text-xs italic">暂无章节</p>
                ) : (
                  vol.chapters.map(chNum => (
                    <button
                      key={chNum}
                      onClick={() => handleChapterClick(chNum)}
                      onContextMenu={e => handleContextMenu(e, undefined, chNum)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded transition ${
                        currentChapter === chNum
                          ? 'bg-purple-600/20 text-purple-300'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{chNum}. {chapterTitles[chNum] || `第${chNum}章`}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t border-gray-800 space-y-1">
        <button
          onClick={() => { setShowNewVolume(true); setNewVolumeTitle('') }}
          className="w-full text-left text-gray-400 hover:text-white text-sm px-3 py-1.5 hover:bg-gray-800 rounded transition"
        >
          + 新建卷
        </button>
        <button
          onClick={() => {
            if (volumes.length === 0) { showToast('请先创建卷', 'error'); return }
            setShowNewChapter(true)
            setNewChapterTitle('')
            setNewChapterVolumeId(volumes[0].id)
          }}
          className="w-full text-left text-gray-400 hover:text-white text-sm px-3 py-1.5 hover:bg-gray-800 rounded transition"
        >
          + 新建章
        </button>
      </div>

      {/* --- New Volume Modal --- */}
      {showNewVolume && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNewVolume(false)}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">📁 新建卷</h2>
            <input
              type="text"
              value={newVolumeTitle}
              onChange={e => setNewVolumeTitle(e.target.value)}
              placeholder="卷名，如：卷一·凡人界篇"
              className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 mb-4"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateVolume()}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewVolume(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
              <button
                onClick={handleCreateVolume}
                disabled={!newVolumeTitle.trim() || saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg text-sm"
              >
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- New Chapter Modal --- */}
      {showNewChapter && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNewChapter(false)}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">✍️ 新建章节</h2>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={newChapterTitle}
                onChange={e => setNewChapterTitle(e.target.value)}
                placeholder="章节标题"
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreateChapter()}
              />
              <select
                value={newChapterVolumeId}
                onChange={e => setNewChapterVolumeId(e.target.value)}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
              >
                {volumes.map(v => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewChapter(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
              <button
                onClick={handleCreateChapter}
                disabled={!newChapterTitle.trim() || saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg text-sm"
              >
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Rename Volume Modal --- */}
      {showRenameVolume && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowRenameVolume(false)}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">✏️ 重命名卷</h2>
            <input
              type="text"
              value={renameVolumeTitle}
              onChange={e => setRenameVolumeTitle(e.target.value)}
              placeholder="输入新的卷名"
              className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 mb-4"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleRenameVolumeConfirm()}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRenameVolume(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
              <button
                onClick={handleRenameVolumeConfirm}
                disabled={!renameVolumeTitle.trim() || saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg text-sm"
              >
                {saving ? '保存中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Context Menu --- */}
      {contextMenu && (
        <div
          className="fixed bg-[#1a1a2e] border border-gray-700 rounded-lg py-1 shadow-2xl z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.volumeId && !contextMenu.chapterNum && (
            <>
              <button onClick={handleRenameVolume} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition">
                ✏️ 重命名卷
              </button>
              <button onClick={handleDeleteVolume} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 transition">
                🗑️ 删除卷
              </button>
            </>
          )}
          {contextMenu.chapterNum && (
            <>
              <div className="px-4 py-1.5 text-gray-500 text-xs">移动到...</div>
              {volumes.map(v => (
                <button
                  key={v.id}
                  onClick={() => handleMoveChapter(v.id)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition"
                >
                  📁 {v.title}
                </button>
              ))}
            </>
          )}
          {!contextMenu.volumeId && !contextMenu.chapterNum && (
            <div className="px-4 py-2 text-gray-500 text-xs">无操作</div>
          )}
        </div>
      )}
    </div>
  )
}
