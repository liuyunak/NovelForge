import { useState } from 'react'
import { countWords } from '../utils/text'

interface Props {
  content: string
  onChange: (val: string) => void
  chapterNumber: number
  workspaceTitle: string
}

export default function MarkdownEditor({ content, onChange, chapterNumber, workspaceTitle }: Props) {
  const [preview, setPreview] = useState(false)
  // Strip Markdown syntax before counting to avoid counting formatting chars
  const wordCount = countWords(content, true)
  const spaceCount = (content.match(/\s/g) || []).length
  const readTime = Math.max(1, Math.ceil(wordCount / 500))

  return (
    <div className="flex-1 flex flex-col bg-[#0a0a1a] overflow-hidden">
      <div className="border-b border-gray-800 px-4 py-2 flex items-center gap-4">
        <span className="text-white font-medium">
          第{chapterNumber}章 <span className="text-gray-500 mx-1">·</span> {workspaceTitle}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button className="text-gray-400 hover:text-white p-1" title="撤销">↩</button>
          <button className="text-gray-400 hover:text-white p-1" title="重做">↪</button>
          <span className="text-gray-600">|</span>
          <button onClick={() => setPreview(!preview)}
            className={`px-2 py-1 rounded text-xs ${preview ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {preview ? '编辑' : '预览'}
          </button>
          <span className="text-gray-600">|</span>
          <button className="text-gray-400 hover:text-white p-1 text-sm">B</button>
          <button className="text-gray-400 hover:text-white p-1 text-sm italic">I</button>
          <button className="text-gray-400 hover:text-white p-1 text-sm underline">U</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {preview ? (
          <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap">
            {content || '（暂无内容）'}
          </div>
        ) : (
          <textarea value={content} onChange={e => onChange(e.target.value)}
            className="w-full h-full bg-transparent text-gray-300 resize-none outline-none leading-relaxed text-base"
            placeholder="开始写作..." />
        )}
      </div>

      <div className="border-t border-gray-800 px-4 py-2 flex items-center gap-6 text-xs text-gray-500">
        <span>字数: {wordCount}</span>
        <span>空格计数: {spaceCount}</span>
        <span>预计阅读时间: {readTime}分钟</span>
        <span className="ml-auto">自动保存: {new Date().toLocaleTimeString('zh-CN')}</span>
      </div>
    </div>
  )
}
