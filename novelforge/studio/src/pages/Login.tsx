import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, setAuthToken, isAuthenticated } from '../api/client'
import { showToast } from '../utils/logger'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  // If already authenticated, redirect to home (via useEffect to avoid render-time side effect)
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      showToast('请输入用户名和密码', 'error')
      return
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        showToast('两次输入的密码不一致', 'error')
        return
      }
      if (password.length < 6) {
        showToast('密码至少需要6个字符', 'error')
        return
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showToast('用户名只能包含字母、数字和下划线', 'error')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const result = mode === 'login'
        ? await login({ username: username.trim(), password })
        : await register({ username: username.trim(), password })

      setAuthToken(result.token)
      showToast(mode === 'login' ? '登录成功' : '注册成功', 'success')
      navigate('/', { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      if (message.includes('401') || message.includes('Invalid username')) {
        showToast('用户名或密码错误', 'error')
      } else if (message.includes('409') || message.includes('already taken')) {
        showToast('用户名已被占用', 'error')
      } else if (message.includes('400') || message.includes('Invalid')) {
        showToast('输入格式不正确', 'error')
      } else {
        showToast(mode === 'login' ? '登录失败，请稍后重试' : '注册失败，请稍后重试', 'error')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">NovelForge</h1>
          <p className="text-gray-400">AI辅助网文创作工作台</p>
        </div>

        {/* Card */}
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-2xl">
          {/* Tabs */}
          <div className="flex mb-6 border-b border-gray-700">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 pb-3 text-sm font-medium transition border-b-2 ${
                mode === 'login'
                  ? 'text-blue-400 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              登录
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 pb-3 text-sm font-medium transition border-b-2 ${
                mode === 'register'
                  ? 'text-blue-400 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              注册
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4" onKeyDown={handleKeyDown}>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                placeholder="输入用户名"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-700 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                placeholder="输入密码"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-700 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                  placeholder="再次输入密码"
                />
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-2.5 rounded-lg transition font-medium mt-2"
            >
              {isSubmitting
                ? (mode === 'login' ? '登录中...' : '注册中...')
                : (mode === 'login' ? '登录' : '注册')}
            </button>
          </div>

          {/* Switch mode hint */}
          <p className="text-center text-gray-500 text-sm mt-6">
            {mode === 'login' ? (
              <>还没有账号？{' '}
                <button
                  onClick={() => setMode('register')}
                  className="text-blue-400 hover:text-blue-300 transition"
                >
                  立即注册
                </button>
              </>
            ) : (
              <>已有账号？{' '}
                <button
                  onClick={() => setMode('login')}
                  className="text-blue-400 hover:text-blue-300 transition"
                >
                  去登录
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
