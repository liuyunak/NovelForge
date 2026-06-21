import { NOVELFORGE_DAG, type DAGDefinition, type DAGNode } from './dag.js'
import type { AgentType } from '../types/index.js'

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval'

export interface NodeResult {
  nodeId: string
  agent: AgentType
  status: NodeStatus
  output?: any
  error?: string
  duration_ms: number
}

export type ProgressCallback = (nodeId: string, status: NodeStatus, result?: NodeResult) => void

export class DAGExecutor {
  private dag: DAGDefinition
  private nodeResults: Map<string, NodeResult> = new Map()
  private runningNodes: Set<string> = new Set()
  private completedNodes: Set<string> = new Set()
  private waitingApproval: Set<string> = new Set()
  private agentHandlers: Map<AgentType, (inputs: any) => Promise<any>> = new Map()
  private progressCallback?: ProgressCallback
  private completionResolvers: (() => void)[] = []

  constructor(dag: DAGDefinition = NOVELFORGE_DAG) {
    this.dag = dag
  }

  registerAgent(agent: AgentType, handler: (inputs: any) => Promise<any>): void {
    this.agentHandlers.set(agent, handler)
  }

  onProgress(callback: ProgressCallback): void {
    this.progressCallback = callback
  }

  async execute(): Promise<Map<string, NodeResult>> {
    // Start the scheduling loop and wait for completion
    this.scheduleReadyNodes()
    await this.waitForCompletion()
    return this.nodeResults
  }

  async resume(): Promise<Map<string, NodeResult>> {
    this.scheduleReadyNodes()
    await this.waitForCompletion()
    return this.nodeResults
  }

  /**
   * Scheduling loop: repeatedly finds ready nodes and executes them in parallel.
   * Called initially and after each node completes, until all nodes are processed.
   */
  private scheduleReadyNodes(): void {
    const ready = this.getReadyNodes()
    if (ready.length === 0) {
      // No more ready nodes — check if everything is done
      this.checkAndResolve()
      return
    }

    // Execute all ready nodes in parallel
    for (const node of ready) {
      this.executeNode(node).then(() => {
        // After a node completes, try scheduling more nodes
        this.scheduleReadyNodes()
      })
    }
  }

  private waitForCompletion(): Promise<void> {
    return new Promise(resolve => {
      this.completionResolvers.push(resolve)
      this.checkAndResolve()
    })
  }

  private checkAndResolve(): void {
    // If all nodes are done, resolve all pending promises
    if (this.allNodesDone()) {
      const resolvers = this.completionResolvers
      this.completionResolvers = []
      resolvers.forEach(resolve => resolve())
    }
  }

  private allNodesDone(): boolean {
    return this.dag.nodes.every(node => 
      this.completedNodes.has(node.id) || 
      this.waitingApproval.has(node.id) ||
      this.nodeResults.get(node.id)?.status === 'failed'
    )
  }

  approveNode(nodeId: string): void {
    if (this.waitingApproval.has(nodeId)) {
      this.waitingApproval.delete(nodeId)
      this.completedNodes.add(nodeId)
      
      const result = this.nodeResults.get(nodeId)
      if (result) {
        result.status = 'completed'
        this.progressCallback?.(nodeId, 'completed', result)
      }
      
      this.checkAndResolve()
    }
  }

  private getReadyNodes(): DAGNode[] {
    return this.dag.nodes.filter(node => {
      if (this.completedNodes.has(node.id) || this.runningNodes.has(node.id) || this.waitingApproval.has(node.id)) {
        return false
      }
      
      return node.dependencies.every(dep => this.completedNodes.has(dep))
    })
  }

  private async executeNode(node: DAGNode): Promise<void> {
    this.runningNodes.add(node.id)
    this.progressCallback?.(node.id, 'running')
    
    const startTime = Date.now()
    
    try {
      // Human approval nodes: skip execution, go directly to waiting_approval
      if (node.agent === 'human-approval' || node.approvalRequired) {
        const result: NodeResult = {
          nodeId: node.id,
          agent: node.agent,
          status: 'waiting_approval',
          output: { message: 'Waiting for human approval' },
          duration_ms: Date.now() - startTime,
        }
        
        this.nodeResults.set(node.id, result)
        this.runningNodes.delete(node.id)
        this.waitingApproval.add(node.id)
        this.progressCallback?.(node.id, 'waiting_approval', result)
        this.checkAndResolve() // Event-driven: notify waiting state
        return
      }
      
      const inputs = this.getInputsForNode(node)
      const handler = this.agentHandlers.get(node.agent)
      
      let output: any
      if (handler) {
        output = await handler(inputs)
      } else {
        output = { message: `Agent ${node.agent} executed (no handler registered)` }
      }
      
      const result: NodeResult = {
        nodeId: node.id,
        agent: node.agent,
        status: 'completed',
        output,
        duration_ms: Date.now() - startTime,
      }
      
      this.nodeResults.set(node.id, result)
      this.runningNodes.delete(node.id)
      this.completedNodes.add(node.id)
      this.progressCallback?.(node.id, 'completed', result)
      this.checkAndResolve()
    } catch (error) {
      const result: NodeResult = {
        nodeId: node.id,
        agent: node.agent,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      }
      
      this.nodeResults.set(node.id, result)
      this.runningNodes.delete(node.id)
      this.progressCallback?.(node.id, 'failed', result)
      this.checkAndResolve()
    }
  }

  private getInputsForNode(node: DAGNode): any {
    const inputs: any = {}
    for (const dep of node.dependencies) {
      const depResult = this.nodeResults.get(dep)
      if (depResult) {
        inputs[dep] = depResult.output
      }
    }
    return inputs
  }

  private allCompleted(): boolean {
    return this.dag.nodes.every(node => 
      this.completedNodes.has(node.id) || 
      this.waitingApproval.has(node.id) ||
      this.nodeResults.get(node.id)?.status === 'failed'
    )
  }

  /**
   * Check if pipeline is paused waiting for human approval.
   */
  isWaitingApproval(): boolean {
    return this.waitingApproval.size > 0
  }

  getWaitingApprovalNodes(): string[] {
    return Array.from(this.waitingApproval)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getResults(): Map<string, NodeResult> {
    return this.nodeResults
  }

  reset(): void {
    this.nodeResults.clear()
    this.runningNodes.clear()
    this.completedNodes.clear()
    this.waitingApproval.clear()
  }
}
