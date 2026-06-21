/**
 * AI Provider Configuration Panel
 *
 * Manages multiple AI providers (OpenAI-compatible, Ollama, llama.cpp, LM Studio)
 * and agent-level model routing.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAiStore } from '../stores/useAiStore'
import { showToast } from '../utils/logger'
import type { AiProvider, AgentRoutingEntry } from '../api/client'

// ==================== Preset Templates ====================

interface ProviderPreset {
  label: string
  name: string
  baseUrl: string
  models: string[]
  isLocal: boolean
  description: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: 'OpenAI',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'],
    isLocal: false,
    description: 'OpenAI 官方 API，需要 API Key',
  },
  {
    label: 'DeepSeek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    isLocal: false,
    description: 'DeepSeek 官方 API，性价比高',
  },
  {
    label: 'Ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen3', 'llama3.2', 'deepseek-r1:8b', 'mistral'],
    isLocal: true,
    description: '本地 Ollama 服务，无需 API Key',
  },
  {
    label: 'llama.cpp',
    name: 'llama.cpp',
    baseUrl: 'http://127.0.0.1:8080/v1',
    models: ['local-model'],
    isLocal: true,
    description: 'llama.cpp server，高性能本地推理',
  },
  {
    label: 'LM Studio',
    name: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    models: ['local-model'],
    isLocal: true,
    description: 'LM Studio 本地服务，GUI 管理模型',
  },
  {
    label: '自定义',
    name: '',
    baseUrl: '',
    models: [],
    isLocal: false,
    description: '手动配置任意 OpenAI 兼容接口',
  },
]

const AGENT_NAMES: Record<string, string> = {
  planner: '规划师',
  composer: '组装师',
  'pre-audit': '预审计',
  'context-prep': '上下文准备',
  writer: '写作',
  'fast-audit': '快速审计',
  'deep-audit': '深度审计',
  analyst: '分析师',
  polisher: '润色师',
  'memory-update': '记忆更新',
  'style-extractor': '风格提取',
  'cover-generator': '封面生成',
  'script-exporter': '短剧导出',
  reviewer: '审查员',
}

// ==================== Component ====================

export default function AiProviderConfigPanel() {
  const {
    providers, isProvidersLoading,
    agentRouting, isRoutingLoading,
    loadProviders, addProvider, editProvider, removeProvider,
    testConnection, testProviderConnection,
    loadAgentRouting, saveAgentRouting,
  } = useAiStore()

  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null)
  const [formName, setFormName] = useState('')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formModels, setFormModels] = useState('')
  const [formIsLocal, setFormIsLocal] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  // Routing edit state
  const [editingRouting, setEditingRouting] = useState<Record<string, { providerId: string; model: string }>>({})
  const [showRouting, setShowRouting] = useState(false)

  useEffect(() => {
    loadProviders()
    loadAgentRouting()
  }, [loadProviders, loadAgentRouting])

  // Sync routing state when data loads
  useEffect(() => {
    if (agentRouting.length > 0) {
      const map: Record<string, { providerId: string; model: string }> = {}
      for (const r of agentRouting) {
        map[r.agent] = { providerId: r.providerId, model: r.model }
      }
      setEditingRouting(map)
    }
  }, [agentRouting])

  // ==================== Provider Actions ====================

  const openAddModal = (preset?: ProviderPreset) => {
    setEditingProvider(null)
    const p = preset || PROVIDER_PRESETS[5] // default: custom
    setSelectedPreset(p)
    setFormName(p.name)
    setFormBaseUrl(p.baseUrl)
    setFormApiKey('')
    setFormModels(p.models.join(', '))
    setFormIsLocal(p.isLocal)
    setShowModal(true)
  }

  const openEditModal = (provider: AiProvider) => {
    setEditingProvider(provider)
    setSelectedPreset(null)
    setFormName(provider.name)
    setFormBaseUrl(provider.baseUrl)
    setFormApiKey(provider.apiKey || '')
    setFormModels(provider.models.join(', '))
    setFormIsLocal(provider.isLocal)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim() || !formBaseUrl.trim()) {
      showToast('名称和 Base URL 不能为空', 'error')
      return
    }

    const models = formModels
      .split(/[,，]/)
      .map((m) => m.trim())
      .filter(Boolean)

    try {
      if (editingProvider) {
        await editProvider(editingProvider.id, {
          name: formName.trim(),
          baseUrl: formBaseUrl.trim(),
          apiKey: formApiKey || undefined,
          models,
          isLocal: formIsLocal,
        })
        showToast('供应商已更新', 'success')
      } else {
        await addProvider({
          name: formName.trim(),
          type: 'openai-compatible',
          baseUrl: formBaseUrl.trim(),
          apiKey: formApiKey || undefined,
          models: models.length > 0 ? models : ['default'],
          enabled: true,
          isLocal: formIsLocal,
        })
        showToast('供应商已添加', 'success')
      }
      setShowModal(false)
    } catch {
      showToast('保存失败', 'error')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除供应商「${name}」吗？`)) return
    const ok = await removeProvider(id)
    if (ok) {
      showToast('已删除', 'success')
    } else {
      showToast('删除失败', 'error')
    }
  }

  const handleToggle = async (provider: AiProvider) => {
    try {
      await editProvider(provider.id, { enabled: !provider.enabled })
      showToast(provider.enabled ? '已禁用' : '已启用', 'success')
    } catch {
      showToast('操作失败', 'error')
    }
  }

  const handleTest = async (provider: AiProvider) => {
    setTestingId(provider.id)
    setTestResult(null)
    try {
      const result = await testProviderConnection(provider.id)
      if (result.ok) {
        const modelList = result.models.slice(0, 10).join(', ')
        setTestResult(`✅ 连接成功！可用模型: ${modelList || '(无)'}`)
        // Optionally update model list from discovered models
        if (result.models.length > 0) {
          await editProvider(provider.id, {
            models: result.models.slice(0, 20),
          })
        }
      } else {
        setTestResult(`❌ 连接失败: ${result.error}`)
      }
    } catch {
      setTestResult('❌ 测试请求异常')
    } finally {
      setTestingId(null)
    }
  }

  // ==================== Routing Actions ====================

  const handleRoutingSave = async () => {
    const entries: AgentRoutingEntry[] = []

    for (const [agent, cfg] of Object.entries(editingRouting)) {
      if (!cfg.providerId) continue
      const existing = agentRouting.find((r) => r.agent === agent)
      entries.push({
        agent,
        providerId: cfg.providerId,
        model: cfg.model || 'default',
        temperature: existing?.temperature ?? 0.7,
        maxTokens: existing?.maxTokens ?? 4096,
        cacheEnabled: existing?.cacheEnabled,
      })
    }

    if (entries.length === 0) {
      showToast('请至少配置一个 Agent', 'error')
      return
    }

    try {
      await saveAgentRouting(entries)
      showToast('Agent 路由已保存', 'success')
    } catch {
      showToast('保存失败', 'error')
    }
  }

  // ==================== Helpers ====================

  const getProviderById = useCallback(
    (id: string) => providers.find((p) => p.id === id),
    [providers]
  )

  const maskApiKey = (key?: string) => {
    if (!key) return '—'
    if (key.length <= 8) return '••••'
    return key.slice(0, 4) + '••••' + key.slice(-4)
  }

  // ==================== Render ====================

  return (
    <div className="p-5 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>🔌</span> AI 供应商配置
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRouting(!showRouting)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
          >
            {showRouting ? '返回供应商列表' : '🔀 Agent 路由'}
          </button>
          <button
            onClick={() => openAddModal()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition flex items-center gap-1"
          >
            <span>+</span> 添加供应商
          </button>
        </div>
      </div>

      {isProvidersLoading && (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      )}

      {/* ============ Agent Routing View ============ */}
      {showRouting && !isProvidersLoading && (
        <div className="space-y-4">
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
            <h3 className="text-white font-medium mb-1">🔀 Agent 模型路由</h3>
            <p className="text-gray-500 text-xs mb-4">为每个写作 Agent 指定使用的供应商和模型</p>

            <div className="grid grid-cols-1 gap-2">
              {Object.entries(AGENT_NAMES).map(([agent, label]) => {
                const cfg = editingRouting[agent] || { providerId: '', model: '' }
                const enabledProviders = providers.filter((p) => p.enabled)
                return (
                  <div key={agent} className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2">
                    <span className="text-gray-300 text-sm w-24 shrink-0">{label}</span>
                    <select
                      value={cfg.providerId}
                      onChange={(e) =>
                        setEditingRouting((prev) => ({
                          ...prev,
                          [agent]: { ...prev[agent], providerId: e.target.value, model: '' },
                        }))
                      }
                      className="bg-gray-800 text-white px-2 py-1.5 rounded text-xs outline-none flex-1 max-w-[200px]"
                    >
                      <option value="">默认</option>
                      {enabledProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.isLocal ? '(本地)' : ''}
                        </option>
                      ))}
                    </select>
                    {cfg.providerId && (
                      <select
                        value={cfg.model}
                        onChange={(e) =>
                          setEditingRouting((prev) => ({
                            ...prev,
                            [agent]: { ...prev[agent], model: e.target.value },
                          }))
                        }
                        className="bg-gray-800 text-white px-2 py-1.5 rounded text-xs outline-none flex-1 max-w-[200px]"
                      >
                        <option value="">选择模型</option>
                        {(getProviderById(cfg.providerId)?.models || []).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={handleRoutingSave}
              className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition"
            >
              💾 保存路由配置
            </button>
          </div>
        </div>
      )}

      {/* ============ Provider List View ============ */}
      {!showRouting && !isProvidersLoading && (
        <>
          {/* Quick Presets */}
          {providers.length === 0 && (
            <div className="mb-6">
              <h3 className="text-gray-400 text-sm mb-3">快速添加供应商：</h3>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_PRESETS.slice(0, 5).map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => openAddModal(preset)}
                    className="text-left p-3 bg-gray-800/40 hover:bg-gray-800/60 border border-gray-700 hover:border-purple-500/30 rounded-lg transition group"
                  >
                    <div className="text-white text-sm font-medium group-hover:text-purple-300 transition">
                      {preset.label}
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">{preset.description}</div>
                    <div className="text-gray-600 text-xs mt-1 font-mono truncate">{preset.baseUrl}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Provider Cards */}
          <div className="space-y-3">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={`bg-gray-800/40 rounded-xl border p-4 transition ${
                  provider.enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          provider.enabled ? 'bg-green-400' : 'bg-gray-600'
                        }`}
                      />
                      <h3 className="text-white font-medium text-sm">{provider.name}</h3>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300">
                        {provider.isLocal ? '本地模型' : '云端 API'}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-1 text-xs">
                      <div className="text-gray-500">
                        <span className="text-gray-600">Base URL: </span>
                        <code className="text-gray-400">{provider.baseUrl}</code>
                      </div>
                      <div className="text-gray-500">
                        <span className="text-gray-600">API Key: </span>
                        <code className="text-gray-400">{maskApiKey(provider.apiKey)}</code>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {provider.models.map((m) => (
                          <span
                            key={m}
                            className="text-xs px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-300"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Test result — only show for the tested provider */}
                    {testResult && testingId === provider.id && (
                      <div className="mt-2 text-xs text-gray-300">{testResult}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 ml-4 shrink-0">
                    <button
                      onClick={() => handleToggle(provider)}
                      className={`px-2 py-1 rounded text-xs transition ${
                        provider.enabled
                          ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {provider.enabled ? '已启用' : '已禁用'}
                    </button>
                    <button
                      onClick={() => handleTest(provider)}
                      disabled={testingId === provider.id}
                      className="px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition disabled:opacity-50"
                    >
                      {testingId === provider.id ? '测试中...' : '测试连接'}
                    </button>
                    <button
                      onClick={() => openEditModal(provider)}
                      className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-400 hover:bg-gray-600 transition"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(provider.id, provider.name)}
                      className="px-2 py-1 rounded text-xs bg-red-900/20 text-red-400 hover:bg-red-900/30 transition"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {providers.length === 0 && !isProvidersLoading && (
              <div className="text-center py-8 text-gray-500">
                <p className="text-lg mb-1">暂无 AI 供应商</p>
                <p className="text-sm">点击上方快速添加，或手动配置自定义接口</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ============ Add/Edit Modal ============ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-4">
              {editingProvider ? '编辑供应商' : '添加 AI 供应商'}
            </h3>

            {/* Preset selector (only for new) */}
            {!editingProvider && (
              <div className="mb-4">
                <label className="block text-gray-400 text-xs mb-2">选择预设模板</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setSelectedPreset(preset)
                        setFormName(preset.name)
                        setFormBaseUrl(preset.baseUrl)
                        setFormModels(preset.models.join(', '))
                        setFormIsLocal(preset.isLocal)
                      }}
                      className={`text-xs px-2 py-1.5 rounded border transition ${
                        selectedPreset?.label === preset.label
                          ? 'border-purple-500 bg-purple-600/15 text-purple-300'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 text-xs mb-1">名称 *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如: 我的 DeepSeek"
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">Base URL *</label>
                <input
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">
                  API Key {formIsLocal ? '(本地模型可留空)' : ''}
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder={formIsLocal ? '本地模型无需 API Key' : 'sk-...'}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">模型列表（逗号分隔）</label>
                <input
                  value={formModels}
                  onChange={(e) => setFormModels(e.target.value)}
                  placeholder="gpt-4o, gpt-4o-mini"
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isLocal"
                  checked={formIsLocal}
                  onChange={(e) => setFormIsLocal(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="isLocal" className="text-gray-400 text-sm">
                  本地模型（无需 API Key，localhost 访问）
                </label>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition"
              >
                {editingProvider ? '保存修改' : '添加供应商'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
