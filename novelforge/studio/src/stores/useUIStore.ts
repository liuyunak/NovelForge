/**
 * UI store — 临时 UI 状态
 * 管理模态框、表单等短暂 UI 状态
 */
import { create } from 'zustand'

interface UIState {
  // --- New Book Modal ---
  showNewBook: boolean
  newBookTitle: string
  newBookGenre: string

  // --- Actions ---
  openNewBookModal: () => void
  closeNewBookModal: () => void
  setNewBookTitle: (v: string) => void
  setNewBookGenre: (v: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  showNewBook: false,
  newBookTitle: '',
  newBookGenre: '玄幻修仙',

  openNewBookModal: () => set({ showNewBook: true, newBookTitle: '', newBookGenre: '玄幻修仙' }),
  closeNewBookModal: () => set({ showNewBook: false, newBookTitle: '' }),
  setNewBookTitle: (v) => set({ newBookTitle: v }),
  setNewBookGenre: (v) => set({ newBookGenre: v }),
}))
