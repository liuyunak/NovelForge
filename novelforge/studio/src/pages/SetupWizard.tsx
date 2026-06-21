import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setAuthToken } from '../api/client'

// ==================== Types ====================

type SetupStep = 'welcome' | 'account' | 'provider' | 'complete'

interface SetupData {
  username: string
  password: string
  confirmPassword: string
  providerType: string
  providerName: string
  providerBaseUrl: string
  providerApiKey: string
  providerModel: string
}

interface TestResult {
  status: 'idle' | 'testing' | 'ok' | 'fail'
  models: string[]
  error: string
}

// ==================== Provider Presets ====================

const PROVIDER_PRESETS: Record<string, { name: string; baseUrl: string; apiKeyLabel: string; model: string }> = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKeyLabel: 'DeepSeek API Key', model: 'deepseek-chat' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com', apiKeyLabel: 'OpenAI API Key', model: 'gpt-4o' },
  ollama: { name: 'Ollama (本地)', baseUrl: 'http://localhost:11434', apiKeyLabel: '', model: 'qwen3' },
  'llama-cpp': { name: 'llama.cpp (本地)', baseUrl: 'http://127.0.0.1:8080', apiKeyLabel: '', model: 'qwen3' },
  'lm-studio': { name: 'LM Studio (本地)', baseUrl: 'http://127.0.0.1:1234', apiKeyLabel: '', model: 'local-model' },
  skip: { name: '', baseUrl: '', apiKeyLabel: '', model: '' },
}

const API_BASE = '/api'

// ==================== Component ====================

export default function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState<SetupStep>('welcome')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [setupStatus, setSetupStatus] = useState<'loading' | 'needed' | 'ready'>('loading')

  const [data, setData] = useState<SetupData>({
    username: '',
    password: '',
    confirmPassword: '',
    providerType: 'deepseek',
    providerName: '',
    providerBaseUrl: '',
    providerApiKey: '',
    providerModel: '',
  })

  const [testResult, setTestResult] = useState<TestResult>({
    status: 'idle',
    models: [],
    error: '',
  })

  // Check if setup is needed
  useEffect(() => {
    fetch(`${API_BASE}/setup/status`)
      .then(r => r.json())
      .then((res: { needsSetup: boolean }) => {
        if (!res.needsSetup) {
          setSetupStatus('ready')
          navigate('/login')
        } else {
          setSetupStatus('needed')
        }
      })
      .catch(() => setSetupStatus('needed'))
  }, [navigate])

  // When preset changes, auto-fill
  useEffect(() => {
    const preset = PROVIDER_PRESETS[data.providerType]
    if (preset && data.providerType !== 'skip') {
      setData(d => ({
        ...d,
        providerName: preset.name,
        providerBaseUrl: preset.baseUrl,
        providerModel: preset.model,
      }))
    }
  }, [data.providerType])

  const updateField = (field: keyof SetupData, value: string) => {
    setData(d => ({ ...d, [field]: value }))
    setError('')
  }

  const isLocalProvider = ['ollama', 'llama-cpp', 'lm-studio'].includes(data.providerType)

  // ==================== Step: Welcome ====================
  const handleWelcome = () => {
    setStep('account')
  }

  // ==================== Step: Account ====================
  const handleAccount = () => {
    setError('')
    if (!data.username || data.username.length < 3) {
      setError('用户名至少 3 个字符')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
      setError('用户名只能包含英文字母、数字和下划线')
      return
    }
    if (data.password.length < 8) {
      setError('密码至少 8 个字符')
      return
    }
    if (data.password !== data.confirmPassword) {
      setError('两次密码输入不一致')
      return
    }
    setStep('provider')
  }

  // ==================== Step: Test Provider ====================
  const handleTestProvider = async () => {
    const baseUrl = data.providerBaseUrl || PROVIDER_PRESETS[data.providerType]?.baseUrl
    if (!baseUrl) return

    setTestResult({ status: 'testing', models: [], error: '' })
    try {
      const res = await fetch(`${API_BASE}/setup/test-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey: data.providerApiKey }),
      })
      const result = await res.json()
      if (result.ok) {
        setTestResult({ status: 'ok', models: result.models, error: '' })
        if (result.models.length > 0 && !data.providerModel) {
          setData(d => ({ ...d, providerModel: result.models[0] }))
        }
      } else {
        setTestResult({ status: 'fail', models: [], error: result.error || '连接失败' })
      }
    } catch (err: any) {
      setTestResult({ status: 'fail', models: [], error: err.message })
    }
  }

  // ==================== Step: Complete Setup ====================
  const handleComplete = async () => {
    setLoading(true)
    setError('')

    const payload: any = {
      username: data.username,
      password: data.password,
    }

    if (data.providerType !== 'skip') {
      payload.providerName = data.providerName
      payload.providerType = data.providerType
      payload.providerBaseUrl = data.providerBaseUrl
      payload.providerApiKey = data.providerApiKey
      payload.providerModel = data.providerModel
    }

    try {
      const res = await fetch(`${API_BASE}/setup/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()

      if (result.success) {
        setAuthToken(result.token)
        setStep('complete')
      } else {
        setError(result.error || '配置失败，请重试')
      }
    } catch (err: any) {
      setError(err.message || '网络错误，请检查后端服务是否启动')
    } finally {
      setLoading(false)
    }
  }

  const handleGoToLogin = () => {
    navigate('/login')
  }

  // ==================== Loading State ====================
  if (setupStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">正在检查配置状态...</p>
        </div>
      </div>
    )
  }

  // ==================== Render ====================
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="text-blue-400">Novel</span>Forge
          </h1>
          <p className="text-gray-400 text-sm">AI 辅助长篇网文创作工作台</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['welcome', 'account', 'provider', 'complete'] as SetupStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step === s
                    ? 'bg-blue-500 text-white'
                    : ['welcome', 'account', 'provider', 'complete'].indexOf(step) > i
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {['welcome', 'account', 'provider', 'complete'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              {i < 3 && <div className="w-8 h-0.5 bg-gray-700" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
          {/* Step 1: Welcome */}
          {step === 'welcome' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-3">欢迎使用 NovelForge</h2>
              <p className="text-gray-400 mb-4 text-sm leading-relaxed">
                NovelForge 是一个 AI 辅助的网文创作工具。它能帮你规划大纲、生成草稿、检查质量，让你专注于创意和决策。
              </p>
              <div className="space-y-3 mb-6">
                {[
                  { icon: '🧠', text: '全文记忆 — 50 章+也不忘设定' },
                  { icon: '✍️', text: '风格迁移 — 学习你的写作风格' },
                  { icon: '🔌', text: '多供应商 — DeepSeek/OpenAI/本地模型' },
                  { icon: '💰', text: '低成本 — 云端模式仅 $2-4/月' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 mb-4">
                首次使用需要进行简单配置，只需 2 分钟。
              </div>
              <button
                onClick={handleWelcome}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
              >
                开始配置
              </button>
            </div>
          )}

          {/* Step 2: Create Admin Account */}
          {step === 'account' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-3">创建管理员账号</h2>
              <p className="text-gray-400 mb-4 text-sm">创建一个管理员账户来管理你的创作。</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">用户名</label>
                  <input
                    type="text"
                    value={data.username}
                    onChange={e => updateField('username', e.target.value)}
                    placeholder="例如：my_author"
                    maxLength={50}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">英文字母、数字和下划线，3-50 个字符</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">密码</label>
                  <input
                    type="password"
                    value={data.password}
                    onChange={e => updateField('password', e.target.value)}
                    placeholder="至少 8 个字符"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">确认密码</label>
                  <input
                    type="password"
                    value={data.confirmPassword}
                    onChange={e => updateField('confirmPassword', e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                  />
                </div>

                {error && (
                  <div className="px-3 py-2 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep('welcome')}
                  className="flex-1 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm"
                >
                  上一步
                </button>
                <button
                  onClick={handleAccount}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors text-sm"
                >
                  下一步
                </button>
              </div>
            </div>
          )}

          {/* Step 3: AI Provider */}
          {step === 'provider' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-3">配置 AI 供应商</h2>
              <p className="text-gray-400 mb-4 text-sm">
                选择一个 AI 服务商。你稍后也可以在设置页面添加更多。
              </p>

              <div className="space-y-4">
                {/* Provider Type Select */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">选择供应商</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'deepseek', label: 'DeepSeek', desc: '推荐·性价比' },
                      { key: 'openai', label: 'OpenAI', desc: 'GPT-4o' },
                      { key: 'ollama', label: 'Ollama', desc: '本地免费' },
                      { key: 'skip', label: '跳过', desc: '稍后配置' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => updateField('providerType', opt.key)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          data.providerType === opt.key
                            ? 'border-blue-500 bg-blue-900/20 text-white'
                            : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        <div className="text-sm font-bold">{opt.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {data.providerType !== 'skip' && (
                  <>
                    {/* API Key */}
                    {!isLocalProvider && (
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">
                          {PROVIDER_PRESETS[data.providerType]?.apiKeyLabel || 'API Key'}
                        </label>
                        <input
                          type="password"
                          value={data.providerApiKey}
                          onChange={e => updateField('providerApiKey', e.target.value)}
                          placeholder="sk-..."
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                        />
                        {data.providerType === 'deepseek' && (
                          <p className="text-xs text-gray-500 mt-1">
                            在 <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-blue-400">platform.deepseek.com</a> 注册获取 API Key
                          </p>
                        )}
                      </div>
                    )}

                    {/* Base URL */}
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">API 地址</label>
                      <input
                        type="text"
                        value={data.providerBaseUrl}
                        onChange={e => updateField('providerBaseUrl', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                      />
                    </div>

                    {/* Test Connection */}
                    <button
                      onClick={handleTestProvider}
                      disabled={testResult.status === 'testing'}
                      className="w-full py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm disabled:opacity-50"
                    >
                      {testResult.status === 'testing' ? '⏳ 测试连接中...' : '🔍 测试连接'}
                    </button>

                    {testResult.status === 'ok' && (
                      <div className="px-3 py-2 bg-green-900/50 border border-green-800 rounded-lg text-green-300 text-sm">
                        ✅ 连接成功！发现 {testResult.models.length} 个可用模型
                      </div>
                    )}
                    {testResult.status === 'fail' && (
                      <div className="px-3 py-2 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm">
                        ❌ {testResult.error}
                      </div>
                    )}
                  </>
                )}

                {error && (
                  <div className="px-3 py-2 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep('account')}
                  className="flex-1 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm"
                >
                  上一步
                </button>
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  {loading ? '配置中...' : data.providerType === 'skip' ? '跳过并完成' : '完成配置'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-white mb-3">配置完成！</h2>
              <p className="text-gray-400 mb-2 text-sm">
                NovelForge 已准备就绪。你的管理员账号已创建：
              </p>
              <div className="px-4 py-2 bg-gray-800 rounded-lg inline-block mb-6">
                <span className="text-blue-400 font-mono text-sm">{data.username}</span>
              </div>
              <div className="text-xs text-gray-500 mb-6">
                请重新启动服务以使配置生效（Ctrl+C 后重新运行 start.bat）
              </div>
              <button
                onClick={handleGoToLogin}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
              >
                前往登录
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-6">
          MIT License · Open Source · v3.5
        </p>
      </div>
    </div>
  )
}
