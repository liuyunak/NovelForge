import { useState, useEffect, useCallback } from 'react'
import { getRhythmCurve, RhythmCurveResponse } from '../api/client'
import { logError } from '../utils/logger'

interface Props {
  workspaceId: string
}

const chartColors = {
  hookStrength: '#a855f7',     // purple-500
  coolPoint: '#22c55e',        // green-500
  emotionalHigh: '#ef4444',    // red-500
  emotionalLow: '#3b82f6',     // blue-500
  grid: '#1f2937',             // gray-800
  text: '#6b7280',             // gray-500
}

export default function RhythmPanel({ workspaceId }: Props) {
  const [data, setData] = useState<RhythmCurveResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<'hook_strength' | 'cool_point_density' | 'emotional_range' | 'micro_payoffs'>('hook_strength')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getRhythmCurve(workspaceId)
      setData(result)
    } catch (e) {
      logError('Failed to load rhythm data', e)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const chapters = data?.chapters || []
  const metrics = data?.overall_metrics

  // --- Chart calculations ---
  const chartWidth = 600
  const chartHeight = 200
  const padding = { top: 10, right: 10, bottom: 25, left: 35 }
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom

  // Compute values for selected metric
  const getMetricValues = (): number[] => {
    switch (selectedMetric) {
      case 'hook_strength':
        return chapters.map(c => c.hook_strength)
      case 'cool_point_density': {
        // Dynamic max: use the highest cool_point count across all chapters as divisor
        const maxCoolPoints = Math.max(1, ...chapters.map(c => c.cool_points.length))
        return chapters.map(c => Math.min(c.cool_points.length / maxCoolPoints, 1))
      }
      case 'emotional_range':
        return chapters.map(c => {
          const curve = c.emotional_curve
          if (!curve || curve.length === 0) return 0.5
          return (Math.max(...curve) - Math.min(...curve)) / 2 + 0.5
        })
      case 'micro_payoffs':
        return chapters.map(c => Math.min(c.micro_payoffs / 3, 1))
      default:
        return chapters.map(c => c.hook_strength)
    }
  }

  const metricLabels: Record<string, string> = {
    hook_strength: '钩子强度',
    cool_point_density: '爽点密度',
    emotional_range: '情绪波动',
    micro_payoffs: '小额回报',
  }

  const values = getMetricValues()

  // Generate SVG line path
  const generateLinePath = (vals: number[]): string => {
    if (vals.length === 0) return ''
    if (vals.length === 1) {
      const x = padding.left + plotWidth / 2
      const y = padding.top + plotHeight * (1 - vals[0])
      return `M${x},${y}`
    }
    return vals.map((v, i) => {
      const x = padding.left + (vals.length === 1 ? plotWidth / 2 : (i / (vals.length - 1)) * plotWidth)
      const y = padding.top + plotHeight * (1 - v)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    }).join(' ')
  }

  // Generate filled area path
  const generateAreaPath = (vals: number[]): string => {
    if (vals.length === 0) return ''
    const linePath = vals.map((v, i) => {
      const x = padding.left + (vals.length === 1 ? plotWidth / 2 : (i / (vals.length - 1)) * plotWidth)
      const y = padding.top + plotHeight * (1 - v)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    }).join(' ')
    const lastX = padding.left + (vals.length === 1 ? plotWidth / 2 : plotWidth)
    const bottomY = padding.top + plotHeight
    return `${linePath} L${lastX},${bottomY} L${padding.left},${bottomY} Z`
  }

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const xLabels = chapters.map((_, i) => {
    if (chapters.length <= 10) return i + 1
    // Show every Nth label
    const step = Math.ceil(chapters.length / 10)
    return (i + 1) % step === 0 || i === 0 || i === chapters.length - 1 ? i + 1 : null
  })

  // Debt trend display
  const debtTrendLabel: Record<string, string> = {
    increasing: '📈 增长中',
    stable: '➡️ 持平',
    decreasing: '📉 下降中',
  }

  const debtTrendColor: Record<string, string> = {
    increasing: 'text-red-400',
    stable: 'text-yellow-400',
    decreasing: 'text-green-400',
  }

  return (
    <div className="p-5 space-y-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl flex items-center gap-2">
          <span>📈</span> 节奏曲线
        </h2>
        <button onClick={loadData} className="text-sm px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition">
          🔄
        </button>
      </div>

      {/* Overall Metrics */}
      {metrics && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-800/60 rounded-lg p-3 text-center">
            <p className="text-purple-400 font-bold text-xl">{(metrics.avg_hook_strength * 100).toFixed(0)}%</p>
            <p className="text-gray-500 text-xs">平均钩子强度</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg p-3 text-center">
            <p className="text-green-400 font-bold text-xl">{metrics.avg_cool_point_density.toFixed(1)}</p>
            <p className="text-gray-500 text-xs">平均爽点密度</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg p-3 text-center">
            <p className="text-yellow-400 font-bold text-xl">{metrics.total_payoffs}</p>
            <p className="text-gray-500 text-xs">总回报数</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg p-3 text-center">
            <p className={`font-bold text-xl ${debtTrendColor[metrics.debt_trend] || 'text-gray-400'}`}>
              {debtTrendLabel[metrics.debt_trend] || metrics.debt_trend}
            </p>
            <p className="text-gray-500 text-xs">债务趋势</p>
          </div>
        </div>
      )}

      {/* Metric Selector */}
      <div className="flex gap-2">
        {Object.entries(metricLabels).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedMetric(key as typeof selectedMetric)}
            className={`px-3 py-1.5 rounded-lg text-xs transition ${
              selectedMetric === key
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <p className="text-gray-500 text-center py-8">加载中...</p>
      ) : chapters.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">📈</div>
          <p className="text-gray-400 mb-1">暂无节奏数据</p>
          <p className="text-gray-600 text-sm">生成章节后，系统会自动分析每章的节奏曲线</p>
        </div>
      ) : (
        <div className="bg-gray-800/40 rounded-lg p-4 border border-gray-700/50 overflow-x-auto">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ minWidth: '400px' }}>
            {/* Grid lines */}
            {gridLines.map(level => (
              <g key={level}>
                <line
                  x1={padding.left}
                  y1={padding.top + plotHeight * (1 - level)}
                  x2={padding.left + plotWidth}
                  y2={padding.top + plotHeight * (1 - level)}
                  stroke={chartColors.grid}
                  strokeWidth="0.5"
                  strokeDasharray={level === 0.5 ? '4 4' : '2 4'}
                />
                <text
                  x={padding.left - 5}
                  y={padding.top + plotHeight * (1 - level) + 4}
                  fill={chartColors.text}
                  fontSize="8"
                  textAnchor="end"
                >
                  {Math.round(level * 100)}%
                </text>
              </g>
            ))}

            {/* X axis labels */}
            {xLabels.map((label, i) => {
              if (label === null) return null
              const x = padding.left + (chapters.length === 1 ? plotWidth / 2 : (i / (chapters.length - 1)) * plotWidth)
              return (
                <text
                  key={i}
                  x={x}
                  y={chartHeight - 3}
                  fill={chartColors.text}
                  fontSize="8"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )
            })}

            {/* Area fill */}
            <path
              d={generateAreaPath(values)}
              fill={chartColors.hookStrength}
              fillOpacity="0.1"
            />

            {/* Line */}
            <path
              d={generateLinePath(values)}
              fill="none"
              stroke={chartColors.hookStrength}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {values.map((v, i) => {
              const x = padding.left + (values.length === 1 ? plotWidth / 2 : (i / (values.length - 1)) * plotWidth)
              const y = padding.top + plotHeight * (1 - v)
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={chartColors.hookStrength}
                  stroke="#0d1117"
                  strokeWidth="1"
                />
              )
            })}
          </svg>
        </div>
      )}

      {/* Chapter Detail List */}
      {chapters.length > 0 && (() => {
        // Dynamic max values for progress-bar scaling (instead of hardcoded /5, /3)
        const maxCoolPoints = Math.max(1, ...chapters.map(c => c.cool_points.length))
        const maxMicroPayoffs = Math.max(1, ...chapters.map(c => c.micro_payoffs))
        return (
        <div className="space-y-2">
          <h3 className="text-gray-300 text-sm font-medium">章节详情</h3>
          {chapters.map(ch => (
            <div key={ch.chapter_number} className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-sm font-medium">
                  第{ch.chapter_number}章{ch.chapter_title ? ` ${ch.chapter_title}` : ''}
                </span>
                <span className="text-gray-500 text-[10px]">
                  债务: {ch.reading_debt_snapshot}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {/* Hook Strength */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-500 text-[10px]">钩子强度</span>
                    <span className="text-purple-400 text-[10px]">{(ch.hook_strength * 100).toFixed(0)}%</span>
                  </div>
                  <div className="bg-gray-700 h-1 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${ch.hook_strength * 100}%` }} />
                  </div>
                </div>
                {/* Cool Points */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-500 text-[10px]">爽点</span>
                    <span className="text-green-400 text-[10px]">{ch.cool_points.length}</span>
                  </div>
                  <div className="bg-gray-700 h-1 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full rounded-full" style={{ width: `${Math.min(ch.cool_points.length / maxCoolPoints * 100, 100)}%` }} />
                  </div>
                </div>
                {/* Micro Payoffs */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-500 text-[10px]">小额回报</span>
                    <span className="text-yellow-400 text-[10px]">{ch.micro_payoffs}</span>
                  </div>
                  <div className="bg-gray-700 h-1 rounded-full overflow-hidden">
                    <div className="bg-yellow-500 h-full rounded-full" style={{ width: `${Math.min(ch.micro_payoffs / maxMicroPayoffs * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
              {/* Cool points details */}
              {ch.cool_points.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ch.cool_points.map((cp, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-400">
                      {cp.type} (强度:{Math.round(cp.intensity * 100)}%)
                    </span>
                  ))}
                </div>
              )}
              {/* Alerts */}
              {ch.pace_alerts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ch.pace_alerts.map((alert, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400">
                      ⚠️ {alert}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )})()}

      {/* Last Updated */}
      {data?.last_updated && (
        <p className="text-gray-600 text-[10px] text-right">
          最后更新: {new Date(data.last_updated).toLocaleString('zh-CN')}
        </p>
      )}
    </div>
  )
}
