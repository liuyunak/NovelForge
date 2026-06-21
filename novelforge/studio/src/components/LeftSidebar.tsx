import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Workspace, WorkspaceDetail, PageKey } from '../types'

export type { PageKey }

interface Props {
  workspaces: Workspace[]
  currentWorkspace: WorkspaceDetail | null
  onSelectWorkspace: (ws: Workspace) => void
  onNewBook: () => void
  onDeleteBook: (id: string) => void
  activePage: PageKey
  onPageChange: (page: PageKey) => void
}

const navItems: { icon: string; label: PageKey; needWorkspace?: boolean }[] = [
  { icon: '📁', label: '项目管理', needWorkspace: true },
  { icon: '✍️', label: '写作编辑器', needWorkspace: true },
  { icon: '📋', label: '大纲规划', needWorkspace: true },
  { icon: '👤', label: '人物设定', needWorkspace: true },
  { icon: '🌍', label: '世界观设定', needWorkspace: true },
  { icon: '🧠', label: '记忆系统', needWorkspace: true },
  { icon: '🤖', label: 'AI写作控制台', needWorkspace: true },
  { icon: '🎯', label: '伏笔看板', needWorkspace: true },
  { icon: '📈', label: '节奏曲线', needWorkspace: true },
  { icon: '📦', label: '导出面板', needWorkspace: true },
  { icon: '🎨', label: '封面生成', needWorkspace: true },
  { icon: '🎬', label: '短剧导出', needWorkspace: true },
  { icon: '🌙', label: 'Dream记忆', needWorkspace: true },
  { icon: '📊', label: '审计记录', needWorkspace: true },
  { icon: '📈', label: '数据统计', needWorkspace: true },
  { icon: '🎯', label: '微调管理', needWorkspace: true },
  { icon: '🕸️', label: '关系图', needWorkspace: true },
  { icon: '🔍', label: 'AI检测', needWorkspace: true },
  { icon: '⚙️', label: '设置中心' },
  { icon: '🔧', label: '智能体编辑器' },
]

export default function LeftSidebar({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onNewBook,
  onDeleteBook,
  activePage,
  onPageChange,
}: Props) {
  const [hoveredWs, setHoveredWs] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleNavClick = (item: typeof navItems[number]) => {
    if (item.needWorkspace && !currentWorkspace) return
    onPageChange(item.label)
  }

  const handleHomeClick = () => {
    navigate('/')
  }

  return (
    <div className="w-[240px] bg-[#0d1117] border-r border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-800">
        <button onClick={handleHomeClick} className="flex items-center gap-2 mb-1 hover:opacity-80 transition w-full text-left">
          <span className="text-purple-500 text-lg">🔥</span>
          <span className="font-bold text-white">NovelForge</span>
          <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded ml-auto">v3.5</span>
        </button>
        {/* Active page breadcrumb */}
        <div className="text-xs text-gray-500 mt-1 truncate">{currentWorkspace?.title || '未选择项目'} &rsaquo; {activePage}</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-1">
        {navItems.map(item => {
          const disabled = item.needWorkspace && !currentWorkspace
          const isActive = activePage === item.label

          return (
            <button
              key={item.label}
              onClick={() => handleNavClick(item)}
              disabled={disabled}
              title={disabled ? '请先选择或创建一个项目' : undefined}
              className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition ${
                isActive
                  ? 'bg-purple-600/20 text-purple-400 border-r-2 border-purple-400'
                  : disabled
                    ? 'text-gray-700 cursor-not-allowed'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={onNewBook}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium transition mb-3"
        >
          + 新建项目
        </button>

        <div className="space-y-1 max-h-40 overflow-y-auto">
          {workspaces.map(ws => (
            <div
              key={ws.id}
              className={`group flex items-center justify-between px-3 py-1.5 rounded cursor-pointer text-sm transition ${
                currentWorkspace?.id === ws.id ? 'bg-purple-600/20 text-purple-300' : 'text-gray-400 hover:bg-gray-800'
              }`}
              onClick={() => onSelectWorkspace(ws)}
              onMouseEnter={() => setHoveredWs(ws.id)}
              onMouseLeave={() => setHoveredWs(null)}
            >
              <span className="truncate">{ws.title}</span>
              {hoveredWs === ws.id && (
                <button
                  onClick={e => { e.stopPropagation(); onDeleteBook(ws.id) }}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
