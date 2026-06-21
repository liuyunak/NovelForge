// NovelForge v3.5 Type Definitions

// ==================== Agent Types ====================

export type AgentType = 
  | 'planner' 
  | 'composer' 
  | 'pre-audit'
  | 'context-prep'
  | 'writer' 
  | 'fast-audit' 
  | 'deep-audit' 
  | 'analyst' 
  | 'polisher' 
  | 'memory-update'
  | 'reviewer'
  | 'style-extractor'
  | 'cover-generator'
  | 'script-exporter'
  | 'human-approval'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'waiting_approval'

export interface AgentResult {
  agent: AgentType
  status: AgentStatus
  output?: unknown
  error?: string
  duration_ms: number
}

// ==================== Pipeline Types ====================

export type PipelineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

export type ApprovalNode = 'outline' | 'post_audit' | 'final'

export interface PipelineState {
  chapter_number: number
  status: PipelineStatus
  current_agent: AgentType | null
  approval_required: ApprovalNode | null
  results: AgentResult[]
}

// ==================== State Types (14 Models) ====================

export interface MasterSetting {
  work_id: string
  title: string
  genre: string
  target_audience: {
    age: string
    preference: string
    reading_scenario: string
  }
  core_premise: string
  core_conflict: string
  selling_point: string
  ending_direction: string
  world_rules: string[]
  golden_finger: {
    type: string
    description: string
    limitations: string[]
  }
  created_at: string
  version: string
}

export interface WorkingMemory {
  chapter_number: number
  summary: string
  character_states: Record<string, CharacterState>
  hot_hooks: Hook[]
  recent_events: string[]
  dream_summary?: string
  updated_at: string
}

export interface CharacterState {
  power?: string
  location?: string
  items?: string[]
  mood?: string
  status?: string
}

export interface Hook {
  content: string
  setup_chapter: number
  expected_payoff: number
  type?: string
}

// ==================== Audit Types ====================

export interface FastAuditResult {
  score: number
  passed: boolean
  checks: AuditCheck[]
  warnings: AuditWarning[]
}

export interface AuditCheck {
  id: number
  name: string
  passed: boolean
  score: number
  details?: string[]
}

export interface AuditWarning {
  type: string
  severity: 'low' | 'medium' | 'high'
  message: string
}

export interface DeepAuditResult {
  score: number
  issues: AuditIssue[]
  auto_fixes: AutoFix[]
  human_decision_required: string[]
  parse_error?: boolean
}

export interface AuditIssue {
  dimension: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  location: string
  description: string
  suggestion: string
  auto_fixable: boolean
}

export interface AutoFix {
  location: string
  original: string
  fixed: string
  reason: string
}

// ==================== Knowledge Types ====================

export interface WritingRule {
  id: string
  category: string
  rule: string
  weight: number
  confidence: number
  source: 'builtin' | 'learned' | 'author'
  genre_overrides?: Record<string, number>
  audit_dimension: number
}

export interface StyleFingerprint {
  sentence_pattern: {
    avg_sentence_length: number
    short_sentence_ratio: number
    complex_sentence_ratio: number
  }
  vocabulary: {
    preferred_verbs: string[]
    preferred_nouns: string[]
    filler_word_rate: number
  }
  dialogue_style: {
    tag_preference: '道' | '说' | 'none'
    action_with_dialogue: boolean
    avg_dialogue_length: number
  }
  rhetoric: {
    metaphor_density: number
    preferred_rhetoric: string[]
    sensory_preference: string[]
  }
  pacing: {
    description_to_action_ratio: number
    inner_monologue_ratio: number
  }
  metadata?: {
    source_chapters: number
    extraction_date: string
    confidence: number
  }
}

// ==================== Memory Types ====================

export interface MemoryEntry {
  id: string
  content: string
  category: 'character' | 'world' | 'plot' | 'style' | 'lesson'
  source_chapter: number
  importance: number
  embedding?: Buffer
}

export interface FullTextChapter {
  chapter_number: number
  title: string
  full_text: string
  summary: string
  compressed: boolean
  dream_summary?: string
}
