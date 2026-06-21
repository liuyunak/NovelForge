import { useState } from 'react'
import { Workspace, WorkspaceDetail, PageKey } from '../types'
import QuickActionCard from './QuickActionCard'

interface Props {
  workspaces: Workspace[]
  currentWorkspace: WorkspaceDetail | null
  onSelectWorkspace: (ws: Workspace) => void
  onNewBook: () => void
  onDeleteBook: (id: string) => void
  onNavigatePage: (page: PageKey) => void
}

const WRITING_TIPS = [
  '好的开头是成功的一半——用一个钩子抓住读者。',
  '每章结束时留一个悬念，让读者欲罢不能。',
  '人物冲突是故事的引擎，没有冲突就没有进展。',
  '展示，而非讲述——用场景和动作来表现情感。',
  '节奏感：高潮与低谷交替，给读者喘息的空间。',
  '伏笔是长篇小说最重要的技巧之一。',
  '每天坚持写，哪怕只有 500 字。',
]

export default function WorkbenchView({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onNewBook,
  onDeleteBook,
  onNavigatePage,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tip] = useState(() => WRITING_TIPS[Math.floor(Math.random() * WRITING_TIPS.length)])

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Welcome to NovelForge</h1>
        <p className="text-gray-400 mb-8">AI-powered novel writing platform v3.5</p>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <QuickActionCard icon="✍️" label="开始写作" desc="选择项目，开始新的章节" onClick={onNewBook} accent="purple" />
          <QuickActionCard icon="📋" label="查看大纲" desc="规划小说结构" onClick={() => onNavigatePage('大纲规划')} accent="blue" />
          <QuickActionCard icon="🤖" label="AI 助手" desc="智能体配置与管理" onClick={() => onNavigatePage('智能体编辑器')} accent="green" />
          <QuickActionCard icon="📊" label="数据统计" desc="查看写作数据与进度" onClick={() => onNavigatePage('数据统计')} accent="yellow" />
          <QuickActionCard icon="📈" label="节奏曲线" desc="分析章节节奏变化" onClick={() => onNavigatePage('节奏曲线')} accent="orange" />
          <QuickActionCard icon="🧠" label="记忆系统" desc="管理故事记忆与知识" onClick={() => onNavigatePage('记忆系统')} accent="pink" />
        </div>

        {/* Writing Tip */}
        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl border border-purple-500/20 p-4 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span>💡</span>
            <span className="text-purple-300 text-xs font-medium">写作小贴士</span>
          </div>
          <p className="text-gray-300 text-sm italic">{tip}</p>
        </div>

        {/* Recent projects */}
        <h2 className="text-white font-semibold text-lg mb-3">📁 近期项目</h2>
        {workspaces.length === 0 ? (
          <div className="bg-gray-800/40 rounded-xl border border-dashed border-gray-700 p-12 text-center">
            <p className="text-gray-500 text-lg mb-2">还没有项目</p>
            <p className="text-gray-600 text-sm mb-4">点击"新建项目"开始你的创作之旅</p>
            <button onClick={onNewBook} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg transition">
              + 新建项目
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {workspaces.map(ws => (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws)}
                onMouseEnter={() => setHovered(ws.id)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative bg-gray-800/60 rounded-xl p-4 border cursor-pointer transition ${
                  currentWorkspace?.id === ws.id ? 'border-purple-500/50 bg-purple-900/10' : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-medium truncate pr-2">{ws.title}</h3>
                  {hovered === ws.id && (
                    <button onClick={e => { e.stopPropagation(); onDeleteBook(ws.id) }}
                      className="text-red-400 hover:text-red-300 text-xs shrink-0">✕ 删除</button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`px-2 py-0.5 rounded ${ws.genre === '玄幻修仙' ? 'bg-purple-900/30 text-purple-400' : 'bg-gray-700 text-gray-400'}`}>
                    {ws.genre}
                  </span>
                  <span>{ws.id.slice(0, 8)}...</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
