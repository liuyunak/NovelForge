import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../logger.js'

export interface GenreTemplate {
  name: string
  description: string
  world_rules: string[]
  realm_hierarchy?: { name: string; level: number; description: string }[]
  satisfaction_points: string[]
  typical_arcs: string[]
  writing_tips: string[]
}

export class TemplateManager {
  private templatesPath: string
  private templates: Map<string, GenreTemplate> = new Map()

  constructor(templatesPath: string) {
    this.templatesPath = templatesPath
    this.loadTemplates()
  }

  private loadTemplates(): void {
    if (!fs.existsSync(this.templatesPath)) {
      logger.warn('Templates directory not found: %s', this.templatesPath)
      return
    }

    const files = fs.readdirSync(this.templatesPath).filter(f => f.endsWith('.json'))
    
    for (const file of files) {
      const filePath = path.join(this.templatesPath, file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const template: GenreTemplate = JSON.parse(content)
        this.templates.set(template.name, template)
      } catch (err) {
        logger.warn({ err, file }, 'Failed to load genre template, skipping')
      }
    }

    logger.info(`Loaded ${this.templates.size} genre templates`)
  }

  getTemplate(genre: string): GenreTemplate | undefined {
    return this.templates.get(genre)
  }

  getAllTemplates(): GenreTemplate[] {
    return Array.from(this.templates.values())
  }

  getTemplateNames(): string[] {
    return Array.from(this.templates.keys())
  }

  async createNewWorkFromTemplate(genre: string, customSettings?: Partial<GenreTemplate>): Promise<GenreTemplate | null> {
    const baseTemplate = this.getTemplate(genre)
    if (!baseTemplate) return null

    const template: GenreTemplate = {
      ...baseTemplate,
      ...customSettings,
    }

    return template
  }
}
