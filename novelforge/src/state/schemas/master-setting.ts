import { z } from 'zod'

export const masterSettingSchema = z.object({
  work_id: z.string(),
  title: z.string(),
  genre: z.string(),
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
  created_at: z.string().datetime(),
  version: z.string(),
})

export type MasterSetting = z.infer<typeof masterSettingSchema>

export function createDefaultMasterSetting(overrides?: Partial<MasterSetting>): MasterSetting {
  return {
    work_id: '',
    title: '',
    genre: '玄幻修仙',
    target_audience: {
      age: '20-35',
      preference: '男频',
      reading_scenario: '睡前手机阅读',
    },
    core_premise: '',
    core_conflict: '',
    selling_point: '',
    ending_direction: '传统大圆满',
    world_rules: [],
    golden_finger: {
      type: '',
      description: '',
      limitations: [],
    },
    created_at: new Date().toISOString(),
    version: '1.0',
    ...overrides,
  }
}
