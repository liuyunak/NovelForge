import { useEffect, useCallback, useState } from 'react'
import { useParams, useNavigate, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from '../components/ErrorBoundary'
import LeftSidebar, { PageKey } from '../components/LeftSidebar'
import ChapterTree from '../components/ChapterTree'
import MarkdownEditor from '../components/MarkdownEditor'
import AIControlPanel from '../components/AIControlPanel'
import StatusBar from '../components/StatusBar'
import ApprovalPanel from '../components/ApprovalPanel'
import AuditPanel from '../components/AuditPanel'
import CharacterPanel from '../components/CharacterPanel'
import StylePanel from '../components/StylePanel'
import OutlinePanel from '../components/OutlinePanel'
import WorldViewPanel from '../components/WorldViewPanel'
import MemorySystemPanel from '../components/MemorySystemPanel'
import AgentEditor from '../components/AgentEditor'
import DataStats from '../components/DataStats'
import SettingsPanel from '../components/SettingsPanel'
import ProjectManageView from '../components/ProjectManageView'
import AIConsoleView from '../components/AIConsoleView'
import PlotPanel from '../components/PlotPanel'
import RhythmPanel from '../components/RhythmPanel'
import ExportPanel from '../components/ExportPanel'
import CoverGeneratorPanel from '../components/CoverGeneratorPanel'
import ScriptExportPage from '../components/ScriptExportPage'
import DreamPanel from '../components/DreamPanel'
import FineTunePanel from '../components/FineTunePanel'
import RelationshipGraphPanel from '../components/RelationshipGraphPanel'
import AIDetectionPanel from '../components/AIDetectionPanel'
import MdImportDialog from '../components/MdImportDialog'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { useEditorStore } from '../stores/useEditorStore'
import { useUIStore } from '../stores/useUIStore'
import { showToast } from '../utils/logger'
import { scanHooks, triggerDream, deleteWorkspace, renameWorkspace } from '../api/client'

export default function WorkspaceLayout() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // --- Store hooks ---
  const {
    workspaces, currentWorkspace, activePage,
    loadWorkspaces, selectWorkspace, createNewWorkspace,
    deleteCurrentWorkspace, setActivePage,
  } = useWorkspaceStore()

  const {
    chapters, currentChapter, editorContent,
    isGenerating, bottomPanel, todayWords,
    loadChapters, setBottomPanel, handleWrite,
  } = useEditorStore()

  const {
    showNewBook, newBookTitle, newBookGenre,
    openNewBookModal, closeNewBookModal,
    setNewBookTitle, setNewBookGenre,
  } = useUIStore()

  // --- Load workspace on mount or when workspaceId changes ---
  useEffect(() => {
    loadWorkspaces()
    if (workspaceId) {
      selectWorkspace(workspaceId)
      loadChapters(workspaceId)
    }
  }, [workspaceId, loadWorkspaces, selectWorkspace, loadChapters])

  // --- Callbacks ---
  const handleSelectWorkspace = useCallback((ws: { id: string }) => {
    navigate(`/workspace/${ws.id}`)
  }, [navigate])

  const handleNewBook = useCallback(async () => {
    if (!newBookTitle.trim()) return
    const id = await createNewWorkspace(newBookTitle, newBookGenre)
    if (id) {
      closeNewBookModal()
      navigate(`/workspace/${id}`)
    }
  }, [newBookTitle, newBookGenre, createNewWorkspace, closeNewBookModal, navigate])

  const handleDeleteBook = useCallback(async (id: string) => {
    await deleteCurrentWorkspace(id)
    if (currentWorkspace?.id === id) {
      navigate('/')
    }
  }, [currentWorkspace, deleteCurrentWorkspace, navigate])

  const handlePageChange = useCallback((page: PageKey) => {
    setActivePage(page)
    const routeMap: Partial<Record<PageKey, string>> = {
      '写作编辑器': '',
      '项目管理': 'manage',
      '大纲规划': 'outline',
      '人物设定': 'characters',
      '世界观设定': 'worldview',
      '记忆系统': 'memory',
      'AI写作控制台': 'ai-console',
      '审计记录': 'audit',
      '数据统计': 'stats',
      '设置中心': 'settings',
      '智能体编辑器': 'agents',
      '伏笔看板': 'plots',
      '节奏曲线': 'rhythm',
      '导出面板': 'export',
      '封面生成': 'cover',
      '短剧导出': 'script',
      'Dream记忆': 'dream',
      '微调管理': 'finetune',
      '关系图': 'graph',
      'AI检测': 'ai-detect',
    }
    const subPath = routeMap[page]
    if (subPath !== undefined) {
      navigate(subPath ? `/workspace/${workspaceId}/${subPath}` : `/workspace/${workspaceId}`)
    }
  }, [workspaceId, navigate, setActivePage])

  const onWrite = useCallback((options?: { mode: string; intensity: number; length: number }) => {
    if (workspaceId) handleWrite(workspaceId, options)
  }, [workspaceId, handleWrite])

  const handleAutoSummary = useCallback(() => {
    showToast('自动摘要：将在后续版本中通过 AI 自动生成全书概要', 'info')
  }, [])

  const handleChapterSummary = useCallback(() => {
    if (editorContent) {
      const excerpt = editorContent.replace(/[#\n]/g, ' ').slice(0, 200)
      showToast(`章节摘要预览: ${excerpt}...`, 'info')
    } else {
      showToast('暂无章节内容', 'info')
    }
  }, [editorContent])

  const handleShowStats = useCallback(() => {
    navigate(`/workspace/${workspaceId}/stats`)
    setActivePage('数据统计')
  }, [workspaceId, navigate, setActivePage])

  const handleRenameProject = useCallback(async (newTitle: string) => {
    if (!workspaceId || !newTitle.trim()) return
    try {
      await renameWorkspace(workspaceId, newTitle.trim())
      showToast(`项目已重命名为"${newTitle}"`, 'success')
      loadWorkspaces()
    } catch {
      showToast('重命名失败，请稍后重试', 'error')
    }
  }, [workspaceId, loadWorkspaces])

  const handleDeleteProject = useCallback(async () => {
    if (!workspaceId) return
    try {
      await deleteWorkspace(workspaceId)
      showToast('项目已删除', 'success')
      navigate('/')
    } catch (e) {
      showToast('删除失败', 'error')
    }
  }, [workspaceId, navigate])

  // --- Guard: no workspaceId ---
  if (!workspaceId) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a1a] text-white overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          onNewBook={openNewBookModal}
          onDeleteBook={handleDeleteBook}
          activePage={activePage}
          onPageChange={handlePageChange}
        />

        <main className="flex-1 overflow-hidden">
          <ErrorBoundary>
            <Routes>
              {/* Default: editor page */}
              <Route index element={<EditorPage />} />

              {/* Project manage */}
              <Route path="manage" element={
                <ProjectManageView
                  workspace={currentWorkspace!}
                  chapters={chapters}
                  onNavigateEditor={() => {
                    setActivePage('写作编辑器')
                    navigate(`/workspace/${workspaceId}`)
                  }}
                  onRename={handleRenameProject}
                  onDelete={handleDeleteProject}
                />
              } />

              {/* Outline */}
              <Route path="outline" element={
                currentWorkspace ? <OutlinePanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Characters */}
              <Route path="characters" element={
                currentWorkspace ? <CharacterPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Worldview */}
              <Route path="worldview" element={
                currentWorkspace ? <WorldViewPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Memory system */}
              <Route path="memory" element={
                currentWorkspace ? <MemorySystemPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* AI Console */}
              <Route path="ai-console" element={
                currentWorkspace ? (
                  <AIConsoleView
                    workspaceId={currentWorkspace.id}
                    isGenerating={isGenerating}
                    onWrite={onWrite}
                    bottomPanel={bottomPanel}
                    onToggleBottomPanel={setBottomPanel}
                    onShowStats={handleShowStats}
                  />
                ) : null
              } />

              {/* Audit */}
              <Route path="audit" element={
                currentWorkspace ? (
                  <AuditPanel workspaceId={currentWorkspace.id} chapterText={editorContent} chapterNumber={currentChapter} />
                ) : null
              } />

              {/* Stats */}
              <Route path="stats" element={<DataStats chapters={chapters} todayWords={todayWords} />} />

              {/* Settings */}
              <Route path="settings" element={
                <SettingsPanel currentWorkspace={currentWorkspace} />
              } />

              {/* Agent Editor */}
              <Route path="agents" element={<AgentEditor />} />

              {/* Plot Dashboard */}
              <Route path="plots" element={
                currentWorkspace ? <PlotPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Rhythm Curve */}
              <Route path="rhythm" element={
                currentWorkspace ? <RhythmPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Export Panel */}
              <Route path="export" element={
                currentWorkspace ? <ExportPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Cover Generator */}
              <Route path="cover" element={
                currentWorkspace ? <CoverGeneratorPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Script Export */}
              <Route path="script" element={
                currentWorkspace ? <ScriptExportPage workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Dream Panel */}
              <Route path="dream" element={
                currentWorkspace ? <DreamPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* Fine-tune Panel */}
              <Route path="finetune" element={
                currentWorkspace ? <FineTunePanel /> : null
              } />

              {/* Relationship Graph */}
              <Route path="graph" element={
                currentWorkspace ? <RelationshipGraphPanel workspaceId={currentWorkspace.id} /> : null
              } />

              {/* AI Detection */}
              <Route path="ai-detect" element={
                currentWorkspace ? <AIDetectionPanel initialText={editorContent} /> : null
              } />

            </Routes>
          </ErrorBoundary>
        </main>
      </div>

      <StatusBar todayWords={todayWords} monthCost={2.34} workspaceId={workspaceId} />

      {/* New Book Modal */}
      {showNewBook && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">新建项目</h2>
            <input type="text" value={newBookTitle} onChange={e => setNewBookTitle(e.target.value)} placeholder="项目名称"
              className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg mb-3 focus:ring-2 focus:ring-blue-500 outline-none" />
            <select value={newBookGenre} onChange={e => setNewBookGenre(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg mb-4 outline-none">
              <option>玄幻修仙</option><option>都市重生</option><option>科幻末世</option><option>悬疑灵异</option><option>古代言情</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={closeNewBookModal} className="px-4 py-2 text-gray-400 hover:text-white">取消</button>
              <button onClick={handleNewBook} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Editor page with ChapterTree + MarkdownEditor + AIControlPanel + bottom panel drawer.
 * Reads all state from stores instead of props.
 */
function EditorPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const {
    currentChapter, editorContent, chapters,
    isGenerating, bottomPanel,
    setEditorContent, setCurrentChapter, setBottomPanel, handleWrite,
    handleCreateEmptyChapter, handleImportChapter, loadChapters, loadVolumes,
  } = useEditorStore()

  const [showImport, setShowImport] = useState(false)
  const [importTriggerAnalysis, setImportTriggerAnalysis] = useState(true)

  // Shared write config — mirrors AIConsoleView for sidebar controlled state
  const [writeMode, setWriteMode] = useState('剧情推进')
  const [writeIntensity, setWriteIntensity] = useState(50)
  const [writeLength, setWriteLength] = useState(3000)

  if (!currentWorkspace) return null

  const onWrite = (options?: { mode: string; intensity: number; length: number }) => {
    handleWrite(currentWorkspace.id, options)
  }

  const handleAutoSummary = useCallback(() => {
    showToast('自动摘要：将在后续版本中通过 AI 自动生成全书概要', 'info')
  }, [])

  const handleChapterSummary = useCallback(() => {
    if (editorContent) {
      const excerpt = editorContent.replace(/[#\n]/g, ' ').slice(0, 200)
      showToast(`章节摘要预览: ${excerpt}...`, 'info')
    } else {
      showToast('暂无章节内容', 'info')
    }
  }, [editorContent])

  /** Parse multi-chapter Markdown into individual chapters.
   *  Split by `# ` heading (level-1 heading indicates new chapter).
   */
  const parseChaptersFromMd = (md: string): Array<{ title: string; content: string }> => {
    const chapters: Array<{ title: string; content: string }> = []
    // Split by # or ## level headings (line-start, followed by space)
    const blocks = md.split(/(?=^#{1,2}\s)/m)
    for (const block of blocks) {
      const trimmed = block.trim()
      if (!trimmed) continue
      const firstLine = trimmed.split('\n')[0]
      // Strip one or two # characters + optional whitespace
      const title = firstLine.replace(/^#{1,2}\s+/, '').trim() || '未命名章节'
      const content = trimmed
      chapters.push({ title, content })
    }
    return chapters
  }

  const handleChapterImport = async (mdContent: string) => {
    const parsed = parseChaptersFromMd(mdContent)
    if (parsed.length === 0) {
      showToast('未识别到有效章节。请使用 # 标题 分隔各章节。', 'error')
      return
    }

    let imported = 0
    const wsId = currentWorkspace.id

    for (const ch of parsed) {
      const ok = await handleImportChapter(wsId, ch.title, ch.content)
      if (ok) imported++
    }

    showToast(`成功导入 ${imported}/${parsed.length} 章节`, 'success')

    // Trigger downstream analysis if enabled
    if (importTriggerAnalysis && imported > 0) {
      try {
        // Scan for foreshadowing hooks
        const scanResult = await scanHooks(wsId)
        if (scanResult.discovered > 0) {
          showToast(`伏笔扫描: 发现 ${scanResult.discovered} 个新伏笔`, 'info')
        }

        // Trigger dream memory integration
        await triggerDream(wsId).catch(() => {})
      } catch {
        // Downstream analysis is best-effort
      }
    }

    // Refresh
    await loadChapters(wsId)
    await loadVolumes(wsId)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <ChapterTree
        workspaceId={currentWorkspace.id}
        currentChapter={currentChapter}
        onSelectChapter={(num: number, content: string) => { setCurrentChapter(num); setEditorContent(content) }}
        onCreateChapter={handleCreateEmptyChapter}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Editor toolbar */}
        <div className="h-9 bg-[#0d1117] border-b border-gray-800 flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={() => setShowImport(true)}
            className="text-xs px-2.5 py-1 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 rounded transition flex items-center gap-1"
            title="导入已有的 Markdown 章节文件"
          >
            📥 导入章节
          </button>
          <div className="flex-1" />
          <span className="text-gray-600 text-xs">
            {currentChapter > 0 ? `第${currentChapter}章` : '未选择章节'}
          </span>
        </div>

        <MarkdownEditor
          content={editorContent}
          onChange={setEditorContent}
          chapterNumber={currentChapter}
          workspaceTitle={currentWorkspace.title}
        />
        {bottomPanel && (
          <div className="h-80 border-t border-gray-700 overflow-auto bg-[#0d1117]">
            <div className="relative">
              <button onClick={() => setBottomPanel(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-white z-10 text-lg">✕</button>
              {bottomPanel === '审批' && <ApprovalPanel workspaceId={currentWorkspace.id} />}
              {bottomPanel === '审计' && <AuditPanel workspaceId={currentWorkspace.id} chapterText={editorContent} chapterNumber={currentChapter} />}
              {bottomPanel === '角色' && <CharacterPanel workspaceId={currentWorkspace.id} />}
              {bottomPanel === '风格' && <StylePanel workspaceId={currentWorkspace.id} chapterText={editorContent} />}
              {!['审批', '审计', '角色', '风格'].includes(bottomPanel) && (
                <div className="p-4"><h3 className="text-white font-semibold mb-3">{bottomPanel}</h3><p className="text-gray-400 text-sm">{bottomPanel}内容将在此显示</p></div>
              )}
            </div>
          </div>
        )}
      </div>
      <AIControlPanel
        onWrite={onWrite}
        isGenerating={isGenerating}
        onToggleBottomPanel={setBottomPanel}
        onAutoSummary={handleAutoSummary}
        onChapterSummary={handleChapterSummary}
        chapters={chapters}
        currentChapter={currentChapter}
        editorContent={editorContent}
        writeMode={writeMode}
        writeIntensity={writeIntensity}
        writeLength={writeLength}
        onWriteModeChange={setWriteMode}
        onWriteIntensityChange={setWriteIntensity}
        onWriteLengthChange={setWriteLength}
      />
      {/* MD Import Dialog for chapters */}
      <MdImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleChapterImport}
        title="📥 导入已有章节"
        description="粘贴或上传你的已有章节 Markdown 文件，以 # 或 ## 标题 分隔各章节。导入后自动触发伏笔扫描和记忆整合。"
        placeholder={`# 第一章·陨落的天才\n\n曾经的天才少年林风，在宗门大比中被废去修为...\n\n# 第二章·意外传承\n\n坠崖后的林风在山洞中发现了一枚古朴的玉佩...\n\n# 第三章·重归宗门\n\n`}
        parseEntryCount={(md) => parseChaptersFromMd(md).length}
      />
      {/* Import analysis toggle (shown inside dialog area via children trick) — we use a simple approach */}
      {showImport && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[60] bg-[#1a1a2e] border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg">
          <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={importTriggerAnalysis}
              onChange={e => setImportTriggerAnalysis(e.target.checked)}
              className="accent-purple-500 rounded"
            />
            导入后自动触发记忆系统 & 伏笔扫描
          </label>
        </div>
      )}
    </div>
  )
}
