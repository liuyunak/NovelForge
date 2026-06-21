import { Hono } from 'hono'
import * as fs from 'fs'
import * as path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { logger } from '../logger.js'

export const fineTuneRouter = new Hono()

const TRAINING_DATA_PATH = './data/training/finetune_data.json'
const METADATA_PATH = './data/training/generation-metadata.json'
const MODEL_OUTPUT_PATH = './models/novelforge-lora'
const TRAIN_SCRIPT_PATH = './scripts/train-lora.py'
const TRAIN_LOG_PATH = './data/training/training.log'

// Track active training process
let activeTrainingProcess: ChildProcess | null = null
let trainingStartTime: number | null = null

/**
 * GET /api/finetune/status
 * Check current fine-tune status, training data availability, and model state.
 */
fineTuneRouter.get('/status', (c) => {
  try {
    const isRunning = activeTrainingProcess !== null && activeTrainingProcess.exitCode === null
    const status = {
      is_trained: fs.existsSync(path.join(MODEL_OUTPUT_PATH, 'adapter_model.safetensors')),
      is_training: isRunning,
      model_path: MODEL_OUTPUT_PATH,
      training_samples: 0,
      last_training_time: null,
      lora_rank: 32,
      lora_alpha: 64,
      base_model: 'Qwen/Qwen2.5-32B-Instruct',
      epochs: 3,
      batch_size: 2,
      learning_rate: 0.0002,
      training_loss: null,
      metrics: null,
    }

    let report = null
    if (fs.existsSync(TRAINING_DATA_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(TRAINING_DATA_PATH, 'utf-8'))
        status.training_samples = Array.isArray(data) ? data.length : 0
      } catch {
        status.training_samples = 0
      }
    }

    if (fs.existsSync(METADATA_PATH)) {
      try {
        report = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'))
      } catch {
        report = null
      }
    }

    // Check for training metrics
    const metricsPath = path.join(MODEL_OUTPUT_PATH, 'training-metrics.json')
    if (fs.existsSync(metricsPath)) {
      try {
        const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
        status.last_training_time = metrics.training_started || metrics.training_completed
        status.training_loss = metrics.train_loss
        status.lora_rank = metrics.lora_rank || 32
        status.lora_alpha = metrics.lora_alpha || 64
        status.epochs = metrics.epochs || 3
        status.metrics = metrics
      } catch {
        // Ignore corrupted metrics file
      }
    }

    // Check training config
    const configPath = path.join(MODEL_OUTPUT_PATH, 'training-config.json')
    if (fs.existsSync(configPath)) {
      try {
        const trainConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        status.lora_rank = trainConfig.lora_r || status.lora_rank
        status.lora_alpha = trainConfig.lora_alpha || status.lora_alpha
        status.base_model = trainConfig.model_name_or_path || status.base_model
      } catch { /* ignore */ }
    }

    // Calculate elapsed time if training
    let elapsedSeconds = 0
    if (isRunning && trainingStartTime) {
      elapsedSeconds = Math.floor((Date.now() - trainingStartTime) / 1000)
    }

    return c.json({
      status,
      progress: isRunning ? {
        status: 'training' as const,
        progress: 0,
        message: `Training in progress (${elapsedSeconds}s elapsed)`,
        current_step: 'Training',
        elapsed_seconds: elapsedSeconds,
      } : {
        status: 'idle' as const,
        progress: 0,
        message: status.is_trained ? 'Model trained' : 'Ready',
        current_step: status.is_trained ? 'Complete' : 'Idle',
      },
      report,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get fine-tune status')
    return c.json({ error: 'Failed to get status' }, 500)
  }
})

/**
 * POST /api/finetune/generate
 * Generate training data from processed books.
 */
fineTuneRouter.post('/generate', async (c) => {
  try {
    const body = await c.req.json()
    const maxSamples = (body as { maxSamples?: number }).maxSamples || 50000

    // Check if processed data exists
    const processedPath = './data/processed'
    if (!fs.existsSync(processedPath)) {
      return c.json({ error: 'Processed data not found. Run: pnpm run knowledge:process' }, 400)
    }

    // Import generator
    // Dynamic import from project-root tools/ directory (not in tsconfig rootDir)
    const generatorPath = '../../tools/fine-tune-generator.js'
    const { FineTuneDataGenerator } = await import(generatorPath)
    const generator = new FineTuneDataGenerator(processedPath, './data/training', maxSamples)
    const report = await generator.generate()

    return c.json(report)
  } catch (error) {
    logger.error({ error }, 'Failed to generate fine-tune data')
    return c.json({ error: `Generation failed: ${error}` }, 500)
  }
})

/**
 * POST /api/finetune/train
 * Start LoRA fine-tuning process by spawning a Python subprocess.
 */
fineTuneRouter.post('/train', async (c) => {
  try {
    const body = await c.req.json()

    // Validate baseModel: allow only HuggingFace-style identifiers (org/model, alphanumeric, /, -, _, .)
    const baseModelRaw = typeof body?.baseModel === 'string' ? body.baseModel : 'Qwen/Qwen2.5-32B-Instruct'
    if (!/^[a-zA-Z0-9A-Za-z0-9_\-\.\/]+$/.test(baseModelRaw) || baseModelRaw.length > 200) {
      return c.json({ error: 'Invalid baseModel format' }, 400)
    }

    // Validate numeric parameters with safe ranges
    const loraRank = Number.isInteger(body?.loraRank) && body.loraRank >= 1 && body.loraRank <= 128 ? body.loraRank : 32
    const loraAlpha = Number.isInteger(body?.loraAlpha) && body.loraAlpha >= 1 && body.loraAlpha <= 256 ? body.loraAlpha : 64
    const epochs = Number.isInteger(body?.epochs) && body.epochs >= 1 && body.epochs <= 20 ? body.epochs : 3
    const batchSize = Number.isInteger(body?.batchSize) && body.batchSize >= 1 && body.batchSize <= 64 ? body.batchSize : 2
    const quantized = !!body?.quantized

    const config = {
      baseModel: baseModelRaw,
      loraRank,
      loraAlpha,
      epochs,
      batchSize,
      quantized,
    }

    // Check if training data exists
    if (!fs.existsSync(TRAINING_DATA_PATH)) {
      return c.json(
        { success: false, message: 'Training data not found. Generate data first.' },
        400
      )
    }

    // Check if already training
    if (activeTrainingProcess && activeTrainingProcess.exitCode === null) {
      return c.json({
        success: false,
        message: 'Training already in progress. Check /api/finetune/status for progress.',
      }, 409)
    }

    // Check if Python script exists
    const scriptPath = path.resolve(TRAIN_SCRIPT_PATH)
    if (!fs.existsSync(scriptPath)) {
      // Fall back to returning instruction
      logger.warn({ scriptPath }, 'Training script not found')
      return c.json({
        success: true,
        message: 'Training script not found. To train manually, run: pip install torch transformers peft datasets accelerate && python scripts/train-lora.py --train --auto',
        config,
      })
    }

    // Ensure output directories exist
    const outputDir = path.resolve(MODEL_OUTPUT_PATH)
    const logDir = path.dirname(path.resolve(TRAIN_LOG_PATH))
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

    // Build command arguments
    const args = [
      scriptPath,
      '--train',
      '--auto',
      '--base-model', config.baseModel,
      '--lora-rank', String(config.loraRank),
      '--lora-alpha', String(config.loraAlpha),
      '--epochs', String(config.epochs),
      '--batch-size', String(config.batchSize),
      '--data-path', path.resolve(TRAINING_DATA_PATH),
      '--output-dir', outputDir,
    ]
    if (config.quantized) {
      args.push('--quantized')
    }

    logger.info({
      scriptPath,
      config,
      args,
    }, 'Spawning LoRA training process')

    // Open log file for output
    const logStream = fs.createWriteStream(TRAIN_LOG_PATH, { flags: 'a' })
    const startMarker = `\n${'='.repeat(60)}\nTraining started: ${new Date().toISOString()}\n${'='.repeat(60)}\n`
    logStream.write(startMarker)

    // Spawn Python process
    const proc = spawn('python', args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.stdout?.pipe(logStream)
    proc.stderr?.pipe(logStream)

    proc.on('close', (code) => {
      const endMarker = `\nTraining ended: ${new Date().toISOString()} (exit code: ${code})\n${'='.repeat(60)}\n`
      logStream.write(endMarker)
      logStream.end()

      logger.info({ exitCode: code }, 'LoRA training process finished')
      activeTrainingProcess = null
      trainingStartTime = null
    })

    proc.on('error', (err) => {
      logger.error({ error: err }, 'LoRA training process error')
      logStream.write(`\n[ERROR] ${err.message}\n`)
      logStream.end()
      activeTrainingProcess = null
      trainingStartTime = null
    })

    activeTrainingProcess = proc
    trainingStartTime = Date.now()

    return c.json({
      success: true,
      message: 'Training started. Monitor progress via /api/finetune/logs and /api/finetune/status',
      config,
      pid: proc.pid,
      log_file: TRAIN_LOG_PATH,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to start training')
    return c.json({ error: `Training failed: ${error}` }, 500)
  }
})

/**
 * POST /api/finetune/cancel
 * Cancel the running training process.
 */
fineTuneRouter.post('/cancel', (c) => {
  if (!activeTrainingProcess || activeTrainingProcess.exitCode !== null) {
    return c.json({ success: false, message: 'No active training process' }, 400)
  }

  try {
    activeTrainingProcess.kill('SIGTERM')
    logger.info('Training process cancelled by user')
    return c.json({ success: true, message: 'Training cancelled' })
  } catch (error) {
    logger.error({ error }, 'Failed to cancel training')
    return c.json({ error: 'Failed to cancel training' }, 500)
  }
})

/**
 * GET /api/finetune/logs
 * Get recent training logs with optional tail parameter.
 */
fineTuneRouter.get('/logs', (c) => {
  try {
    const tail = c.req.query('tail') ? parseInt(c.req.query('tail')!) : 50
    const logPath = path.resolve(TRAIN_LOG_PATH)

    if (!fs.existsSync(logPath)) {
      // Check metrics for status info
      const metricsPath = path.join(MODEL_OUTPUT_PATH, 'training-metrics.json')
      let status = 'idle'
      let trainingInfo: any = null
      if (fs.existsSync(metricsPath)) {
        try {
          trainingInfo = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
          status = trainingInfo.status || 'unknown'
        } catch { /* ignore */ }
      }

      return c.json({
        lines: ['[INFO] No training logs yet.'],
        status,
        metrics: trainingInfo,
      })
    }

    const content = fs.readFileSync(logPath, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim())
    const recent = lines.slice(-Math.min(tail, lines.length))

    const isRunning = activeTrainingProcess !== null && activeTrainingProcess.exitCode === null

    return c.json({
      lines: recent,
      total_lines: lines.length,
      status: isRunning ? 'training' : 'idle',
    })
  } catch (error) {
    logger.error({ error }, 'Failed to read training logs')
    return c.json({ error: 'Failed to read logs' }, 500)
  }
})
