import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Unit tests for schema validation patterns

describe('MasterSetting Schema validation', () => {
  const masterSettingSchema = z.object({
    work_id: z.string().min(1),
    title: z.string().min(1).max(200),
    genre: z.string().max(100),
    target_audience: z.object({
      age: z.string(),
      preference: z.string(),
      reading_scenario: z.string(),
    }),
    core_premise: z.string(),
    core_conflict: z.string(),
    selling_point: z.string(),
    ending_direction: z.string(),
    world_rules: z.array(z.string()),
    golden_finger: z.object({
      type: z.string(),
      description: z.string(),
      limitations: z.array(z.string()),
    }),
    created_at: z.string(),
    version: z.string(),
  })

  it('should validate a valid master setting', () => {
    const setting = {
      work_id: 'novel_001',
      title: '星辰变',
      genre: '玄幻修仙',
      target_audience: { age: '18-35', preference: '热血升级', reading_scenario: '手机阅读' },
      core_premise: '一个少年从废柴到强者的成长之路',
      core_conflict: '人与天的对抗',
      selling_point: '热血升级+情感纠葛',
      ending_direction: '主角成为最强',
      world_rules: ['灵力体系', '等级分明'],
      golden_finger: { type: '系统', description: '签到系统', limitations: ['每日一次'] },
      created_at: '2026-06-15',
      version: '1.0',
    }
    const result = masterSettingSchema.safeParse(setting)
    expect(result.success).toBe(true)
  })

  it('should reject missing title', () => {
    const setting = {
      work_id: 'novel_001',
      title: '',
      genre: '玄幻',
      target_audience: { age: '18', preference: '热血', reading_scenario: '手机' },
      core_premise: 'test',
      core_conflict: 'test',
      selling_point: 'test',
      ending_direction: 'test',
      world_rules: [],
      golden_finger: { type: 'none', description: '', limitations: [] },
      created_at: '2026-01-01',
      version: '1.0',
    }
    const result = masterSettingSchema.safeParse(setting)
    expect(result.success).toBe(false)
  })
})

describe('DeepAudit result validation', () => {
  const auditIssueSchema = z.object({
    dimension: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    location: z.string(),
    description: z.string(),
    suggestion: z.string(),
    auto_fixable: z.boolean(),
  })

  const deepAuditResultSchema = z.object({
    score: z.number().min(0).max(100),
    issues: z.array(auditIssueSchema),
    auto_fixes: z.array(z.object({
      location: z.string(),
      original: z.string(),
      fixed: z.string(),
      reason: z.string(),
    })),
    human_decision_required: z.array(z.string()),
  })

  it('should validate a correct audit result', () => {
    const result = {
      score: 85,
      issues: [
        {
          dimension: '角色动机合理性',
          severity: 'medium' as const,
          location: '第3段',
          description: '角色行为与之前设定不符',
          suggestion: '增加过渡段落',
          auto_fixable: false,
        },
      ],
      auto_fixes: [],
      human_decision_required: ['需要确认角色动机'],
    }
    const validation = deepAuditResultSchema.safeParse(result)
    expect(validation.success).toBe(true)
  })

  it('should reject invalid severity', () => {
    const result = {
      score: 85,
      issues: [
        {
          dimension: '测试',
          severity: 'extreme',
          location: '某处',
          description: '问题',
          suggestion: '建议',
          auto_fixable: false,
        },
      ],
      auto_fixes: [],
      human_decision_required: [],
    }
    const validation = deepAuditResultSchema.safeParse(result)
    expect(validation.success).toBe(false)
  })

  it('should reject score out of range', () => {
    const result = {
      score: 150,
      issues: [],
      auto_fixes: [],
      human_decision_required: [],
    }
    const validation = deepAuditResultSchema.safeParse(result)
    expect(validation.success).toBe(false)
  })
})

describe('Pipeline write request validation', () => {
  const writeSchema = z.object({
    chapter: z.number().int().min(1).optional().default(1),
  })

  it('should accept valid chapter number', () => {
    expect(writeSchema.safeParse({ chapter: 5 }).success).toBe(true)
  })

  it('should default to 1 when omitted', () => {
    const result = writeSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.chapter).toBe(1)
    }
  })

  it('should reject negative chapter', () => {
    expect(writeSchema.safeParse({ chapter: -1 }).success).toBe(false)
  })

  it('should reject zero chapter', () => {
    expect(writeSchema.safeParse({ chapter: 0 }).success).toBe(false)
  })
})

describe('Approve request validation', () => {
  const approveSchema = z.object({
    nodeId: z.enum(['approval1', 'approval2']),
  })

  it('should accept approval1', () => {
    expect(approveSchema.safeParse({ nodeId: 'approval1' }).success).toBe(true)
  })

  it('should accept approval2', () => {
    expect(approveSchema.safeParse({ nodeId: 'approval2' }).success).toBe(true)
  })

  it('should reject invalid nodeId', () => {
    expect(approveSchema.safeParse({ nodeId: 'approval3' }).success).toBe(false)
  })
})
