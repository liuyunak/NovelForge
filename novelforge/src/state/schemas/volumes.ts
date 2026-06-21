import { z } from 'zod'

export const volumeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  chapters: z.array(z.number()),
})

export const volumesSchema = z.object({
  volumes: z.array(volumeItemSchema),
  last_updated: z.string().datetime().optional(),
})

export type VolumeItem = z.infer<typeof volumeItemSchema>
export type Volumes = z.infer<typeof volumesSchema>

export function createDefaultVolumes(): Volumes {
  return {
    volumes: [],
  }
}
