import { useState, useEffect } from 'react'
import { getPipelineStatus } from '../api/client'

interface Props {
  todayWords: number
  monthCost: number
  workspaceId?: string
}

export default function StatusBar({ todayWords, monthCost, workspaceId }: Props) {
  const [darkMode, setDarkMode] = useState(() => {
    // Read dark mode preference from localStorage, default to true
    const stored = localStorage.getItem('novelforge-darkmode')
    if (stored !== null) return stored === 'true'
    return true
  })
  const [pipelineStatus, setPipelineStatus] = useState<string>('空闲')
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)

  // Poll pipeline status
  useEffect(() => {
    if (!workspaceId) {
      setPipelineStatus('--')
      return
    }

    let active = true
    const poll = async () => {
      try {
        const result = await getPipelineStatus(workspaceId)
        if (active) {
          setPipelineStatus(result.status === 'running' ? '运行中' : result.status === 'paused' ? '已暂停' : '空闲')
        }
      } catch {
        if (active) setPipelineStatus('--')
      }
    }

    // Initial check
    poll()

    // Poll every 10 seconds
    const interval = setInterval(poll, 10000)
    return () => { active = false; clearInterval(interval) }
  }, [workspaceId])

  // Check API health
  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const res = await fetch('/api/health')
        if (active) setApiOnline(res.ok)
      } catch {
        if (active) setApiOnline(false)
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  return (
    <div className="h-8 bg-[#0d1117] border-t border-gray-800 px-4 flex items-center justify-between text-xs text-gray-500">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          🖥 流水线:
          <span className={pipelineStatus === '运行中' ? 'text-yellow-400' : pipelineStatus === '已暂停' ? 'text-orange-400' : 'text-green-400'}>
            {pipelineStatus}
          </span>
          {pipelineStatus === '运行中' && <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full ml-1 animate-pulse"></span>}
          {pipelineStatus === '空闲' && <span className="w-1.5 h-1.5 bg-green-400 rounded-full ml-1"></span>}
        </span>
        <span className="flex items-center gap-1">
          ☁ API:
          {apiOnline === null ? (
            <span className="text-gray-500">检测中...</span>
          ) : apiOnline ? (
            <><span className="text-green-400">在线</span><span className="w-1.5 h-1.5 bg-green-400 rounded-full ml-1"></span></>
          ) : (
            <><span className="text-red-400">离线</span><span className="w-1.5 h-1.5 bg-red-400 rounded-full ml-1"></span></>
          )}
        </span>
        <span>📊 今日字数: {todayWords.toLocaleString()}</span>
        <span>💰 本月花费: ${monthCost.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span>深色模式</span>
        <button
          onClick={() => {
            const next = !darkMode
            setDarkMode(next)
            localStorage.setItem('novelforge-darkmode', String(next))
            document.documentElement.classList.toggle('dark', next)
          }}
          className={`w-8 h-4 rounded-full transition ${darkMode ? 'bg-purple-600' : 'bg-gray-600'}`}
        >
          <span className={`block w-3 h-3 bg-white rounded-full transition transform ${darkMode ? 'translate-x-4' : 'translate-x-0.5'}`}></span>
        </button>
      </div>
    </div>
  )
}
