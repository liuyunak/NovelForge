// Schema exports
export * from './master-setting.js'
export * from './working-memory.js'
export * from './current-state.js'
export * from './characters.js'
export * from './plot-threads.js'
export * from './particle-ledger.js'
export * from './chapter-summaries.js'
export * from './rhythm-map.js'
export * from './power-system.js'
export * from './volumes.js'
export * from './outline.js'
export * from './worldview.js'
export * from './learned-rules.js'
export * from './fingerprint-blacklist.js'
export * from './book-config.js'
export * from './global-config.js'
export * from './style-fingerprint.js'
export * from './graph.js'

// Schema registry for dynamic access
import { masterSettingSchema } from './master-setting.js'
import { workingMemorySchema } from './working-memory.js'
import { currentStateSchema } from './current-state.js'
import { charactersSchema } from './characters.js'
import { plotThreadsSchema } from './plot-threads.js'
import { particleLedgerSchema } from './particle-ledger.js'
import { chapterSummariesSchema } from './chapter-summaries.js'
import { rhythmMapSchema } from './rhythm-map.js'
import { powerSystemSchema } from './power-system.js'
import { volumesSchema } from './volumes.js'
import { outlineSchema } from './outline.js'
import { worldviewSchema } from './worldview.js'
import { learnedRulesSchema } from './learned-rules.js'
import { aiFingerprintBlacklistSchema } from './fingerprint-blacklist.js'
import { bookConfigSchema } from './book-config.js'
import { globalConfigSchema } from './global-config.js'
import { styleFingerprintSchema } from './style-fingerprint.js'
import { relationshipGraphSchema } from './graph.js'

export const schemaRegistry = {
  'MASTER_SETTING': masterSettingSchema,
  'working_memory': workingMemorySchema,
  'current_state': currentStateSchema,
  'characters': charactersSchema,
  'plot_threads': plotThreadsSchema,
  'particle_ledger': particleLedgerSchema,
  'chapter_summaries': chapterSummariesSchema,
  'rhythm_map': rhythmMapSchema,
  'power_system': powerSystemSchema,
  'volumes': volumesSchema,
  'outline': outlineSchema,
  'worldview': worldviewSchema,
  'learned_rules': learnedRulesSchema,
  'ai_fingerprint_blacklist': aiFingerprintBlacklistSchema,
  'book_config': bookConfigSchema,
  'global_config': globalConfigSchema,
  'style_fingerprint': styleFingerprintSchema,
  'relationship_graph': relationshipGraphSchema,
} as const

export type SchemaKey = keyof typeof schemaRegistry
