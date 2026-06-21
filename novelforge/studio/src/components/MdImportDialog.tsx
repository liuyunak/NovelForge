import { useState, useRef, useMemo } from 'react'
import { showToast } from '../utils/logger'

interface Props {
  open: boolean
  onClose: () => void
  onImport: (mdContent: string) => Promise<void>
  title: string
  description?: string
  placeholder?: string
  /** Show file upload button */
  showFileUpload?: boolean
  /** Optional parser to count importable entries from MD content */
  parseEntryCount?: (md: string) => number
}

/**
 * Shared MD Import Dialog — paste Markdown or upload .md file.
 * Used by: OutlinePanel, CharacterPanel, WorldViewPanel, PlotPanel, WritingEditor.
 */
export default function MdImportDialog({
  open,
  onClose,
  onImport,
  title,
  description,
  placeholder = '在此粘贴 Markdown 内容...',
  showFileUpload = true,
  parseEntryCount,
}: Props) {
  const [mdContent, setMdContent] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleImport = async () => {
    if (!mdContent.trim()) return
    setImporting(true)
    try {
      await onImport(mdContent)
      setMdContent('')
      onClose()
    } catch {
      // error handled by parent
    } finally {
      setImporting(false)
    }
  }

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt') && !file.name.endsWith('.markdown')) {
      showToast('请选择 .md / .txt / .markdown 文件', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setMdContent(text)
    }
    reader.onerror = () => {
      showToast('文件读取失败，请检查文件编码（建议使用 UTF-8）', 'error')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.ctrlKey && e.key === 'Enter') handleImport()
  }

  // Compute footer hint: entry count if parser provided, else non-empty lines
  const footerHint = useMemo(() => {
    if (!mdContent) return 'Ctrl+Enter 快速导入'
    const entryCount = typeof parseEntryCount === 'function' ? parseEntryCount(mdContent) : 0
    if (entryCount > 0) return `${mdContent.length.toLocaleString()} 字符 · ${entryCount} 个条目`
    const lines = mdContent.split('\n').filter(l => l.trim()).length
    return `${mdContent.length.toLocaleString()} 字符 · ${lines} 行`
  }, [mdContent, parseEntryCount])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1a1a2e] rounded-xl border border-gray-700 w-[640px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-bold text-lg">{title}</h2>
            {description && <p className="text-gray-500 text-xs mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>

        {/* Drop Zone + Content */}
        <div
          className={`flex-1 p-4 flex flex-col gap-3 min-h-0 ${
            dragOver ? 'bg-purple-900/10 border-2 border-dashed border-purple-500 rounded-lg' : ''
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {showFileUpload && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.markdown"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
              >
                📁 选择文件
              </button>
              <span className="text-gray-600 text-xs">或直接粘贴 Markdown 内容</span>
            </div>
          )}

          <textarea
            value={mdContent}
            onChange={e => setMdContent(e.target.value)}
            placeholder={placeholder}
            className="flex-1 w-full bg-gray-800 text-gray-200 px-4 py-3 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500 resize-none min-h-[250px]"
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700">
          <span className="text-gray-600 text-xs">
            {footerHint}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm rounded-lg transition"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={!mdContent.trim() || importing}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition"
            >
              {importing ? '⏳ 导入中...' : '📥 导入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
