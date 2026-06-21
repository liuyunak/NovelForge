import type {
  Workspace,
  WorkspaceDetail,
  ChapterPlan,
  FastAuditResult,
  AuditCheck,
  AuditWarning,
  PipelineResults,
} from '../types'
import type { FineTuneStatus, GenerationReport, FineTuneProgress } from '../types/finetune'
import { countWords } from '../utils/text'

const API_BASE = '/api'

// ==================== Request / Response Types ====================

export interface FetchWorkspacesResponse {
  workspaces: Workspace[]
}

export interface CreateWorkspaceRequest {
  title: string
  genre: string
  corePremise: string
}

export interface CreateWorkspaceResponse {
  id: string
  path: string
}

export interface WriteChapterResponse {
  success: boolean
  chapterText?: string
  chapterPlan?: ChapterPlan
  wordCount?: number
  fastAuditResult?: FastAuditResult
  duration_ms?: number
  error?: string
}

/**
 * Backend PipelineResult type (from dag-scheduler.ts)
 * Frontend receives this from the /pipeline/write endpoint.
 */
interface BackendPipelineResult {
  success: boolean
  chapterNumber: number
  results: Record<string, { nodeId: string; agent: string; status: string; output?: unknown; error?: string; duration_ms: number }>
  duration_ms: number
}

/**
 * Adapt backend PipelineResult → frontend WriteChapterResponse
 * Extracts writer/planner/audit output from the results map.
 */
function adaptPipelineResult(raw: BackendPipelineResult): WriteChapterResponse {
  const results = raw.results || {}
  const writerResult = results['writer']
  const plannerResult = results['planner']
  const fastAuditResult = results['fast_audit']

  // Extract chapterText from writer output (could be string, { text }, { content }, etc.)
  let chapterText: string | undefined
  const wOutput = writerResult?.output
  if (typeof wOutput === 'string') {
    chapterText = wOutput
  } else if (wOutput && typeof wOutput === 'object') {
    const obj = wOutput as Record<string, unknown>
    chapterText = (obj.text || obj.content || obj.chapterText) as string | undefined
  }

  return {
    success: raw.success,
    chapterText,
    chapterPlan: plannerResult?.output as ChapterPlan | undefined,
    wordCount: chapterText ? countWords(chapterText) : undefined,
    fastAuditResult: fastAuditResult?.output as FastAuditResult | undefined,
    duration_ms: raw.duration_ms,
    error: !raw.success ? (writerResult?.error || 'Pipeline execution failed') : undefined,
  }
}

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface AuditResult {
  fastAudit: {
    score: number
    passed: boolean
    checks: AuditCheck[]
    warnings: AuditWarning[]
  }
  deepAudit: {
    score: number
    issues: { dimension: string; severity: SeverityLevel; location: string; description: string; suggestion: string; auto_fixable: boolean }[]
    auto_fixes: { location: string; original: string; fixed: string; reason: string }[]
    human_decision_required: string[]
  }
}

export interface ApproveResponse {
  approved: string
  result: {
    success: boolean
    chapterNumber: number
    results: PipelineResults
    duration_ms: number
  }
}

export interface PipelineStatusResponse {
  status: string
  workspaceId?: string
}

export interface Character {
  name: string
  role: string
  items?: string[]
  power?: string
  location?: string
  mood?: string
  status?: string
}

export interface StyleFingerprintData {
  sentence_pattern?: { avg_sentence_length: number; short_sentence_ratio: number; complex_sentence_ratio: number }
  vocabulary?: { preferred_verbs: string[]; preferred_nouns: string[]; filler_word_rate: number }
  dialogue_style?: { tag_preference: string; action_with_dialogue: boolean; avg_dialogue_length: number }
  rhetoric?: { metaphor_density: number; preferred_rhetoric: string[]; sensory_preference: string[] }
  pacing?: { description_to_action_ratio: number; inner_monologue_ratio: number }
  metadata?: { source_chapters: number; extraction_date: string; confidence: number }
}

// ==================== Auth Token Management ====================

const TOKEN_KEY = 'novelforge_token'

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // localStorage unavailable (e.g., SSR)
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // noop
  }
}

export function isAuthenticated(): boolean {
  return !!getAuthToken()
}

// ==================== Base Request ====================

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  }

  // Attach JWT token if available
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    // Auto-clear expired/invalid token and redirect to login
    if (response.status === 401) {
      clearAuthToken()
      // Use setTimeout to let current render cycle finish, then redirect
      setTimeout(() => { window.location.href = '/login' }, 0)
    }
    const body = await response.json().catch(() => ({}))
    throw new Error(`API error ${response.status}: ${body.error || response.statusText}`)
  }
  return response.json()
}

// ==================== Auth APIs ====================

export interface RegisterRequest {
  username: string
  password: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthUser {
  userId: string
  username: string
  createdAt: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export function register(data: RegisterRequest): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function login(data: LoginRequest): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>(`${API_BASE}/auth/me`)
}

// ==================== Workspace APIs ====================

export function fetchWorkspaces(): Promise<FetchWorkspacesResponse> {
  return request<FetchWorkspacesResponse>(`${API_BASE}/workspace`)
}

export function createWorkspace(data: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
  return request<CreateWorkspaceResponse>(`${API_BASE}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getWorkspace(id: string): Promise<WorkspaceDetail> {
  return request<WorkspaceDetail>(`${API_BASE}/workspace/${encodeURIComponent(id)}`)
}

export function deleteWorkspace(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/workspace/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function renameWorkspace(id: string, title: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/workspace/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

// ==================== Chapter APIs ====================

export async function writeChapter(
  workspaceId: string,
  chapterNumber: number,
  options?: { mode: string; intensity: number; length: number },
): Promise<WriteChapterResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300000)

  try {
    const raw = await request<BackendPipelineResult>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/pipeline/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapter: chapterNumber,
        mode: options?.mode,
        intensity: options?.intensity,
        length: options?.length,
      }),
      signal: controller.signal,
    })
    return adaptPipelineResult(raw)
  } finally {
    clearTimeout(timeout)
  }
}

export function saveChapter(workspaceId: string, number: number, title: string, content: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/chapter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, title, content }),
  })
}

export function getChapters(workspaceId: string): Promise<{ chapters: { number: number; title: string; content: string }[] }> {
  return request<{ chapters: { number: number; title: string; content: string }[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/chapters`)
}

// ==================== Volume APIs ====================

export interface VolumeData {
  id: string
  title: string
  chapters: number[]
}

export function getVolumes(workspaceId: string): Promise<{ volumes: VolumeData[] }> {
  return request<{ volumes: VolumeData[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/volumes`)
}

export function saveVolumes(workspaceId: string, volumes: VolumeData[]): Promise<{ success: boolean; volumes: VolumeData[] }> {
  return request<{ success: boolean; volumes: VolumeData[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/volumes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ volumes }),
  })
}

// ==================== Pipeline APIs ====================

export function runAudit(workspaceId: string, chapterText: string, chapterNumber: number): Promise<AuditResult> {
  return request<AuditResult>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/pipeline/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterText, chapterNumber }),
  })
}

export function approveNode(workspaceId: string, nodeId: 'approval1' | 'approval2'): Promise<ApproveResponse> {
  return request<ApproveResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/pipeline/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  })
}

export function getPipelineStatus(workspaceId: string): Promise<PipelineStatusResponse> {
  return request<PipelineStatusResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/pipeline/status`)
}

// ==================== Character APIs ====================

export function getCharacters(workspaceId: string): Promise<{ characters: Character[] }> {
  return request<{ characters: Character[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/characters`)
}

export function updateCharacter(workspaceId: string, character: Character): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(character),
  })
}

// ==================== Style APIs ====================

export function getStyleFingerprint(workspaceId: string): Promise<StyleFingerprintData> {
  return request<StyleFingerprintData>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/style`)
}

export function extractStyle(workspaceId: string, sampleText: string): Promise<StyleFingerprintData> {
  return request<StyleFingerprintData>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/style/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleText }),
  })
}

// ==================== Export APIs ====================

export interface ExportResponse {
  url: string
  format: string
  filename: string
}

export interface BatchExportResponse {
  files: Array<{ format: string; filename: string; url: string }>
}

export interface ExportHistoryItem {
  filename: string
  format: string
  size: number
  created_at: string
  chapter_count: number
}

export interface ExportHistoryResponse {
  history: ExportHistoryItem[]
}

export interface ExportFileItem {
  filename: string
  size: number
  created: string
}

export interface ExportFilesResponse {
  files: ExportFileItem[]
}

export function exportNovel(workspaceId: string, format: 'txt' | 'docx' | 'pdf' | 'epub', options?: { includeMetadata?: boolean; chapterRange?: { start: number; end: number } }): Promise<ExportResponse> {
  return request<ExportResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, ...options }),
  })
}

export function batchExport(workspaceId: string, formats: Array<'txt' | 'docx' | 'pdf' | 'epub'>, options?: { includeMetadata?: boolean; chapterRange?: { start: number; end: number } }): Promise<BatchExportResponse> {
  return request<BatchExportResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/export/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formats, ...options }),
  })
}

export function getExportHistory(workspaceId: string): Promise<ExportHistoryResponse> {
  return request<ExportHistoryResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/export/history`)
}

export function getExportFiles(workspaceId: string): Promise<ExportFilesResponse> {
  return request<ExportFilesResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/export/files`)
}

export function deleteExportFile(workspaceId: string, filename: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/export/files/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  })
}

// ==================== Script Export Types ====================

export interface ScriptShot {
  shot_id: number
  type: 'establishing' | 'dialogue' | 'action' | 'closeup' | 'narration'
  description: string
  character?: string
  line?: string
  action?: string
  duration: number
  sfx?: string
  emotion?: string
}

export interface ScriptScene {
  scene_id: number
  location: string
  time?: string
  shots: ScriptShot[]
}

export interface ScriptOutput {
  title: string
  scenes: ScriptScene[]
  metadata?: {
    source_chapter: number
    total_scenes: number
    total_shots: number
    estimated_duration_min: number
    generated_at: string
  }
}

export interface ScriptExportResult {
  url: string
  script: ScriptOutput
}

export function exportScript(workspaceId: string, chapterNumber?: number): Promise<ScriptExportResult> {
  return request<ScriptExportResult>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/export/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterNumber: chapterNumber || 1 }),
  })
}

// ==================== Cover Generation APIs ====================

export interface CoverResult {
  success: boolean
  prompt: string
  imageUrl?: string
  localPath?: string
  url?: string
  error?: string
}

export function generateCover(workspaceId: string): Promise<CoverResult> {
  return request<CoverResult>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/cover/generate`, {
    method: 'POST',
  })
}

// ==================== Memory APIs ====================

export interface MemoryItem {
  id: string
  type: 'fact' | 'event' | 'relationship' | 'plot_point' | 'character_state'
  content: string
  sourceChapter?: number
  confidence: number
  timestamp: string
}

export interface MemoryResponse {
  memories: MemoryItem[]
  stats: { total: number; byType: Record<string, number> }
}

export function getMemory(workspaceId: string): Promise<MemoryResponse> {
  return request<MemoryResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/memory`)
}

// ==================== Dream (记忆整合) APIs ====================

export interface DreamResult {
  triggerChapter: number
  chaptersIntegrated: string
  summary: string
  timestamp: string
  conflictsDetected: number
}

export interface DreamLog {
  id: string
  triggerChapter: number
  chaptersIntegrated: string
  summary: string
  createdAt: string
}

export function triggerDream(workspaceId: string, chapterNumber?: number): Promise<DreamResult> {
  return request<DreamResult>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/dream/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterNumber }),
  })
}

export function getDreamHistory(workspaceId: string): Promise<{ logs: DreamLog[] }> {
  return request<{ logs: DreamLog[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/dream/history`)
}

export function getDreamSummary(workspaceId: string): Promise<{ summary: string }> {
  return request<{ summary: string }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/dream/summary`)
}

export function getLastDream(workspaceId: string): Promise<{ result: DreamResult | null }> {
  return request<{ result: DreamResult | null }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/dream/last`)
}

// ==================== Outline APIs ====================

export interface OutlineItem {
  id: string
  title: string
  chapterNumber: number
  summary: string
  status: 'planned' | 'writing' | 'completed' | 'revised'
  beats?: string[]
}

export function getOutlines(workspaceId: string): Promise<{ outlines: OutlineItem[] }> {
  return request<{ outlines: OutlineItem[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/outline`)
}

export function saveOutlines(workspaceId: string, outlines: OutlineItem[]): Promise<{ success: boolean; outlines: OutlineItem[] }> {
  return request<{ success: boolean; outlines: OutlineItem[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/outline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outlines }),
  })
}

// ==================== Worldview APIs ====================

export interface WorldviewEntry {
  name: string
  category: 'geography' | 'organization' | 'power_system' | 'history' | 'culture' | 'other'
  description: string
  relatedCharacters?: string[]
}

export function getWorldview(workspaceId: string): Promise<{ entries: WorldviewEntry[] }> {
  return request<{ entries: WorldviewEntry[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/worldview`)
}

export function saveWorldviewEntry(workspaceId: string, entry: WorldviewEntry): Promise<{ success: boolean; entry: WorldviewEntry }> {
  return request<{ success: boolean; entry: WorldviewEntry }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/worldview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
}

// ==================== Plot (伏笔看板) APIs ====================

export interface PlotHook {
  id: string
  content: string
  type: 'setup' | 'payoff' | 'cliffhanger'
  setup_chapter: number
  expected_payoff_chapter?: number
  actual_payoff_chapter?: number
  status: 'active' | 'overdue' | 'resolved'
  strength: number
}

export interface Subplot {
  id: string
  name: string
  description: string
  progress: number
  milestones: { chapter: number; event: string; completed: boolean }[]
  status: 'active' | 'paused' | 'resolved'
}

export interface PlotThreadsResponse {
  hooks: PlotHook[]
  subplots: Subplot[]
  reading_debt: { current: number; target: number; trend: 'increasing' | 'stable' | 'decreasing' }
  last_updated: string
}

export function getPlots(workspaceId: string): Promise<PlotThreadsResponse> {
  return request<PlotThreadsResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/plots`)
}

export function createHook(workspaceId: string, data: {
  content: string
  type: 'setup' | 'payoff' | 'cliffhanger'
  setup_chapter: number
  expected_payoff_chapter?: number
  strength?: number
}): Promise<{ success: boolean; hook: PlotHook }> {
  return request<{ success: boolean; hook: PlotHook }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/plots/hooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateHook(workspaceId: string, data: {
  id: string
  status?: 'active' | 'overdue' | 'resolved'
  actual_payoff_chapter?: number
  content?: string
  strength?: number
}): Promise<{ success: boolean; hook: PlotHook }> {
  return request<{ success: boolean; hook: PlotHook }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/plots/hooks`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteHook(workspaceId: string, hookId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/plots/hooks/${encodeURIComponent(hookId)}`, {
    method: 'DELETE',
  })
}

export function scanHooks(workspaceId: string): Promise<{ discovered: number; hooks: PlotHook[] }> {
  return request<{ discovered: number; hooks: PlotHook[] }>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/plots/scan`, {
    method: 'POST',
  })
}

// ==================== Rhythm (节奏曲线) APIs ====================

export interface ChapterRhythm {
  chapter_number: number
  hook_strength: number
  cool_points: { type: string; intensity: number; paragraph: number }[]
  micro_payoffs: number
  emotional_curve: number[]
  pace_alerts: string[]
  reading_debt_snapshot: number
  chapter_title?: string
}

export interface RhythmAnalysis {
  avgHookStrength: number
  coolPointDensity: number
  debtTrend: 'increasing' | 'stable' | 'decreasing'
  alerts: string[]
}

export interface RhythmCurveResponse {
  chapters: ChapterRhythm[]
  overall_metrics: {
    avg_hook_strength: number
    avg_cool_point_density: number
    total_payoffs: number
    debt_trend: 'increasing' | 'stable' | 'decreasing'
  }
  last_updated: string
}

export function getRhythmAnalysis(workspaceId: string): Promise<RhythmAnalysis> {
  return request<RhythmAnalysis>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/rhythm`)
}

export function getRhythmCurve(workspaceId: string): Promise<RhythmCurveResponse> {
  return request<RhythmCurveResponse>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/rhythm/chapters`)
}

export function analyzeChapterRhythm(workspaceId: string, chapterNumber: number, chapterText: string): Promise<ChapterRhythm> {
  return request<ChapterRhythm>(`${API_BASE}/workspace/${encodeURIComponent(workspaceId)}/rhythm/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterNumber, chapterText }),
  })
}

// ==================== Fine-tune Management APIs ====================

export interface FineTuneCheckResponse {
  status: FineTuneStatus
  progress: FineTuneProgress
  report: GenerationReport | null
}

export function checkFineTuneStatus(): Promise<FineTuneCheckResponse> {
  return request<FineTuneCheckResponse>('/api/finetune/status')
}

export function generateFineTuneData(options?: { maxSamples?: number }): Promise<GenerationReport> {
  return request<GenerationReport>('/api/finetune/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  })
}

export function startFineTuneTraining(config: {
  baseModel?: string
  loraRank?: number
  loraAlpha?: number
  epochs?: number
  batchSize?: number
  quantized?: boolean
}): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('/api/finetune/train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

export function getFineTuneLogs(): Promise<{ lines: string[]; status: string }> {
  return request<{ lines: string[]; status: string }>('/api/finetune/logs')
}

// ==================== AI Config APIs (Multi-Provider) ====================

export interface AiProvider {
  id: string
  name: string
  type: 'openai-compatible'
  baseUrl: string
  apiKey?: string
  models: string[]
  enabled: boolean
  isLocal: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentRoutingEntry {
  agent: string
  providerId: string
  model: string
  fallbackProviderId?: string
  fallbackModel?: string
  temperature: number
  maxTokens: number
  cacheEnabled?: boolean
}

export interface TestProviderResult {
  ok: boolean
  models: string[]
  error?: string
}

/** List all AI providers */
export function fetchProviders(): Promise<{ providers: AiProvider[] }> {
  return request<{ providers: AiProvider[] }>(`${API_BASE}/config/providers`)
}

/** Add a new AI provider */
export function addProvider(data: Omit<AiProvider, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ provider: AiProvider }> {
  return request<{ provider: AiProvider }>(`${API_BASE}/config/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

/** Update an AI provider */
export function updateProvider(id: string, patch: Partial<AiProvider>): Promise<{ provider: AiProvider }> {
  return request<{ provider: AiProvider }>(`${API_BASE}/config/providers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

/** Delete an AI provider */
export function deleteProvider(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`${API_BASE}/config/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** Test provider connectivity (by providing connection details) */
export function testProvider(baseUrl: string, apiKey?: string): Promise<TestProviderResult> {
  return request<TestProviderResult>(`${API_BASE}/config/providers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey }),
  })
}

/** Test a saved provider by id */
export function testProviderById(id: string): Promise<TestProviderResult> {
  return request<TestProviderResult>(`${API_BASE}/config/providers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  })
}

/** Get agent routing config */
export function fetchAgentRouting(): Promise<{ agentRouting: AgentRoutingEntry[] }> {
  return request<{ agentRouting: AgentRoutingEntry[] }>(`${API_BASE}/config/agent-routing`)
}

/** Update agent routing (bulk) */
export function updateAgentRouting(entries: AgentRoutingEntry[]): Promise<{ agentRouting: AgentRoutingEntry[] }> {
  return request<{ agentRouting: AgentRoutingEntry[] }>(`${API_BASE}/config/agent-routing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentRouting: entries }),
  })
}

/** Get embedding provider config */
export function fetchEmbeddingConfig(): Promise<{ embedding: { providerId: string; model: string } | null }> {
  return request<{ embedding: { providerId: string; model: string } | null }>(`${API_BASE}/config/embedding`)
}

/** Set embedding provider config */
export function setEmbeddingConfig(providerId: string, model: string): Promise<{ embedding: { providerId: string; model: string } | null }> {
  return request<{ embedding: { providerId: string; model: string } | null }>(`${API_BASE}/config/embedding`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, model }),
  })
}
