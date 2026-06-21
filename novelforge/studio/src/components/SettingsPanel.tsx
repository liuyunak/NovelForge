import { useState, useEffect } from 'react'
import type { WorkspaceDetail } from '../types'
import { showToast } from '../utils/logger'
import AiProviderConfigPanel from './AiProviderConfigPanel'

interface Props {
  currentWorkspace: WorkspaceDetail | null
}

type SectionKey = 'general' | 'ai-providers' | 'editor' | 'advanced'

interface SettingsState {
  defaultGenre: string
  autoSaveInterval: string
  language: string
  theme: string
  autoOpenLast: boolean
  showWordCount: boolean
  fontSize: number
  fontFamily: string
  lineHeight: string
  showLineNumbers: boolean
  spellCheck: boolean
  markdownPreview: boolean
  dataDir: string
  logLevel: string
  enableTelemetry: boolean
}

const SETTINGS_KEY = 'novelforge_settings'

const defaultSettings: SettingsState = {
  defaultGenre: '玄幻修仙',
  autoSaveInterval: '30',
  language: 'zh-CN',
  theme: 'dark',
  autoOpenLast: true,
  showWordCount: true,
  fontSize: 16,
  fontFamily: 'system',
  lineHeight: '1.8',
  showLineNumbers: true,
  spellCheck: false,
  markdownPreview: true,
  dataDir: './data',
  logLevel: 'info',
  enableTelemetry: false,
}

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...defaultSettings, ...parsed }
    }
  } catch { /* ignore corrupt data */ }
  return { ...defaultSettings }
}

function persistSettings(s: SettingsState): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch { /* localStorage full */ }
}

export default function SettingsPanel(_props: Props) {
  const [activeSection, setActiveSection] = useState<SectionKey>('general')
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState<SettingsState>(loadSettings)

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const sections: { key: SectionKey; label: string }[] = [
    { key: 'general', label: '🏠 通用设置' },
    { key: 'ai-providers', label: '🔌 AI 供应商' },
    { key: 'editor', label: '✍️ 编辑器' },
    { key: 'advanced', label: '⚙️ 高级' },
  ]

  const handleSave = () => {
    persistSettings(settings)
    setSaved(true)
    showToast('设置已保存', 'success')
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearCache = () => {
    if (!confirm('确定要清除所有本地缓存吗？这将重置所有设置和 AI 供应商配置。')) return
    try {
      // Only clear known NovelForge keys (avoid clobbering other apps on same origin)
      const knownKeys = [
        'novelforge_settings',
        'novelforge_providers',
        'novelforge_agent_routing',
        'novelforge_embedding_config',
      ]
      knownKeys.forEach(k => localStorage.removeItem(k))
      // Reset to defaults
      setSettings({ ...defaultSettings })
      showToast('缓存已清除，设置已重置', 'success')
    } catch (e) {
      showToast('清除缓存失败', 'error')
    }
  }

  const handleExportData = async () => {
    showToast('正在准备导出...', 'info')
    try {
      const exportData: Record<string, unknown> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
          try {
            exportData[key] = JSON.parse(localStorage.getItem(key) || '')
          } catch {
            exportData[key] = localStorage.getItem(key)
          }
        }
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `novelforge-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('数据导出成功', 'success')
    } catch (e) {
      showToast('导出失败', 'error')
    }
  }

  return (
    <div className="p-5 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>⚙️</span> 设置中心
        </h2>
        <button
          onClick={handleSave}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            saved ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'
          }`}
        >
          {saved ? '✅ 已保存' : '💾 保存'}
        </button>
      </div>

      <div className="flex gap-5">
        {/* Section nav */}
        <div className="w-44 space-y-1">
          {sections.map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${
                activeSection === s.key ? 'bg-purple-600/15 text-purple-300 border border-purple-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl">
          {activeSection === 'general' && (
            <SettingsSection title="通用设置">
              <SettingRow label="默认作品类型">
                <select value={settings.defaultGenre} onChange={e => update('defaultGenre', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                  <option>玄幻修仙</option><option>都市重生</option><option>科幻末世</option><option>悬疑灵异</option><option>古代言情</option>
                </select>
              </SettingRow>
              <SettingRow label="自动保存间隔">
                <select value={settings.autoSaveInterval} onChange={e => update('autoSaveInterval', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                  <option value="10">10 秒</option><option value="30">30 秒</option><option value="60">1 分钟</option><option value="300">5 分钟</option>
                </select>
              </SettingRow>
              <SettingRow label="界面语言">
                <select value={settings.language} onChange={e => update('language', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                  <option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en">English</option>
                </select>
              </SettingRow>
              <SettingRow label="主题">
                <select value={settings.theme} onChange={e => update('theme', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                  <option value="dark">暗色模式</option><option value="light">亮色模式</option><option value="auto">跟随系统</option>
                </select>
              </SettingRow>
              <ToggleSetting label="启动时自动打开上次项目" checked={settings.autoOpenLast} onChange={v => update('autoOpenLast', v)} />
              <ToggleSetting label="显示字数统计" checked={settings.showWordCount} onChange={v => update('showWordCount', v)} />
            </SettingsSection>
          )}

          {activeSection === 'ai-providers' && (
            <div className="-m-5">
              <AiProviderConfigPanel />
            </div>
          )}

          {activeSection === 'editor' && (
            <SettingsSection title="编辑器设置">
              <SettingRow label="字体大小">
                <input type="number" value={settings.fontSize} onChange={e => update('fontSize', Number(e.target.value))} min="12" max="32" className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none w-24" />
              </SettingRow>
              <SettingRow label="字体">
                <select value={settings.fontFamily} onChange={e => update('fontFamily', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                  <option value="system">系统默认</option><option value="serif">衬线字体</option><option value="monospace">等宽字体</option>
                </select>
              </SettingRow>
              <SettingRow label="行高">
                <select value={settings.lineHeight} onChange={e => update('lineHeight', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                  <option value="1.4">1.4 (紧凑)</option><option value="1.6">1.6</option><option value="1.8">1.8 (舒适)</option><option value="2.0">2.0 (宽松)</option>
                </select>
              </SettingRow>
              <ToggleSetting label="显示行号" checked={settings.showLineNumbers} onChange={v => update('showLineNumbers', v)} />
              <ToggleSetting label="拼写检查" checked={settings.spellCheck} onChange={v => update('spellCheck', v)} />
              <ToggleSetting label="Markdown 实时渲染" checked={settings.markdownPreview} onChange={v => update('markdownPreview', v)} />
            </SettingsSection>
          )}

          {activeSection === 'advanced' && (
            <SettingsSection title="高级设置">
              <SettingRow label="数据目录">
                <input value={settings.dataDir} readOnly className="bg-gray-800 text-gray-400 px-3 py-2 rounded-lg text-sm outline-none flex-1" />
              </SettingRow>
              <SettingRow label="日志级别">
                <select value={settings.logLevel} onChange={e => update('logLevel', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none">
                  <option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option>
                </select>
              </SettingRow>
              <ToggleSetting label="启用遥测 (Telemetry)" checked={settings.enableTelemetry} onChange={v => update('enableTelemetry', v)} />
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                <p className="text-red-400 text-sm font-medium">⚠️ 危险区域</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearCache}
                    className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 rounded-lg text-sm transition">
                    🗑️ 清除所有缓存
                  </button>
                  <button
                    onClick={handleExportData}
                    className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 rounded-lg text-sm transition">
                    📋 导出所有数据
                  </button>
                </div>
              </div>
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-white font-medium text-base pb-2 border-b border-gray-700">{title}</h3>
      {children}
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-gray-400 text-sm w-36 shrink-0">{label}</label>
      <div className="flex-1 ml-4">{children}</div>
    </div>
  )
}

function ToggleSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-gray-400 text-sm">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-purple-600' : 'bg-gray-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}
