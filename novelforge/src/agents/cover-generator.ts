import { ModelRouter } from '../router.js'
import { StateManager } from '../state/manager.js'
import { config } from '../config.js'

export interface CoverResult {
  success: boolean
  prompt: string
  imageUrl?: string
  localPath?: string
  error?: string
}

export class CoverGeneratorAgent {
  private router: ModelRouter
  private stateManager: StateManager

  constructor(router: ModelRouter, stateManager: StateManager) {
    this.router = router
    this.stateManager = stateManager
  }

  async generate(): Promise<CoverResult> {
    if (!config.featureCoverGeneration) {
      return { success: false, prompt: '', error: 'Cover generation feature is disabled' }
    }

    try {
      const masterSetting = await this.stateManager.read('MASTER_SETTING')
      const prompt = await this.generatePrompt(masterSetting)
      
      const imageUrl = await this.callStableDiffusion(prompt)
      
      const localPath = await this.saveImage(imageUrl, masterSetting.title)
      
      return {
        success: true,
        prompt,
        imageUrl,
        localPath,
      }
    } catch (error) {
      return {
        success: false,
        prompt: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  private async generatePrompt(masterSetting: any): Promise<string> {
    const systemPrompt = `你是一位专业的AI绘画提示词工程师。请根据以下小说信息生成英文封面提示词。

要求：
1. 使用英文
2. 包含风格、氛围、主体元素
3. 适合小说封面的构图
4. 长度约100-150词

输出格式：直接输出提示词文本`

    const userPrompt = `小说信息：
标题: ${masterSetting.title}
题材: ${masterSetting.genre}
核心设定: ${masterSetting.core_premise}
核心冲突: ${masterSetting.core_conflict}

请生成封面提示词。`

    return await this.router.generate('cover-generator', systemPrompt, userPrompt)
  }

  private async callStableDiffusion(prompt: string): Promise<string> {
    if (!config.sdApiUrl || !config.sdApiKey) {
      throw new Error('Stable Diffusion API not configured')
    }

    const response = await fetch(`${config.sdApiUrl}/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.sdApiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 768,
        samples: 1,
        steps: 30,
      }),
    })

    if (!response.ok) {
      throw new Error(`SD API error: ${response.status}`)
    }

    const data: any = await response.json()
    return `data:image/png;base64,${data.artifacts[0].base64}`
  }

  private async saveImage(imageUrl: string, title: string): Promise<string> {
    const fs = await import('fs')
    const path = await import('path')
    
    const exportDir = path.join(process.cwd(), 'workspace', 'exports', 'covers')
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }
    
    const filename = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${Date.now()}.png`
    const localPath = path.join(exportDir, filename)
    
    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1]
      fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'))
    }
    
    return localPath
  }
}
