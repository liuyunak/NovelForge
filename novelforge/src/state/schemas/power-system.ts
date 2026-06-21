import { z } from 'zod'

export const realmSchema = z.object({
  name: z.string(),
  level: z.number(),
  description: z.string(),
  breakthrough_requirements: z.array(z.string()),
  abilities: z.array(z.string()),
})

export const combatRuleSchema = z.object({
  id: z.string(),
  rule: z.string(),
  description: z.string(),
  exceptions: z.array(z.string()),
})

export const characterCombatSchema = z.object({
  character_name: z.string(),
  current_realm: z.string(),
  realm_level: z.number(),
  abilities: z.array(z.string()),
  combat_experience: z.number(),
  last_breakdown_chapter: z.number().optional(),
})

export const powerSystemSchema = z.object({
  realm_hierarchy: z.array(realmSchema),
  combat_rules: z.array(combatRuleSchema),
  character_combat: z.array(characterCombatSchema),
  beyond_level_rules: z.array(z.string()),
  last_updated: z.string().datetime(),
})

export type PowerSystem = z.infer<typeof powerSystemSchema>
export type Realm = z.infer<typeof realmSchema>
export type CombatRule = z.infer<typeof combatRuleSchema>
export type CharacterCombat = z.infer<typeof characterCombatSchema>

export function createDefaultPowerSystem(): PowerSystem {
  return {
    realm_hierarchy: [],
    combat_rules: [],
    character_combat: [],
    beyond_level_rules: [],
    last_updated: new Date().toISOString(),
  }
}
