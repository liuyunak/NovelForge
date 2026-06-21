/**
 * Shared types for NovelForge Studio.
 * All components should import types from here to avoid duplication.
 */

// ==================== Workspace ====================

export interface Workspace {
  id: string
  title: string
  genre: string
}

export interface WorkspaceDetail {
  id: string
  title: string
  genre: string
  core_premise?: string
  chapters?: Chapter[]
  [key: string]: unknown
}

// ==================== Volume ====================

export interface Volume {
  id: string
  title: string
  chapters: number[]
}

// ==================== Chapter ====================

export interface Chapter {
  number: number
  title: string
  content: string
  volumeId?: string
}

// ==================== Pipeline ====================

export interface ChapterPlan {
  outline?: string
  beats?: string[]
  hooks?: string[]
}

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
  severity: string
  message: string
}

export interface PipelineResults {
  chapterNumber: number
  wordCount: number
  duration_ms: number
  [key: string]: unknown
}

// ==================== Page navigation ====================

export type PageKey =
  | '工作台'
  | '项目管理'
  | '写作编辑器'
  | '大纲规划'
  | '人物设定'
  | '世界观设定'
  | '记忆系统'
  | 'AI写作控制台'
  | '审计记录'
  | '数据统计'
  | '设置中心'
  | '智能体编辑器'
  | '伏笔看板'
  | '节奏曲线'
  | '导出面板'
  | '封面生成'
  | '短剧导出'
  | 'Dream记忆'
  | '微调管理'
