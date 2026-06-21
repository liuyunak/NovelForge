import { useState, useEffect, useMemo } from 'react'
import { useAiStore } from '../stores/useAiStore'
import { showToast } from '../utils/logger'

interface AgentConfig {
  systemPrompt: string
  providerId: string
  model: string
  temperature: number
  maxTokens: number
  topP: number
}

const defaultConfig: AgentConfig = {
  systemPrompt: '',
  providerId: '',
  model: '',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.9,
}

/** Agent Editor - Configure AI agent prompts and parameters with provider routing */
export default function AgentEditor() {
  const [activeAgent, setActiveAgent] = useState('writer')
  const [configs, setConfigs] = useState<Record<string, AgentConfig>>({})

  // Get providers and routing from store
  const { providers, agentRouting, loadProviders, loadAgentRouting, saveAgentRouting } = useAiStore()

  useEffect(() => {
    loadProviders()
    loadAgentRouting()
  }, [loadProviders, loadAgentRouting])

  // Build model options from enabled providers
  const modelOptions = useMemo(() => {
    const options: { providerId: string; providerName: string; model: string; label: string }[] = []
    for (const p of providers) {
      if (!p.enabled) continue
      for (const m of p.models) {
        options.push({
          providerId: p.id,
          providerName: p.name,
          model: m,
          label: `${p.name} / ${m}`,
        })
      }
    }
    return options
  }, [providers])

  // Get enabled providers for routing
  const enabledProviders = useMemo(() => providers.filter((p) => p.enabled), [providers])

  // Sync routing from store into local configs
  useEffect(() => {
    if (agentRouting.length === 0) return
    setConfigs((prev) => {
      const next = { ...prev }
      for (const route of agentRouting) {
        if (!next[route.agent]) {
          next[route.agent] = {
            ...defaultConfig,
            providerId: route.providerId,
            model: route.model,
            temperature: route.temperature,
            maxTokens: route.maxTokens,
            topP: 0.9,
          }
        }
      }
      return next
    })
  }, [agentRouting])

  const agents = [
    { id: 'planner', name: 'Planner Agent', desc: '章节规划智能体，负责制定写作大纲', icon: '📋' },
    { id: 'writer', name: 'Writer Agent', desc: '核心写作智能体，负责正文创作', icon: '✍️' },
    { id: 'fast-audit', name: 'Fast Audit Agent', desc: '快速审计智能体，12项基础检查', icon: '⚡' },
    { id: 'deep-audit', name: 'Deep Audit Agent', desc: '深度审计智能体，15维度深度分析', icon: '🔍' },
    { id: 'analyst', name: 'Analyst Agent', desc: '分析智能体，提取人物关系与情节线索', icon: '📊' },
    { id: 'polisher', name: 'Polisher Agent', desc: '润色智能体，文风统一与质量提升', icon: '✨' },
    { id: 'memory-update', name: 'Memory Update Agent', desc: '记忆更新智能体，维护长期记忆一致性', icon: '🧠' },
    { id: 'pre-audit', name: 'Pre Audit Agent', desc: '预审计智能体，写作前检查前置条件', icon: '🛑' },
    { id: 'composer', name: 'Composer Agent', desc: '上下文组装智能体，构建完整输入上下文', icon: '📦' },
    { id: 'context-prep', name: 'Context Prep Agent', desc: '上下文准备智能体，检索相关素材', icon: '📕' },
  ]

  const getConfig = (agentId: string): AgentConfig => ({
    ...defaultConfig,
    ...configs[agentId],
    systemPrompt: configs[agentId]?.systemPrompt ?? `${agents.find(a => a.id === agentId)?.name ?? ''} system prompt template...`,
  })

  const updateConfig = (agentId: string, patch: Partial<AgentConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [agentId]: { ...getConfig(agentId), ...patch },
    }))
  }

  const handleSave = async (agentId: string) => {
    const cfg = getConfig(agentId)
    // Update this agent's routing entry
    const updatedRouting = agentRouting.map((r) =>
      r.agent === agentId
        ? { ...r, providerId: cfg.providerId, model: cfg.model, temperature: cfg.temperature, maxTokens: cfg.maxTokens }
        : r
    )
    // Add if not exists
    if (!updatedRouting.find((r) => r.agent === agentId)) {
      updatedRouting.push({
        agent: agentId,
        providerId: cfg.providerId,
        model: cfg.model,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      })
    }

    try {
      await saveAgentRouting(updatedRouting)
      showToast(`已保存 ${agents.find(a => a.id === agentId)?.name} 配置`, 'success')
    } catch {
      showToast('保存失败，请确认已配置 AI 供应商', 'error')
    }
  }

  const handleReset = (agentId: string) => {
    setConfigs(prev => {
      const next = { ...prev }
      delete next[agentId]
      return next
    })
    showToast('已重置为默认配置', 'info')
  }

  const cfg = getConfig(activeAgent)
  const agent = agents.find(a => a.id === activeAgent)

  return (
    <div className="p-5 h-full overflow-y-auto">
      <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-2">
        <span>🤖</span> 智能体编辑器
      </h2>

      {enabledProviders.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-yellow-300 text-sm">
          ⚠️ 暂未启用任何 AI 供应商，请先在「设置 → AI 供应商」中配置并启用至少一个供应商。
        </div>
      )}

      <div className="flex gap-4 h-[calc(100%-48px)]">
        {/* Agent list */}
        <div className="w-56 space-y-1 overflow-y-auto">
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => setActiveAgent(agent.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${
                activeAgent === agent.id ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{agent.icon}</span>
                <span className="font-medium">{agent.name}</span>
              </div>
              <p className="text-xs mt-0.5 opacity-60 line-clamp-1">{agent.desc}</p>
            </button>
          ))}
        </div>

        {/* Agent detail editor */}
        <div className="flex-1 bg-gray-800/40 rounded-xl border border-gray-700 p-5 overflow-y-auto">
          {agent && (
            <div key={agent.id}>
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700">
                <span className="text-2xl">{agent.icon}</span>
                <div>
                  <h3 className="text-white font-semibold text-lg">{agent.name}</h3>
                  <p className="text-gray-500 text-xs">{agent.desc}</p>
                </div>
              </div>

              {/* Config form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs mb-1.5">System Prompt</label>
                  <textarea
                    rows={8}
                    value={cfg.systemPrompt}
                    onChange={e => updateConfig(activeAgent, { systemPrompt: e.target.value })}
                    className="w-full bg-gray-900 text-gray-200 px-3 py-2 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Provider + Model Combined */}
                  <div className="col-span-2">
                    <label className="block text-gray-400 text-xs mb-1.5">供应商 / 模型</label>
                    {modelOptions.length > 0 ? (
                      <select
                        value={`${cfg.providerId}::${cfg.model}`}
                        onChange={e => {
                          const [providerId, model] = e.target.value.split('::')
                          updateConfig(activeAgent, { providerId, model })
                        }}
                        className="w-full bg-gray-900 text-gray-200 px-3 py-2 rounded-lg text-sm outline-none"
                      >
                        <option value="::">默认（使用环境变量配置）</option>
                        {modelOptions.map(opt => (
                          <option key={`${opt.providerId}::${opt.model}`} value={`${opt.providerId}::${opt.model}`}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={cfg.model}
                        onChange={e => updateConfig(activeAgent, { model: e.target.value })}
                        placeholder="手动输入模型名，如 deepseek-chat"
                        className="w-full bg-gray-900 text-gray-200 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs mb-1.5">Temperature</label>
                    <input type="number" step="0.05" min="0" max="2"
                      value={cfg.temperature}
                      onChange={e => updateConfig(activeAgent, { temperature: Number(e.target.value) })}
                      className="w-full bg-gray-900 text-gray-200 px-3 py-2 rounded-lg text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1.5">Max Tokens</label>
                    <input type="number"
                      value={cfg.maxTokens}
                      onChange={e => updateConfig(activeAgent, { maxTokens: Number(e.target.value) })}
                      className="w-full bg-gray-900 text-gray-200 px-3 py-2 rounded-lg text-sm outline-none" />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs mb-1.5">Top P</label>
                    <input type="number" step="0.05" min="0" max="1"
                      value={cfg.topP}
                      onChange={e => updateConfig(activeAgent, { topP: Number(e.target.value) })}
                      className="w-full bg-gray-900 text-gray-200 px-3 py-2 rounded-lg text-sm outline-none" />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleSave(activeAgent)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm transition"
                  >
                    💾 保存配置（同步路由）
                  </button>
                  <button
                    onClick={() => handleReset(activeAgent)}
                    className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg text-sm transition"
                  >
                    重置默认
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
