import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`  created: ${dir}`)
  }
}

function main(): void {
  console.log('NovelForge 初始化...\n')

  const dirs = [
    join(ROOT, 'workspace'),
    join(ROOT, 'data'),
    join(ROOT, 'logs'),
  ]

  for (const dir of dirs) {
    ensureDir(dir)
  }

  const envPath = join(ROOT, '.env')
  const envExamplePath = join(ROOT, '.env.example')

  if (!existsSync(envPath) && existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envPath)
    console.log('  created: .env (copy from .env.example)')
    console.log('  ⚠️  请编辑 .env 填入你的 DEEPSEEK_API_KEY\n')
  } else if (existsSync(envPath)) {
    console.log('  .env already exists, skipped\n')
  }

  console.log('初始化完成！')
  console.log('下一步:')
  console.log('  1. pnpm install')
  console.log('  2. 编辑 .env 填入 API Key')
  console.log('  3. pnpm dev')
}

main()
