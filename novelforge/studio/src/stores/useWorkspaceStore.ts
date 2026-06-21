/**
 * Workspace store — 工作区核心状态
 * 管理工作区列表、当前工作区、页面导航
 */
import { create } from 'zustand'
import type { Workspace, WorkspaceDetail, PageKey } from '../types'
import {
  fetchWorkspaces,
  createWorkspace,
  getWorkspace,
  deleteWorkspace,
} from '../api/client'
import { showToast, logError } from '../utils/logger'

interface WorkspaceState {
  // --- Data ---
  workspaces: Workspace[]
  currentWorkspace: WorkspaceDetail | null
  activePage: PageKey

  // --- Actions ---
  loadWorkspaces: () => Promise<void>
  selectWorkspace: (wsOrId: Workspace | string) => Promise<void>
  createNewWorkspace: (title: string, genre: string) => Promise<string | null>
  deleteCurrentWorkspace: (id: string) => Promise<void>
  setActivePage: (page: PageKey) => void
  setCurrentWorkspace: (ws: WorkspaceDetail | null) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  activePage: '写作编辑器',

  loadWorkspaces: async () => {
    try {
      const data = await fetchWorkspaces()
      set({ workspaces: data.workspaces || [] })
    } catch (e) { logError('Failed to load workspaces', e) }
  },

  selectWorkspace: async (wsOrId: Workspace | string | undefined) => {
    if (!wsOrId) return
    try {
      const id = typeof wsOrId === 'string' ? wsOrId : wsOrId.id
      const data = await getWorkspace(id)
      set({ currentWorkspace: data, activePage: '写作编辑器' })
    } catch (e) { logError('Failed to load workspace', e) }
  },

  createNewWorkspace: async (title: string, genre: string) => {
    try {
      const result = await createWorkspace({ title, genre, corePremise: '' })
      await get().loadWorkspaces()
      return result.id
    } catch (e) {
      showToast('创建失败')
      return null
    }
  },

  deleteCurrentWorkspace: async (id: string) => {
    if (!confirm('确定删除？')) return
    try {
      await deleteWorkspace(id)
      const { currentWorkspace } = get()
      if (currentWorkspace?.id === id) {
        set({ currentWorkspace: null })
      }
      await get().loadWorkspaces()
    } catch (e) { showToast('删除失败') }
  },

  setActivePage: (page) => set({ activePage: page }),

  setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),
}))
