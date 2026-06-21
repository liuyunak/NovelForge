import { useState, useCallback } from 'react'
import { approveNode } from '../api/client'
import { logError } from '../utils/logger'

interface Props {
  workspaceId: string
}

interface ApprovalState {
  nodeId: 'approval1' | 'approval2'
  label: string
  description: string
  content: string
  pending: boolean
}

export default function ApprovalPanel({ workspaceId }: Props) {
  const [approvals, setApprovals] = useState<ApprovalState[]>([
    {
      nodeId: 'approval1',
      label: '大纲审批',
      description: '检查AI生成的大纲是否符合预期',
      content: '',
      pending: false,
    },
    {
      nodeId: 'approval2',
      label: '终稿审批',
      description: '检查润色后的终稿是否满意',
      content: '',
      pending: false,
    },
  ])

  const handleApprove = useCallback(async (nodeId: 'approval1' | 'approval2') => {
    setApprovals(prev => prev.map(a => a.nodeId === nodeId ? { ...a, pending: true } : a))
    try {
      await approveNode(workspaceId, nodeId)
      setApprovals(prev => prev.map(a => a.nodeId === nodeId ? { ...a, pending: false } : a))
    } catch (e) {
      logError('Approve failed', e)
      setApprovals(prev => prev.map(a => a.nodeId === nodeId ? { ...a, pending: false } : a))
    }
  }, [workspaceId])

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-white font-semibold text-lg flex items-center gap-2">
        <span>✅</span> 审批面板
      </h3>
      
      {approvals.map(approval => (
        <div key={approval.nodeId} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="text-white font-medium">{approval.label}</h4>
              <p className="text-gray-500 text-xs mt-1">{approval.description}</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs ${
              approval.pending ? 'bg-yellow-600/20 text-yellow-400' : 'bg-gray-700 text-gray-400'
            }`}>
              {approval.pending ? '审批中...' : '待审批'}
            </span>
          </div>
          
          {approval.content && (
            <div className="bg-gray-900 rounded p-3 mb-3 text-gray-300 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
              {approval.content}
            </div>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={() => handleApprove(approval.nodeId)}
              disabled={approval.pending}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-2 rounded-lg text-sm transition"
            >
              ✅ 批准通过
            </button>
            <button
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg text-sm transition"
            >
              ✏️ 修改后通过
            </button>
            <button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm transition"
            >
              ❌ 驳回重写
            </button>
          </div>
        </div>
      ))}
      
      <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
        <p className="text-gray-500 text-xs">
          💡 提示：批准后AI将继续执行后续流程。修改后可输入调整意见，AI会据此重新生成。
        </p>
      </div>
    </div>
  )
}
