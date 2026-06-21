import { useState, useEffect } from 'react'
import {
  checkFineTuneStatus,
  generateFineTuneData,
  startFineTuneTraining,
  getFineTuneLogs,
} from '../api/client'
import type {
  FineTuneStatus,
  FineTuneProgress,
  GenerationReport,
  FineTuneConfig,
} from '../types/finetune'
import { showToast } from '../utils/logger'

/**
 * Fine-tune Management Panel
 * 
 * Provides UI for:
 * 1. Checking current fine-tune status
 * 2. Generating training data from processed books
 * 3. Configuring and starting LoRA training
 * 4. Viewing training logs and metrics
 */
export default function FineTunePanel() {
  const [status, setStatus] = useState<FineTuneStatus | null>(null)
  const [progress, setProgress] = useState<FineTuneProgress>({
    status: 'idle',
    progress: 0,
    message: '',
    current_step: '',
  })
  const [report, setReport] = useState<GenerationReport | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isTraining, setIsTraining] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  
  // Training configuration
  const [config, setConfig] = useState<FineTuneConfig>({
    base_model: 'Qwen/Qwen2.5-32B-Instruct',
    lora_r: 32,
    lora_alpha: 64,
    epochs: 3,
    batch_size: 2,
    learning_rate: 0.0002,
    max_length: 2048,
  })
  const [useQuantized, setUseQuantized] = useState(true)

  // Load status on mount
  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    setIsChecking(true)
    try {
      const response = await checkFineTuneStatus()
      setStatus(response.status)
      setProgress(response.progress)
      if (response.report) {
        setReport(response.report)
      }
    } catch (error) {
      console.error('Failed to check fine-tune status:', error)
      showToast('检查微调状态失败', 'error')
    } finally {
      setIsChecking(false)
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setProgress({
      status: 'generating',
      progress: 0,
      message: '正在生成训练数据...',
      current_step: '数据生成中',
    })

    try {
      const data = await generateFineTuneData({
        maxSamples: 50000,
      })
      
      setReport(data)
      setProgress({
        status: 'generating_complete',
        progress: 100,
        message: `生成完成！共生成 ${data.total_generated} 个训练样本`,
        current_step: '完成',
      })
      
      showToast(`数据生成成功：${data.total_generated} 个样本`, 'success')
    } catch (error) {
      console.error('Failed to generate data:', error)
      setProgress({
        status: 'error',
        progress: 0,
        message: '数据生成失败',
        current_step: '错误',
      })
      showToast('数据生成失败', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleStartTraining = async () => {
    setIsTraining(true)
    setProgress({
      status: 'training',
      progress: 0,
      message: '正在启动训练...',
      current_step: '训练初始化',
    })

    try {
      const result = await startFineTuneTraining({
        baseModel: config.base_model,
        loraRank: config.lora_r,
        loraAlpha: config.lora_alpha,
        epochs: config.epochs,
        batchSize: config.batch_size,
        quantized: useQuantized,
      })

      if (result.success) {
        setProgress({
          status: 'complete',
          progress: 100,
          message: '训练启动成功！',
          current_step: '训练中',
        })
        showToast('训练已启动', 'success')
        
        // Poll for logs
        pollLogs()
      } else {
        throw new Error(result.message)
      }
    } catch (error) {
      console.error('Failed to start training:', error)
      setProgress({
        status: 'error',
        progress: 0,
        message: '训练启动失败',
        current_step: '错误',
      })
      showToast('训练启动失败', 'error')
    } finally {
      setIsTraining(false)
    }
  }

  const pollLogs = async () => {
    const interval = setInterval(async () => {
      try {
        const response = await getFineTuneLogs()
        setLogs(response.lines.slice(-50)) // Show last 50 lines
        if (response.status === 'completed' || response.status === 'error') {
          clearInterval(interval)
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)

    // Stop after 5 minutes
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000)
  }

  const formatNumber = (num: number): string => {
    return num.toLocaleString('zh-CN')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">🎯 微调管理</h2>
          <p className="text-gray-400 mt-1">
            本地模型微调 · LoRA · 风格学习
          </p>
        </div>
        <button
          onClick={checkStatus}
          disabled={isChecking}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isChecking ? '刷新中...' : '🔄 刷新状态'}
        </button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Training Status Card */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">训练状态</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">模型路径</span>
              <span className="text-white text-sm">
                {status?.model_path || '未训练'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">训练样本</span>
              <span className="text-white text-sm">
                {status?.training_samples ? formatNumber(status.training_samples) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">上次训练</span>
              <span className="text-white text-sm">
                {status?.last_training_time
                  ? new Date(status.last_training_time).toLocaleDateString('zh-CN')
                  : '从未'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">训练损失</span>
              <span className="text-white text-sm">
                {status?.training_loss !== null && status?.training_loss !== undefined
                  ? status.training_loss.toFixed(4)
                  : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Data Statistics Card */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">数据统计</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">输入书籍</span>
              <span className="text-white text-sm">
                {report?.input_books || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">输入章节</span>
              <span className="text-white text-sm">
                {report?.input_chapters ? formatNumber(report.input_chapters) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">输入字数</span>
              <span className="text-white text-sm">
                {report?.input_words ? formatNumber(report.input_words) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">平均质量</span>
              <span className="text-white text-sm">
                {report?.avg_quality_score ? `${report.avg_quality_score}/10` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Config Card */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">配置信息</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">LoRA Rank</span>
              <span className="text-white text-sm">{config.lora_r}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">LoRA Alpha</span>
              <span className="text-white text-sm">{config.lora_alpha}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Epochs</span>
              <span className="text-white text-sm">{config.epochs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">量化训练</span>
              <span className="text-white text-sm">{useQuantized ? '是 (4-bit)' : '否'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      {progress.status !== 'idle' && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">当前进度</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white text-sm">{progress.current_step}</span>
              <span className="text-blue-400 text-sm font-mono">{progress.progress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              ></div>
            </div>
            <p className="text-gray-400 text-sm">{progress.message}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Generate Data Button */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">步骤 1: 生成训练数据</h3>
          <p className="text-gray-400 text-sm mb-4">
            从已处理的书籍中提取场景，生成训练样本。
            <br />
            需要至少 1 本已处理的书籍在 data/processed/ 目录中。
          </p>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {isGenerating ? '⏳ 生成中...' : '📊 生成训练数据'}
          </button>
        </div>

        {/* Start Training Button */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">步骤 2: 启动训练</h3>
          <p className="text-gray-400 text-sm mb-4">
            使用 LoRA 方法对 Qwen 模型进行微调。
            <br />
            推荐启用 4-bit 量化以降低显存需求（8GB+ VRAM）。
          </p>
          <button
            onClick={handleStartTraining}
            disabled={isTraining || !report || report.total_generated === 0}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {isTraining ? '⏳ 训练中...' : '🚀 启动训练'}
          </button>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">⚙️ 训练配置</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">LoRA Rank (r)</label>
            <input
              type="number"
              value={config.lora_r}
              onChange={(e) => setConfig({ ...config, lora_r: parseInt(e.target.value) || 32 })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">LoRA Alpha</label>
            <input
              type="number"
              value={config.lora_alpha}
              onChange={(e) => setConfig({ ...config, lora_alpha: parseInt(e.target.value) || 64 })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Epochs</label>
            <input
              type="number"
              value={config.epochs}
              onChange={(e) => setConfig({ ...config, epochs: parseInt(e.target.value) || 3 })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-2">Batch Size</label>
            <input
              type="number"
              value={config.batch_size}
              onChange={(e) => setConfig({ ...config, batch_size: parseInt(e.target.value) || 2 })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useQuantized}
                onChange={(e) => setUseQuantized(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded"
              />
              <span className="text-white text-sm">启用 4-bit 量化训练（推荐，降低显存需求）</span>
            </label>
          </div>
        </div>
      </div>

      {/* Logs Panel */}
      {showLogs && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">📋 训练日志</h3>
            <button
              onClick={() => setShowLogs(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="bg-black rounded p-4 h-64 overflow-y-auto font-mono text-sm">
            {logs.map((line, index) => (
              <div key={index} className="text-green-400 mb-1">
                {line}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-gray-500">暂无日志...</div>
            )}
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-yellow-400 mb-3">💡 使用提示</h3>
        <ul className="space-y-2 text-gray-300 text-sm">
          <li className="flex items-start">
            <span className="text-yellow-400 mr-2">•</span>
            <span>
              <strong>前置条件：</strong>确保已运行 <code className="bg-gray-800 px-2 py-0.5 rounded">pnpm run knowledge:process</code> 处理参考书籍
            </span>
          </li>
          <li className="flex items-start">
            <span className="text-yellow-400 mr-2">•</span>
            <span>
              <strong>硬件要求：</strong>完整精度训练需要 24GB+ VRAM，量化训练仅需 8GB+
            </span>
          </li>
          <li className="flex items-start">
            <span className="text-yellow-400 mr-2">•</span>
            <span>
              <strong>训练时间：</strong>50K 样本 × 3 epochs 约需 24-48 小时（RTX 3070）
            </span>
          </li>
          <li className="flex items-start">
            <span className="text-yellow-400 mr-2">•</span>
            <span>
              <strong>最佳实践：</strong>建议使用 10+ 本不同题材的书籍，每本至少 50 章
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
