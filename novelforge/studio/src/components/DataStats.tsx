import { useState, useMemo } from 'react'
import type { Chapter } from '../types'
import { countWords } from '../utils/text'

interface Props {
  chapters: Chapter[]
  todayWords: number
  /** Monthly API cost from billing API; hardcoded placeholder until backend supports it */
  costMonth?: number
}

export default function DataStats({ chapters, todayWords, costMonth = 0 }: Props) {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d')

  // Compute real stats from chapters
  const stats = useMemo(() => {
    const totalWords = chapters.reduce((sum, ch) => sum + countWords(ch.content), 0)
    const totalChapters = chapters.length
    const avgCostPerK = totalWords > 0 ? (costMonth / (totalWords / 1000)) : 0
    const streak = 0 // placeholder until activity tracking is added
    return {
      totalWords,
      todayWords,
      avgDaily: 0, // placeholder — needs date-based tracking
      totalChapters,
      activeDays: 0,
      streak,
      costMonth,
      avgCostPerK,
      auditScoreAvg: 0,
    }
  }, [chapters, todayWords, costMonth])

  // Weekly data from chapters (last 7 entries by chapter number)
  const weeklyData = useMemo(() => {
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const recent = chapters.slice(-7)
    return recent.map((ch, i) => ({
      day: dayNames[i % 7],
      words: countWords(ch.content),
      score: 0, // placeholder until audit scores are stored per-chapter
    }))
  }, [chapters])

  const maxWords = Math.max(...weeklyData.map(d => d.words), 1)

  // Filter indicator
  const periodLabel = period === '7d' ? '近7天' : period === '30d' ? '近30天' : '近90天'

  return (
    <div className="p-5 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>📊</span> 数据统计
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{periodLabel} · {stats.totalChapters}章 · {(stats.totalWords / 10000).toFixed(1)}万字</span>
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-md text-xs transition ${period === p ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {p === '7d' ? '近7天' : p === '30d' ? '近30天' : '近90天'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard label="📝 总字数" value={stats.totalWords.toLocaleString()} sub={`${(stats.totalWords / 10000).toFixed(1)}万`} color="purple" />
        <MetricCard label="📅 今日字数" value={stats.todayWords.toLocaleString()} sub={`均章 ${stats.totalChapters > 0 ? Math.round(stats.totalWords / stats.totalChapters).toLocaleString() : 0}字`} color="blue" />
        <MetricCard label="📕 章节数" value={stats.totalChapters.toString()} sub={stats.totalChapters > 0 ? '已创作' : '暂无章节'} color="green" />
        <MetricCard label="🔥 连续写作" value={stats.streak > 0 ? `${stats.streak}天` : '—'} sub="即将上线" color="orange" />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricCard label="💰 本月费用" value={`$${stats.costMonth.toFixed(2)}`} sub={`千字 $${stats.avgCostPerK.toFixed(3)}`} color="yellow" />
        <MetricCard label="🎯 写作效率" value={stats.totalChapters > 0 ? `${Math.round(stats.totalWords / Math.max(stats.totalChapters, 1))}字/章` : '—'} sub="平均每章" color="pink" />
        <MetricCard label="⏱️ 创作进度" value={stats.totalChapters > 0 ? `${Math.min(stats.totalChapters, 100)}%` : '0%'} sub="章节数/100" color="cyan" />
      </div>

      {/* Chapter word count chart */}
      <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
        <h3 className="text-white font-medium text-sm mb-3">最近章节字数分布</h3>
        {weeklyData.length > 0 ? (
          <div className="flex items-end gap-2 h-36">
            {weeklyData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative group">
                  <div
                    className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t-md transition-all hover:from-purple-500 hover:to-purple-300"
                    style={{ height: `${Math.max((d.words / maxWords) * 120, 4)}px` }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                    {d.words.toLocaleString()}字
                  </div>
                </div>
                <span className="text-gray-500 text-[10px]">{d.day}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-600 text-sm text-center py-10">
            暂无章节数据，开始写作后此处将显示字数分布
          </div>
        )}
      </div>

      {/* Word count summary per chapter */}
      {chapters.length > 0 && (
        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4 mt-4">
          <h3 className="text-white font-medium text-sm mb-3">各章节字数一览</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {chapters.map(ch => {
              const wc = countWords(ch.content)
              return (
                <div key={ch.number} className="flex items-center justify-between px-3 py-1.5 rounded bg-gray-800/50 text-xs">
                  <span className="text-gray-400">第{ch.number}章</span>
                  <span className="text-purple-300 font-mono">{wc.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    purple: 'from-purple-600/20 to-transparent border-purple-500/20',
    blue: 'from-blue-600/20 to-transparent border-blue-500/20',
    green: 'from-green-600/20 to-transparent border-green-500/20',
    orange: 'from-orange-600/20 to-transparent border-orange-500/20',
    yellow: 'from-yellow-600/20 to-transparent border-yellow-500/20',
    pink: 'from-pink-600/20 to-transparent border-pink-500/20',
    cyan: 'from-cyan-600/20 to-transparent border-cyan-500/20',
  }

  const textColors: Record<string, string> = {
    purple: 'text-purple-400', blue: 'text-blue-400', green: 'text-green-400', orange: 'text-orange-400',
    yellow: 'text-yellow-400', pink: 'text-pink-400', cyan: 'text-cyan-400',
  }

  return (
    <div className={`bg-gradient-to-b ${colors[color]} rounded-lg border p-3`}>
      <p className="text-gray-500 text-[11px] mb-0.5">{label}</p>
      <p className={`font-bold text-lg ${textColors[color]}`}>{value}</p>
      <p className="text-gray-600 text-[10px]">{sub}</p>
    </div>
  )
}
