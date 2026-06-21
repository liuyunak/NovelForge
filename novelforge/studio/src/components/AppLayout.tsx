/**
 * @deprecated Replaced by pages/WorkspaceLayout.tsx which uses Zustand stores
 *   and React Router nested routes. This file is kept for reference only.
 */
import { useState, useEffect, useCallback } from 'react'
import LeftSidebar, { PageKey } from './LeftSidebar'
import ChapterTree from './ChapterTree'
import MarkdownEditor from './MarkdownEditor'
import AIControlPanel from './AIControlPanel'
import StatusBar from './StatusBar'
import ApprovalPanel from './ApprovalPanel'
import AuditPanel from './AuditPanel'
import CharacterPanel from './CharacterPanel'
import StylePanel from './StylePanel'
import OutlinePanel from './OutlinePanel'
import WorldViewPanel from './WorldViewPanel'
import MemorySystemPanel from './MemorySystemPanel'
import AgentEditor from './AgentEditor'
import DataStats from './DataStats'
import SettingsPanel from './SettingsPanel'
import WorkbenchView from './WorkbenchView'
import ProjectManageView from './ProjectManageView'
import AIConsoleView from './AIConsoleView'
import { Workspace, WorkspaceDetail, Chapter } from '../types'
import { fetchWorkspaces, createWorkspace, getWorkspace, writeChapter, deleteWorkspace, saveChapter, getChapters } from '../api/client'
import { showToast, logError } from '../utils/logger'

/** Pages that require a workspace to be selected */
const workspaceRequiredPages: PageKey[] = [
  '项目管理', '写作编辑器', '大纲规划', '人物设定',
  '世界观设定', '记忆系统', 'AI写作控制台', '审计记录', '数据统计',
]

export default function AppLayout() {
  // --- Core state ---
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceDetail | null>(null)
  const [activePage, setActivePage] = useState<PageKey>('工作台')

  // --- Editor state (only for the editor page) ---
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [currentChapter, setCurrentChapter] = useState<number>(0)
  const [editorContent, setEditorContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [bottomPanel, setBottomPanel] = useState<string | null>(null)

  // --- UI state ---
  const [showNewBook, setShowNewBook] = useState(false)
  const [newBookTitle, setNewBookTitle] = useState('')
  const [newBookGenre, setNewBookGenre] = useState('玄幻修仙')
  const [todayWords, setTodayWords] = useState(0)

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await fetchWorkspaces()
      setWorkspaces(data.workspaces || [])
    } catch (e) { logError('Failed to load workspaces', e) }
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  /** Navigate to a page. If it requires a workspace and none is selected, prompt creation. */
  const handleNavigate = useCallback((page: PageKey) => {
    setActivePage(page)
    if (workspaceRequiredPages.includes(page) && !currentWorkspace) {
      setShowNewBook(true)
    }
  }, [currentWorkspace])

  const handleSelectWorkspace = useCallback(async (ws: Workspace) => {
    try {
      const data = await getWorkspace(ws.id)
      setCurrentWorkspace(data)

      const chaptersData = await getChapters(ws.id)
      if (chaptersData.chapters && chaptersData.chapters.length > 0) {
        setChapters(chaptersData.chapters)
        const last = chaptersData.chapters[chaptersData.chapters.length - 1]
        setCurrentChapter(last.number)
        setEditorContent(last.content)
      } else {
        setChapters([])
        setCurrentChapter(0)
        setEditorContent('')
      }
      setActivePage('写作编辑器')
    } catch (e) { logError('Failed to select workspace', e) }
  }, [])

  const handleNewBook = useCallback(async () => {
    if (!newBookTitle.trim()) return
    try {
      const result = await createWorkspace({ title: newBookTitle, genre: newBookGenre, corePremise: '' })
      setShowNewBook(false)
      setNewBookTitle('')
      await loadWorkspaces()
      const newWs: WorkspaceDetail = { id: result.id, title: newBookTitle, genre: newBookGenre }
      setCurrentWorkspace(newWs)
      setActivePage('写作编辑器')
    } catch (e) { showToast('创建失败') }
  }, [newBookTitle, newBookGenre, loadWorkspaces])

  const handleDeleteBook = useCallback(async (id: string) => {
    if (!confirm('确定删除？')) return
    try {
      await deleteWorkspace(id)
      if (currentWorkspace?.id === id) {
        setCurrentWorkspace(null)
        setActivePage('工作台')
      }
      await loadWorkspaces()
    } catch (e) { showToast('删除失败') }
  }, [currentWorkspace, loadWorkspaces])

  const handleWrite = useCallback(async () => {
    if (!currentWorkspace) return
    setIsGenerating(true)
    try {
      const nextChapter = currentChapter > 0 ? currentChapter + 1 : 1
      const result = await writeChapter(currentWorkspace.id, nextChapter)
      if (result.success && result.chapterText) {
        await saveChapter(currentWorkspace.id, nextChapter, `第${nextChapter}章`, result.chapterText)
        const newChapter: Chapter = { number: nextChapter, title: `第${nextChapter}章`, content: result.chapterText }
        setChapters(prev => [...prev, newChapter])
        setCurrentChapter(nextChapter)
        setEditorContent(result.chapterText)
        setTodayWords(prev => prev + (result.chapterText?.replace(/\s/g, '').length || 0))
      } else {
        showToast(result.error || '生成失败')
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '生成失败')
    } finally {
      setIsGenerating(false)
    }
  }, [currentWorkspace, currentChapter])

  /**
   * Render the main content area based on active page.
   */
  const renderMainContent = () => {
    // --- Workbench / no-workspace fallback ---
    if (activePage === '工作台' || !currentWorkspace) {
      return <WorkbenchView
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onNewBook={() => setShowNewBook(true)}
        onDeleteBook={handleDeleteBook}
        onNavigatePage={handleNavigate}
      />
    }

    // --- Workspace-independent pages ---
    if (activePage === '设置中心') {
      return <SettingsPanel currentWorkspace={currentWorkspace} />
    }

    if (activePage === '智能体编辑器') {
      return <AgentEditor />
    }

    // --- Workspace-dependent pages ---

    if (activePage === '项目管理') {
      return <ProjectManageView
        workspace={currentWorkspace}
        chapters={chapters}
        onNavigateEditor={() => setActivePage('写作编辑器')}
      />
    }

    if (activePage === '写作编辑器') {
      return (
        <>
          <div className="flex flex-1 overflow-hidden">
            <ChapterTree
              workspaceId={currentWorkspace.id}
              currentChapter={currentChapter}
              onSelectChapter={(num: number, content: string) => { setCurrentChapter(num); setEditorContent(content) }}
            />
            <div className="flex-1 flex flex-col overflow-hidden">
              <MarkdownEditor
                content={editorContent}
                onChange={setEditorContent}
                chapterNumber={currentChapter}
                workspaceTitle={currentWorkspace.title}
              />
              {/* Bottom panel drawer */}
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
            <AIControlPanel onWrite={handleWrite} isGenerating={isGenerating} onToggleBottomPanel={setBottomPanel} />
          </div>
        </>
      )
    }

    if (activePage === '大纲规划') {
      return <OutlinePanel workspaceId={currentWorkspace.id} />
    }

    if (activePage === '人物设定') {
      return <CharacterPanel workspaceId={currentWorkspace.id} />
    }

    if (activePage === '世界观设定') {
      return <WorldViewPanel workspaceId={currentWorkspace.id} />
    }

    if (activePage === '记忆系统') {
      return <MemorySystemPanel workspaceId={currentWorkspace.id} />
    }

    if (activePage === 'AI写作控制台') {
      return <AIConsoleView
        workspaceId={currentWorkspace.id}
        isGenerating={isGenerating}
        onWrite={handleWrite}
        bottomPanel={bottomPanel}
        onToggleBottomPanel={setBottomPanel}
      />
    }

    if (activePage === '审计记录') {
      return <AuditPanel workspaceId={currentWorkspace.id} chapterText={editorContent} chapterNumber={currentChapter} />
    }

    if (activePage === '数据统计') {
      return <DataStats chapters={[]} todayWords={0} />
    }

    // Fallback
    return <WorkbenchView
      workspaces={workspaces}
      currentWorkspace={currentWorkspace}
      onSelectWorkspace={handleSelectWorkspace}
      onNewBook={() => setShowNewBook(true)}
      onDeleteBook={handleDeleteBook}
      onNavigatePage={handleNavigate}
    />
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a1a] text-white overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          onNewBook={() => setShowNewBook(true)}
          onDeleteBook={handleDeleteBook}
          activePage={activePage}
          onPageChange={handleNavigate}
        />

        <main className="flex-1 overflow-hidden">
          {renderMainContent()}
        </main>
      </div>

      <StatusBar todayWords={todayWords} monthCost={2.34} />

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
              <button onClick={() => setShowNewBook(false)} className="px-4 py-2 text-gray-400 hover:text-white">取消</button>
              <button onClick={handleNewBook} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
