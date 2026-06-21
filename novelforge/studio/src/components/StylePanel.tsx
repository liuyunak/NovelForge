import { useState, useEffect } from 'react'
import { getStyleFingerprint, extractStyle } from '../api/client'

interface Props {
  workspaceId: string
  chapterText?: string
}

interface StyleData {
  sentence_pattern?: { avg_sentence_length: number; short_sentence_ratio: number; complex_sentence_ratio: number }
  vocabulary?: { preferred_verbs: string[]; preferred_nouns: string[]; filler_word_rate: number }
  dialogue_style?: { tag_preference: string; action_with_dialogue: boolean; avg_dialogue_length: number }
  rhetoric?: { metaphor_density: number; preferred_rhetoric: string[]; sensory_preference: string[] }
  pacing?: { description_to_action_ratio: number; inner_monologue_ratio: number }
  metadata?: { source_chapters: number; extraction_date: string; confidence: number }
}

export default function StylePanel({ workspaceId, chapterText }: Props) {
  const [styleData, setStyleData] = useState<StyleData | null>(null)
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStyle()
  }, [workspaceId])

  const loadStyle = async () => {
    setLoading(true)
    try {
      const data = await getStyleFingerprint(workspaceId)
      setStyleData(data)
    } catch {
      // No style fingerprint yet, that's OK
    } finally {
      setLoading(false)
    }
  }

  const handleExtract = async () => {
    if (!chapterText) {
      setError('请先生成或粘贴章节内容')
      return
    }
    setExtracting(true)
    setError('')
    try {
      const data = await extractStyle(workspaceId, chapterText)
      setStyleData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '风格提取失败')
    } finally {
      setExtracting(false)
    }
  }

  const formatPercent = (val: number) => `${(val * 100).toFixed(0)}%`
  const formatDecimal = (val: number) => val.toFixed(1)

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-gray-400 text-sm">加载风格数据...</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <span>🎨</span> 风格管理
        </h3>
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition"
        >
          {extracting ? '⏳ 提取中...' : '🔍 提取风格'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!styleData || !styleData.sentence_pattern ? (
        <div className="text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-gray-500 text-sm">暂无风格指纹数据</p>
          <p className="text-gray-600 text-xs mt-1">点击"提取风格"从章节内容中分析作者风格</p>
        </div>
      ) : (
        <>
          {/* Metadata */}
          {styleData.metadata && (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>来源章节: {styleData.metadata.source_chapters}章</span>
                <span>置信度: {formatPercent(styleData.metadata.confidence)}</span>
                <span>提取日期: {styleData.metadata.extraction_date?.slice(0, 10)}</span>
              </div>
            </div>
          )}

          {/* Sentence Pattern */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h4 className="text-white font-medium text-sm mb-3">📏 句式模式</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-gray-500 text-xs mb-1">平均句长</p>
                <p className="text-purple-400 font-bold text-lg">
                  {formatDecimal(styleData.sentence_pattern?.avg_sentence_length || 0)}
                </p>
                <p className="text-gray-600 text-xs">字/句</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-xs mb-1">短句占比</p>
                <p className="text-purple-400 font-bold text-lg">
                  {formatPercent(styleData.sentence_pattern?.short_sentence_ratio || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-xs mb-1">复杂句占比</p>
                <p className="text-purple-400 font-bold text-lg">
                  {formatPercent(styleData.sentence_pattern?.complex_sentence_ratio || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Dialogue Style */}
          {styleData.dialogue_style && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="text-white font-medium text-sm mb-3">💬 对话风格</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-gray-500 text-xs mb-1">对话标签偏好</p>
                  <p className="text-purple-400 font-bold">
                    {styleData.dialogue_style.tag_preference === 'none' ? '无标签' : styleData.dialogue_style.tag_preference}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 text-xs mb-1">动作+对话</p>
                  <p className={`font-bold ${styleData.dialogue_style.action_with_dialogue ? 'text-green-400' : 'text-gray-400'}`}>
                    {styleData.dialogue_style.action_with_dialogue ? '是' : '否'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 text-xs mb-1">平均对话长</p>
                  <p className="text-purple-400 font-bold">
                    {formatDecimal(styleData.dialogue_style.avg_dialogue_length)}字
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pacing */}
          {styleData.pacing && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="text-white font-medium text-sm mb-3">⏱️ 节奏</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-gray-500 text-xs mb-1">描写/行动比</p>
                  <p className="text-purple-400 font-bold text-lg">
                    {formatDecimal(styleData.pacing.description_to_action_ratio)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 text-xs mb-1">内心独白占比</p>
                  <p className="text-purple-400 font-bold text-lg">
                    {formatPercent(styleData.pacing.inner_monologue_ratio)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Rhetoric */}
          {styleData.rhetoric && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h4 className="text-white font-medium text-sm mb-3">✨ 修辞偏好</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">隐喻密度</span>
                  <span className="text-purple-400">{formatDecimal(styleData.rhetoric.metaphor_density)}</span>
                </div>
                {styleData.rhetoric.sensory_preference && styleData.rhetoric.sensory_preference.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">感官偏好</span>
                    <span className="text-purple-400">{styleData.rhetoric.sensory_preference.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
