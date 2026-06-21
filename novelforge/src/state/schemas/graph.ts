import { z } from 'zod'

const NODE_TYPES = ['character', 'location', 'item', 'concept', 'event', 'organization'] as const

export const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'Node label is required'),
  type: z.enum(NODE_TYPES),
  group: z.number().int().min(0),
  description: z.string().optional(),
  properties: z.record(z.any()).optional(),
})

export const graphLinkSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
  type: z.string().min(1, 'Link type is required'),
  strength: z.number().min(0).max(1).optional(),
  description: z.string().optional(),
  properties: z.record(z.any()).optional(),
})

export const graphMetadataSchema = z.object({
  totalNodes: z.number().int().min(0),
  totalLinks: z.number().int().min(0),
  lastUpdated: z.string(),
  workspaceId: z.string(),
})

export const relationshipGraphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  links: z.array(graphLinkSchema),
  metadata: graphMetadataSchema.optional(),
})

export type GraphNode = z.infer<typeof graphNodeSchema>
export type GraphLink = z.infer<typeof graphLinkSchema>
export type GraphMetadata = z.infer<typeof graphMetadataSchema>
export type RelationshipGraph = z.infer<typeof relationshipGraphSchema>
