/**
 * AIDetectionPanel - AI-generated text detection and analysis
 * 
 * Provides comprehensive AI detection using multiple heuristics:
 * - Forbidden pattern matching
 * - Perplexity analysis
 * - Burstiness analysis
 * - Repetition detection
 */

import { useState, useCallback } from 'react'
import { AIDetection, type DetectionResult } from '../../../src/audit/ai-detection'

interface Props {
  initialText?: string
  onChange?: (result: DetectionResult) => void
}

export default function AIDetectionPanel({ initialText, onChange }: Props) {
  const [text, setText] = useState(initialText || '')
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const handleAnalyze = useCallback(() => {
    if (!text.trim()) return

    setAnalyzing(true)
    
    // Simulate async analysis
    setTimeout(() => {
      const detector = new AIDetection()
      const detectionResult = detector.detect(text)
      setResult(detectionResult)
      setAnalyzing(false)
      onChange?.(detectionResult)
    }, 300)
  }, [text, onChange])

  const handleClear = useCallback(() => {
    setText('')
    setResult(null)
    onChange?.(null as any)
  }, [onChange])

  // Determine risk level color
  const getRiskColor = (score?: number) => {
    if (!score && score !== 0) return 'text-gray-400'
    if (score >= 70) return 'text-green-400'
    if (score >= 40) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getRiskBg = (score?: number) => {
    if (!score && score !== 0) return 'bg-gray-700'
    if (score >= 70) return 'bg-green-900/30 border-green-700'
    if (score >= 40) return 'bg-yellow-900/30 border-yellow-700'
    return 'bg-red-900/30 border-red-700'
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-xl font-bold mb-2">🔍 AI 检测预检</h2>
        <p className="text-sm text-gray-400">
          检测文本的 AI 生成特征，包括 perplexity、burstiness 和多平台评分
        </p>
      </div>

      {/* Text Input */}
      <div className="flex-1 p-4 overflow-hidden flex flex-col">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴或输入要检测的文本..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-4 text-white resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none font-mono text-sm"
        />

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleAnalyze}
            disabled={!text.trim() || analyzing}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg transition font-semibold"
          >
            {analyzing ? '分析中...' : '开始检测'}
          </button>
          <button
            onClick={handleClear}
            className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition"
          >
            清空
          </button>
        </div>
      </div>

      {/* Results Panel */}
      {result && (
        <div className="h-1/2 border-t border-gray-800 overflow-y-auto p-4">
          {/* Overall Score */}
          <div className={`p-4 rounded-lg border mb-4 ${getRiskBg(result.overallScore)}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold">总体评分</h3>
              <span className={`text-3xl font-bold ${getRiskColor(result.overallScore)}`}>
                {result.overallScore}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    result.riskLevel === 'low' ? 'bg-green-500' :
                    result.riskLevel === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${result.overallScore}%` }}
                />
              </div>
              <span className="text-sm font-semibold uppercase">
                {result.riskLevel === 'low' ? '低风险' :
                 result.riskLevel === 'medium' ? '中风险' : '高风险'}
              </span>
            </div>
          </div>

          {/* Platform Scores */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {Object.entries(result.platformScores).map(([platform, score]) => (
              <div key={platform} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                <div className="text-xs text-gray-400 mb-1">{platform}</div>
                <div className={`text-2xl font-bold ${getRiskColor(score)}`}>{score}</div>
              </div>
            ))}
          </div>

          {/* Detailed Metrics */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-4">
            <h4 className="text-sm font-bold text-gray-300 mb-3">详细指标</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">禁止模式匹配:</span>
                <span className={result.metrics.forbiddenPatternCount > 3 ? 'text-red-400' : 'text-green-400'}>
                  {result.metrics.forbiddenPatternCount} 处
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Perplexity (可预测性):</span>
                <span className={result.metrics.perplexityScore < 40 ? 'text-red-400' : 'text-green-400'}>
                  {result.metrics.perplexityScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Burstiness (句式变化):</span>
                <span className={result.metrics.burstinessScore < 30 ? 'text-red-400' : 'text-green-400'}>
                  {result.metrics.burstinessScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">重复度:</span>
                <span className={result.metrics.repetitionScore > 30 ? 'text-red-400' : 'text-green-400'}>
                  {result.metrics.repetitionScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">平均句长:</span>
                <span className="text-gray-300">{result.metrics.averageSentenceLength} 字</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">独特词比率:</span>
                <span className="text-gray-300">{result.metrics.uniqueWordRatio}</span>
              </div>
            </div>
          </div>

          {/* High Risk Segments */}
          {result.highRiskSegments.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-red-400 mb-2">
                ⚠️ 高风险片段 ({result.highRiskSegments.length})
              </h4>
              <div className="space-y-2">
                {result.highRiskSegments.map((segment, idx) => (
                  <div key={idx} className="bg-red-900/20 border border-red-800 rounded p-3 text-sm">
                    <div className="text-gray-300 mb-1 font-mono">{segment.text}</div>
                    <div className="text-red-400 text-xs">{segment.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-blue-400 mb-2">💡 改进建议</h4>
              <ul className="space-y-1 text-sm text-gray-300">
                {result.suggestions.map((suggestion, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!result && !analyzing && (
        <div className="h-1/2 flex items-center justify-center border-t border-gray-800">
          <div className="text-center text-gray-500">
            <div className="text-5xl mb-4">📝</div>
            <div className="text-lg mb-2">输入文本开始检测</div>
            <div className="text-sm">
              支持分析 perplexity、burstiness、重复模式等多维度指标
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
