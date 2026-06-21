import { useState, useEffect, useCallback } from 'react'
import { getCharacters, updateCharacter, Character } from '../api/client'
import MdImportDialog from './MdImportDialog'
import { logError, showToast } from '../utils/logger'

interface Props {
  workspaceId: string
}

const defaultCharacter: Character = {
  name: '',
  role: '配角',
  items: [],
  power: '',
  location: '',
  mood: '',
  status: '',
}

export default function CharacterPanel({ workspaceId }: Props) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Character | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newChar, setNewChar] = useState<Character>({ ...defaultCharacter })
  const [showImport, setShowImport] = useState(false)

  const loadCharacters = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCharacters(workspaceId)
      setCharacters(data.characters || [])
    } catch (e) {
      logError('Failed to load characters', e)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  const handleSave = async (char: Character) => {
    try {
      await updateCharacter(workspaceId, char)
      await loadCharacters()
      setEditing(null)
      setShowNew(false)
      setNewChar({ ...defaultCharacter })
    } catch (e) {
      logError('Failed to save character', e)
    }
  }

  /** Parse Markdown into Character[].
   *  Supported formats:
   *   - `## 角色名` or `# 角色名` → new character
   *   - `- **属性**: 值` or `- 属性: 值`
   *   - `- 道具1, 道具2` → items
   *   - Free text after heading → description (stored as status)
   */
  const parseCharacterMd = (md: string): Character[] => {
    const chars: Character[] = []
    const lines = md.split('\n')
    let current: Partial<Character> | null = null

    const finalizeCurrent = () => {
      if (current?.name) {
        chars.push({
          name: current.name,
          role: current.role || '配角',
          items: current.items || [],
          power: current.power || '',
          location: current.location || '',
          mood: current.mood || '',
          status: current.status || '',
        })
      }
      current = null
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) { finalizeCurrent(); continue }

      // Heading → new character
      const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/)
      if (headingMatch) {
        finalizeCurrent()
        const name = headingMatch[1].trim()
        if (name && !name.startsWith('#')) {
          current = { name }
        }
        continue
      }

      if (!current) continue

      // Property lines: - **role**: value or - role: value
      const propMatch = trimmed.match(/^[-*]\s+(?:\*{1,2})?([^:*]+)(?:\*{1,2})?\s*[:：]\s*(.+)/)
      if (propMatch) {
        const key = propMatch[1].trim()
        const value = propMatch[2].trim()
        switch (key) {
          case '角色': case 'role': case '身份': current.role = value; break
          case '战力': case 'power': case '实力': case '等级': current.power = value; break
          case '位置': case 'location': case '所在地': current.location = value; break
          case '情绪': case 'mood': case '心情': current.mood = value; break
          case '状态': case 'status': current.status = value; break
          case '道具': case '物品': case 'items': current.items = value.split(/[,，、]/).map(s => s.trim()).filter(Boolean); break
        }
        continue
      }

      // Plain text → append to status/description
      if (current) {
        current.status = current.status ? `${current.status}\n${trimmed}` : trimmed
      }
    }
    finalizeCurrent()
    return chars
  }

  const handleImport = async (mdContent: string) => {
    const parsed = parseCharacterMd(mdContent)
    if (parsed.length === 0) {
      showToast('未识别到有效的角色数据。请使用 ## 角色名 格式。', 'error')
      return
    }
    let successCount = 0
    for (const char of parsed) {
      try {
        await updateCharacter(workspaceId, char)
        successCount++
      } catch (e) {
        logError(`Failed to import character: ${char.name}`, e)
      }
    }
    await loadCharacters()
    showToast(`成功导入 ${successCount}/${parsed.length} 个角色`, 'success')
  }

  const roleColor = (role: string) => {
    switch (role) {
      case '主角': return 'text-yellow-400 bg-yellow-900/20'
      case '反派': return 'text-red-400 bg-red-900/20'
      case '女主': return 'text-pink-400 bg-pink-900/20'
      default: return 'text-blue-400 bg-blue-900/20'
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <span>👤</span> 角色档案
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="text-sm px-2.5 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 rounded-lg transition"
          >
            📥 导入 MD
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
          >
            + 新角色
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">加载中...</p>
      ) : characters.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">暂无角色数据</p>
          <p className="text-gray-600 text-xs mt-1">点击"+ 新角色"添加，或📥 导入已有的 MD 角色设定</p>
        </div>
      ) : (
        <div className="space-y-3">
          {characters.map(char => (
            <div key={char.name} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{char.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${roleColor(char.role)}`}>
                    {char.role}
                  </span>
                </div>
                <button
                  onClick={() => setEditing(char)}
                  className="text-gray-400 hover:text-white text-xs transition"
                >
                  ✏️ 编辑
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-1 text-xs text-gray-400">
                {char.power && <span>💪 {char.power}</span>}
                {char.location && <span>📍 {char.location}</span>}
                {char.mood && <span>😊 {char.mood}</span>}
                {char.status && <span>📊 {char.status}</span>}
              </div>
              
              {char.items && char.items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {char.items.map(item => (
                    <span key={item} className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs">
                      🎒 {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">编辑角色: {editing.name}</h2>
            <div className="space-y-3">
              <input
                type="text" value={editing.power || ''}
                onChange={e => setEditing({ ...editing, power: e.target.value })}
                placeholder="战力等级" className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none"
              />
              <input
                type="text" value={editing.location || ''}
                onChange={e => setEditing({ ...editing, location: e.target.value })}
                placeholder="当前位置" className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none"
              />
              <input
                type="text" value={editing.status || ''}
                onChange={e => setEditing({ ...editing, status: e.target.value })}
                placeholder="状态" className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none"
              />
              <input
                type="text" value={editing.mood || ''}
                onChange={e => setEditing({ ...editing, mood: e.target.value })}
                placeholder="情绪" className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
              <button onClick={() => handleSave(editing)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* New Character Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-96 border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">新建角色</h2>
            <div className="space-y-3">
              <input
                type="text" value={newChar.name}
                onChange={e => setNewChar({ ...newChar, name: e.target.value })}
                placeholder="角色名" className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none"
              />
              <select
                value={newChar.role}
                onChange={e => setNewChar({ ...newChar, role: e.target.value })}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none"
              >
                <option>主角</option><option>女主</option><option>反派</option><option>配角</option><option>路人</option>
              </select>
              <input
                type="text" value={newChar.power || ''}
                onChange={e => setNewChar({ ...newChar, power: e.target.value })}
                placeholder="战力等级" className="w-full bg-gray-800 text-white px-3 py-2 rounded text-sm outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
              <button
                onClick={() => handleSave(newChar)}
                disabled={!newChar.name.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-sm"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MD Import Dialog */}
      <MdImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        title="📥 导入角色设定 Markdown"
        description="使用 ## 角色名 作为标题，支持属性列表（- 角色: 主角）"
        placeholder={`## 林风\n- 角色: 主角\n- 战力: 筑基期\n- 道具: 古剑·裂天, 储物戒指\n- 位置: 青云宗\n- 状态: 正在修炼\n\n## 苏婉清\n- 角色: 女主\n- 战力: 金丹期\n- 道具: 冰魄寒玉\n- 情绪: 对主角有好感\n`}
      />
    </div>
  )
}
