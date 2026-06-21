import { useState } from 'react'
import { runAudit } from '../api/client'

interface Props {
  workspaceId: string
  chapterText: string
  chapterNumber: number
}

interface CheckItem {
  id: number
  name: string
  passed: boolean
  score: number
  details?: string[]
}

interface IssueItem {
  dimension: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  location: string
  description: string
  suggestion: string
  auto_fixable: boolean
}

export default function AuditPanel({ workspaceId, chapterText, chapterNumber }: Props) {
  const [loading, setLoading] = useState(false)
  const [fastChecks, setFastChecks] = useState<CheckItem[]>([])
  const [deepIssues, setDeepIssues] = useState<IssueItem[]>([])
  const [fastScore, setFastScore] = useState<number | null>(null)
  const [deepScore, setDeepScore] = useState<number | null>(null)
  const [error, setError] = useState('')

  const handleRunAudit = async () => {
    if (!chapterText) {
      setError('请先生成章节内容')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await runAudit(workspaceId, chapterText, chapterNumber)
      setFastChecks(result.fastAudit.checks || [])
      setFastScore(result.fastAudit.score)
      setDeepIssues(result.deepAudit.issues || [])
      setDeepScore(result.deepAudit.score)
    } catch (e) {
      setError(e instanceof Error ? e.message : '审计失败')
    } finally {
      setLoading(false)
    }
  }

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'text-red-400 bg-red-900/30'
      case 'high': return 'text-orange-400 bg-orange-900/30'
      case 'medium': return 'text-yellow-400 bg-yellow-900/30'
      default: return 'text-blue-400 bg-blue-900/30'
    }
  }

  const scoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400'
    if (score >= 0.6) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <span>🔍</span> 审计面板
        </h3>
        <button
          onClick={handleRunAudit}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          {loading ? '⏳ 审计中...' : '▶ 运行审计'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {fastScore !== null && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white font-medium">快速审计 (12项检查)</h4>
            <span className={`text-lg font-bold ${scoreColor(fastScore)}`}>
              {(fastScore * 100).toFixed(0)}分
            </span>
          </div>
          
          <div className="space-y-2">
            {fastChecks.map(check => (
              <div key={check.id} className="flex items-center justify-between bg-gray-900 rounded p-2">
                <div className="flex items-center gap-2">
                  <span className={check.passed ? 'text-green-400' : 'text-red-400'}>
                    {check.passed ? '✅' : '❌'}
                  </span>
                  <span className="text-gray-300 text-sm">{check.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {check.details && check.details.length > 0 && (
                    <span className="text-gray-500 text-xs">{check.details[0]}</span>
                  )}
                  <span className={`text-xs font-mono ${scoreColor(check.score)}`}>
                    {(check.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deepScore !== null && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white font-medium">深度审计 (15维度)</h4>
            <span className={`text-lg font-bold ${scoreColor(deepScore / 100)}`}>
              {deepScore}分
            </span>
          </div>
          
          {deepIssues.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-green-400 text-sm">🎉 未发现严重问题</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deepIssues.map((issue, i) => (
                <div key={i} className="bg-gray-900 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-300 text-sm font-medium">{issue.dimension}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${severityColor(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    {issue.auto_fixable && (
                      <span className="text-green-400 text-xs">🔧 可自动修复</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs mb-1">{issue.description}</p>
                  <p className="text-gray-500 text-xs">💡 {issue.suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
