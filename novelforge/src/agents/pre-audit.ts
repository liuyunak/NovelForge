import { StateManager } from '../state/manager.js'
import type { ChapterPlan } from './planner.js'

export interface PreAuditResult {
  passed: boolean
  warnings: string[]
  blockers: string[]
}

export class PreAuditAgent {
  private stateManager: StateManager

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }

  async audit(chapterPlan: ChapterPlan): Promise<PreAuditResult> {
    const warnings: string[] = []
    const blockers: string[] = []

    await this.checkCharacters(chapterPlan, warnings, blockers)
    await this.checkWorldConsistency(chapterPlan, warnings, blockers)

    return {
      passed: blockers.length === 0,
      warnings,
      blockers,
    }
  }

  private async checkCharacters(plan: ChapterPlan, warnings: string[], blockers: string[]): Promise<void> {
    try {
      const characters = await this.stateManager.read('characters')
      const characterNames = characters.characters.map((c: any) => c.name)

      for (const char of plan.characters_in) {
        if (!characterNames.includes(char)) {
          warnings.push(`Character "${char}" not found in character database`)
        }
      }
    } catch {
      warnings.push('Could not load character database')
    }
  }

  private async checkWorldConsistency(plan: ChapterPlan, warnings: string[], blockers: string[]): Promise<void> {
    try {
      const masterSetting = await this.stateManager.read('MASTER_SETTING')
      
      for (const scene of plan.scenes) {
        if (!scene.location) {
          warnings.push(`Scene ${scene.scene_number} has no location specified`)
        }
      }
    } catch {
      warnings.push('Could not load master setting')
    }
  }
}
