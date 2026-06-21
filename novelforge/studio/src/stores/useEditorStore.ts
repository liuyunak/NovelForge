/**
 * Editor store — 编辑器状态
 * 管理章节、当前编辑内容、AI 生成状态、卷管理
 */
import { create } from 'zustand'
import type { Chapter } from '../types'
import { writeChapter, saveChapter, getChapters, getVolumes, saveVolumes, VolumeData } from '../api/client'
import { showToast, logError } from '../utils/logger'
import { countWords } from '../utils/text'

interface EditorState {
  // --- Data ---
  chapters: Chapter[]
  volumes: VolumeData[]
  currentChapter: number
  editorContent: string
  isGenerating: boolean
  bottomPanel: string | null
  todayWords: number

  // --- Actions ---
  loadChapters: (workspaceId: string) => Promise<void>
  loadVolumes: (workspaceId: string) => Promise<void>
  setEditorContent: (v: string) => void
  setCurrentChapter: (n: number) => void
  setBottomPanel: (p: string | null) => void
  toggleBottomPanel: (p: string | null) => void
  handleWrite: (workspaceId: string, options?: { mode: string; intensity: number; length: number }) => Promise<void>
  handleCreateEmptyChapter: (workspaceId: string, title: string, volumeId: string) => Promise<boolean>
  handleImportChapter: (workspaceId: string, title: string, content: string, volumeId?: string) => Promise<boolean>
  addTodayWords: (n: number) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  chapters: [],
  volumes: [],
  currentChapter: 0,
  editorContent: '',
  isGenerating: false,
  bottomPanel: null,
  todayWords: 0,

  loadChapters: async (workspaceId: string) => {
    try {
      const data = await getChapters(workspaceId)
      if (data.chapters && data.chapters.length > 0) {
        set({ chapters: data.chapters })
        const last = data.chapters[data.chapters.length - 1]
        set({ currentChapter: last.number, editorContent: last.content })
      } else {
        set({ chapters: [], currentChapter: 0, editorContent: '' })
      }
    } catch (e) { logError('Failed to load chapters', e) }
  },

  loadVolumes: async (workspaceId: string) => {
    try {
      const data = await getVolumes(workspaceId)
      if (data.volumes && data.volumes.length > 0) {
        set({ volumes: data.volumes })
      }
    } catch (e) { logError('Failed to load volumes', e) }
  },

  setEditorContent: (v) => set({ editorContent: v }),

  setCurrentChapter: (n) => set({ currentChapter: n }),

  setBottomPanel: (p) => set({ bottomPanel: p }),

  toggleBottomPanel: (p) => {
    const { bottomPanel } = get()
    set({ bottomPanel: bottomPanel === p ? null : p })
  },

  handleWrite: async (workspaceId: string, options?: { mode: string; intensity: number; length: number }) => {
    if (!workspaceId) return
    set({ isGenerating: true })
    try {
      const { currentChapter } = get()
      const nextChapter = currentChapter > 0 ? currentChapter + 1 : 1
      const result = await writeChapter(workspaceId, nextChapter, options)

      if (result.success && result.chapterText) {
        await saveChapter(workspaceId, nextChapter, `第${nextChapter}章`, result.chapterText)
        const chapterText = result.chapterText // Narrowed: guaranteed non-null by if-check
        const newChapter: Chapter = {
          number: nextChapter,
          title: `第${nextChapter}章`,
          content: chapterText,
        }
        set((state) => ({
          chapters: [...state.chapters, newChapter],
          currentChapter: nextChapter,
          editorContent: chapterText,
          todayWords: state.todayWords + countWords(chapterText),
        }))
      } else {
        showToast(result.error || '生成失败', 'error')
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '生成失败', 'error')
    } finally {
      set({ isGenerating: false })
    }
  },

  /** Create an empty chapter manually (no AI generation) */
  handleCreateEmptyChapter: async (workspaceId: string, title: string, volumeId: string) => {
    try {
      const { chapters } = get()
      let nextNum = 1
      for (const ch of chapters) {
        if (ch.number >= nextNum) nextNum = ch.number + 1
      }

      const content = `# ${title}\n\n（空章节，开始创作...）\n`
      await saveChapter(workspaceId, nextNum, title, content)

      const newChapter: Chapter = { number: nextNum, title, content }
      set((state) => ({
        chapters: [...state.chapters, newChapter],
        currentChapter: nextNum,
        editorContent: content,
      }))

      // Update volumes
      const { volumes } = get()
      if (volumes.length > 0) {
        const updated = volumes.map(v =>
          v.id === volumeId ? { ...v, chapters: [...v.chapters, nextNum].sort((a, b) => a - b) } : v
        )
        await saveVolumes(workspaceId, updated)
        set({ volumes: updated })
      }

      showToast(`成功创建"${title}"`, 'success')
      return true
    } catch (e) {
      logError('Failed to create empty chapter', e)
      showToast('创建章节失败', 'error')
      return false
    }
  },

  /** Import a chapter from Markdown content (for users with existing drafts) */
  handleImportChapter: async (workspaceId: string, title: string, content: string, volumeId?: string) => {
    try {
      const { chapters } = get()
      let nextNum = 1
      for (const ch of chapters) {
        if (ch.number >= nextNum) nextNum = ch.number + 1
      }

      await saveChapter(workspaceId, nextNum, title, content)
      const newChapter: Chapter = { number: nextNum, title, content }
      set((state) => ({
        chapters: [...state.chapters, newChapter],
        currentChapter: nextNum,
        editorContent: content,
        todayWords: state.todayWords + countWords(content),
      }))

      // Update volumes
      if (volumeId) {
        const { volumes } = get()
        if (volumes.length > 0) {
          const targetVol = volumes.find(v => v.id === volumeId)
          const targetId = targetVol ? volumeId : volumes[0].id
          const updated = volumes.map(v =>
            v.id === targetId ? { ...v, chapters: [...v.chapters, nextNum].sort((a, b) => a - b) } : v
          )
          await saveVolumes(workspaceId, updated)
          set({ volumes: updated })
        }
      }

      // Dispatch event for ChapterTree to refresh
      window.dispatchEvent(new CustomEvent('novelforge:refresh-chapters'))

      showToast(`成功导入"${title}" (${countWords(content)} 字)`, 'success')
      return true
    } catch (e) {
      logError('Failed to import chapter', e)
      showToast('导入章节失败', 'error')
      return false
    }
  },

  addTodayWords: (n) => set((s) => ({ todayWords: s.todayWords + n })),
}))
