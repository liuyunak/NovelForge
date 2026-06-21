import type { AgentType } from '../types/index.js'

export type { AgentType }

export interface DAGNode {
  id: string
  agent: AgentType
  dependencies: string[]
  parallel?: boolean
  approvalRequired?: boolean
  timeout?: number
}

export interface DAGDefinition {
  nodes: DAGNode[]
  edges: [string, string][]
}

export const NOVELFORGE_DAG: DAGDefinition = {
  nodes: [
    { id: 'planner', agent: 'planner', dependencies: [], timeout: 30000 },
    { id: 'styleextractor', agent: 'style-extractor', dependencies: ['planner'], parallel: true },
    { id: 'composer', agent: 'composer', dependencies: ['planner'], parallel: true },
    { id: 'preaudit', agent: 'pre-audit', dependencies: ['planner'], parallel: true },
    { id: 'contextprep', agent: 'context-prep', dependencies: ['planner'], parallel: true },
    { id: 'writer', agent: 'writer', dependencies: ['styleextractor', 'composer', 'preaudit', 'contextprep'], timeout: 60000 },
    { id: 'fastaudit', agent: 'fast-audit', dependencies: ['writer'], timeout: 5000 },
    { id: 'deepaudit', agent: 'deep-audit', dependencies: ['fastaudit'], timeout: 30000 },
    { id: 'approval1', agent: 'human-approval', dependencies: ['deepaudit'], approvalRequired: true },
    { id: 'analyst', agent: 'analyst', dependencies: ['approval1'], timeout: 10000 },
    { id: 'polisher', agent: 'polisher', dependencies: ['analyst'], timeout: 10000 },
    { id: 'reviewer', agent: 'reviewer', dependencies: ['polisher'], timeout: 30000 },
    { id: 'memoryupdate', agent: 'memory-update', dependencies: ['reviewer'], timeout: 5000 },
    { id: 'approval2', agent: 'human-approval', dependencies: ['memoryupdate'], approvalRequired: true },
  ],
  edges: [
    ['planner', 'styleextractor'],
    ['planner', 'composer'],
    ['planner', 'preaudit'],
    ['planner', 'contextprep'],
    ['styleextractor', 'writer'],
    ['composer', 'writer'],
    ['preaudit', 'writer'],
    ['contextprep', 'writer'],
    ['writer', 'fastaudit'],
    ['fastaudit', 'deepaudit'],
    ['deepaudit', 'approval1'],
    ['approval1', 'analyst'],
    ['analyst', 'polisher'],
    ['polisher', 'reviewer'],
    ['reviewer', 'memoryupdate'],
    ['memoryupdate', 'approval2'],
  ],
}
