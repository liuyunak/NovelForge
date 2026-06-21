import { useState, useEffect } from 'react'
import MdImportDialog from './MdImportDialog'
import { showToast } from '../utils/logger'
import { getWorldview, saveWorldviewEntry, type WorldviewEntry } from '../api/client'

interface Props {
  workspaceId: string
}

interface WorldEntry {
  name: string
  category: 'geography' | 'organization' | 'power_system' | 'history' | 'culture' | 'other'
  description: string
  relatedCharacters?: string[]
}

const categories = [
  { key: 'geography', label: '🌍 地理', icon: '🗺' },
  { key: 'organization', label: '🏢 势力/组织', icon: '🏛️' },
  { key: 'power_system', label: '⚡ 体系/规则', icon: '🔮' },
  { key: 'history', label: '📜 历史事件', icon: '⏱' },
  { key: 'culture', label: '🎃 文化习俗', icon: '🎿' },
  { key: 'other', label: '✨ 其他', icon: '✨' },
] as const

const catColor = (c: WorldEntry['category']) => {
  switch (c) {
    case 'geography': return 'border-l-blue-500 bg-blue-900/10'
    case 'organization': return 'border-l-red-500 bg-red-900/10'
    case 'power_system': return 'border-l-yellow-500 bg-yellow-900/10'
    case 'history': return 'border-l-green-500 bg-green-900/10'
    case 'culture': return 'border-l-pink-500 bg-pink-900/10'
    default: return 'border-l-gray-500 bg-gray-800/50'
  }
}

/** Guess category from section heading */
function guessCategory(heading: string): WorldEntry['category'] {
  const h = heading.toLowerCase()
  if (/地理|地图|地域|大陆|山脉|河流|森林|城市|王国/.test(h)) return 'geography'
  if (/势力|组织|宗门|帮派|家族|帝国|商会/.test(h)) return 'organization'
  if (/体系|规则|修炼|功法|境界|等级|灵力|魔法/.test(h)) return 'power_system'
  if (/历史|事件|纪年|大事|古代|传说/.test(h)) return 'history'
  if (/文化|习俗|节日|风俗|礼仪|语言|服饰/.test(h)) return 'culture'
  return 'other'
}

export default function WorldViewPanel({ workspaceId }: Props) {
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [showNew, setShowNew] = useState(false)
  const [newEntry, setNewEntry] = useState<Partial<WorldEntry>>({ category: 'geography' })
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    setLoading(true)
    getWorldview(workspaceId)
      .then(data => setEntries(data.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [workspaceId])

  const filtered = filter === 'all' ? entries : entries.filter(e => e.category === filter)

  const handleAdd = async () => {
    if (!newEntry.name?.trim()) return
    const entry: WorldEntry = {
      name: newEntry.name,
      category: newEntry.category || 'geography',
      description: newEntry.description || '',
      relatedCharacters: newEntry.relatedCharacters,
    }
    // Persist via API
    try {
      await saveWorldviewEntry(workspaceId, entry)
    } catch { /* best-effort: local state still updated below */ }
    setEntries(prev => [...prev, entry])
    setShowNew(false)
    setNewEntry({ category: 'geography' })
  }

  /** Parse Markdown into WorldEntry[].
   *  Headings (# / ## / ###) = entry name.
   *  Category is guessed from heading text.
   *  Subsequent text = description.
   *  Lines starting with `- 人物:` or `- 角色:` = relatedCharacters.
   */
  const parseWorldviewMd = (md: string): WorldEntry[] => {
    const items: WorldEntry[] = []
    const lines = md.split('\n')
    let current: Partial<WorldEntry> | null = null

    const finalize = () => {
      if (current?.name) {
        items.push({
          name: current.name,
          category: current.category || 'other',
          description: current.description || '',
          relatedCharacters: current.relatedCharacters,
        })
      }
      current = null
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) { finalize(); continue }

      const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/)
      if (headingMatch) {
        finalize()
        const name = headingMatch[1].trim()
        if (name) {
          current = { name, category: guessCategory(name), description: '' }
        }
        continue
      }

      if (!current) continue

      // Related characters line
      const relMatch = trimmed.match(/^[-*]\s*(?:人物|角色|关联)[:：]\s*(.+)/i)
      if (relMatch) {
        current.relatedCharacters = relMatch[1].split(/[,，、]/).map(s => s.trim()).filter(Boolean)
        continue
      }

      // Append to description
      current.description = current.description
        ? `${current.description}\n${trimmed}`
        : trimmed
    }
    finalize()
    return items
  }

  const handleImport = async (mdContent: string) => {
    const parsed = parseWorldviewMd(mdContent)
    if (parsed.length === 0) {
      showToast('未识别到有效的世界观条目。请使用 ## 条目名 格式。', 'error')
      return
    }
    // Persist each entry via API
    for (const entry of parsed) {
      try {
        await saveWorldviewEntry(workspaceId, entry)
      } catch { /* best-effort: local merge still happens below */ }
    }
    setEntries(prev => [...prev, ...parsed])
    showToast(`成功导入 ${parsed.length} 个世界观条目`, 'success')
  }

  return (
    <div className="p-5 space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>🌍</span> 世界观设定
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="text-sm px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 rounded-lg transition"
          >
            📥 导入 MD
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
          >
            + 新条目
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs transition ${filter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          全部 ({entries.length})
        </button>
        {categories.map(cat => {
          const count = entries.filter(e => e.category === cat.key).length
          return (
            <button
              key={cat.key}
              onClick={() => setFilter(cat.key)}
              className={`px-3 py-1 rounded-full text-xs transition ${filter === cat.key ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">加载中...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">🌍</div>
          <p className="text-gray-400 mb-1">暂无世界观设定</p>
          <p className="text-gray-600 text-sm mb-3">添加或导入已有的世界观设定文件</p>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1 px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded-lg text-sm hover:bg-purple-600/30 transition"
          >
            📥 导入 MD 设定
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry, i) => (
            <div key={i} className={`rounded-lg p-4 border-l-4 ${catColor(entry.category)}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-medium">{entry.name}</h3>
                <span className="text-xs text-gray-500">
                  {categories.find(c => c.key === entry.category)?.label}
                </span>
              </div>
              <p className="text-gray-400 text-sm whitespace-pre-wrap">{entry.description}</p>
              {entry.relatedCharacters && entry.relatedCharacters.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {entry.relatedCharacters.map(name => (
                    <span key={name} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">👤 {name}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Entry Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-[480px] border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">🌍 新建世界条目</h2>
            <div className="space-y-3">
              <input value={newEntry.name || ''} onChange={e => setNewEntry({ ...newEntry, name: e.target.value })}
                placeholder="名称" className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none" />
              <select value={newEntry.category || 'geography'} onChange={e => setNewEntry({ ...newEntry, category: e.target.value as WorldEntry['category'] })}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none">
                {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <textarea value={newEntry.description || ''} onChange={e => setNewEntry({ ...newEntry, description: e.target.value })}
                placeholder="描述..." rows={3} className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none resize-none" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
              <button onClick={handleAdd} disabled={!newEntry.name?.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-sm">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* MD Import Dialog */}
      <MdImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="📥 导入世界观设定 Markdown"
        description="使用 ## 标题表示条目，系统会自动识别归属分类"
        placeholder={`## 青云宗\n- 关联: 林风, 苏婉清\n位于东域苍澜山脉的修仙宗门，拥有三千年历史...\n\n## 筑基期修炼体系\n修炼分为炼气、筑基、金丹、元婴、化神五大境界...\n\n## 三千年仙魔大战\n远古时期仙魔两界的大战，导致大陆分裂为五域...\n`}
      />
    </div>
  )
}
