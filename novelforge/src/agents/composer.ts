import { ContextAssembler, type WriterContext, type DeepAuditContext, type PolisherContext } from '../core/context.js'
import { WriterRulesManager } from '../knowledge/writer-rules.js'
import { StateManager } from '../state/manager.js'
import type { ChapterPlan } from './planner.js'

export interface ComposerOutput {
  writerContext: WriterContext
  deepAuditContext?: DeepAuditContext
  polisherContext?: PolisherContext
}

export class ComposerAgent {
  private contextAssembler: ContextAssembler
  private rulesManager: WriterRulesManager
  private stateManager: StateManager

  constructor(contextAssembler: ContextAssembler, stateManager?: StateManager) {
    this.contextAssembler = contextAssembler
    this.rulesManager = new WriterRulesManager()
    this.stateManager = stateManager || new StateManager('')
  }

  async compose(chapterPlan: ChapterPlan, chapterText?: string): Promise<ComposerOutput> {
    const writerContext = await this.contextAssembler.assembleWriterContext(chapterPlan)
    
    // Read genre from state instead of hardcoding
    let genre = '玄幻'
    try {
      const masterSetting = await this.stateManager.read('MASTER_SETTING')
      genre = masterSetting.genre || '玄幻'
    } catch {
      // Use default
    }
    
    const activeRules = this.rulesManager.getActiveRules(genre)
    writerContext.workingMemory.active_rules = activeRules
    
    const output: ComposerOutput = {
      writerContext,
    }
    
    if (chapterText) {
      output.deepAuditContext = await this.contextAssembler.assembleDeepAuditContext(chapterText)
      output.polisherContext = await this.contextAssembler.assemblePolisherContext(chapterText)
    }
    
    return output
  }
}
