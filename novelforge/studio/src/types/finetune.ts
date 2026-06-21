/**
 * Fine-tune management types and interfaces.
 */

export interface FineTuneStatus {
  is_trained: boolean
  model_path: string | null
  training_samples: number
  last_training_time: string | null
  lora_rank: number
  lora_alpha: number
  base_model: string
  epochs: number
  batch_size: number
  learning_rate: number
  training_loss: number | null
  metrics: FineTuneMetrics | null
}

export interface FineTuneMetrics {
  train_loss: number | null
  training_time: string
  config: FineTuneConfig
}

export interface FineTuneConfig {
  base_model: string
  lora_r: number
  lora_alpha: number
  epochs: number
  batch_size: number
  learning_rate: number
  max_length: number
}

export interface GenerationReport {
  total_processed: number
  total_generated: number
  total_filtered: number
  samples_by_genre: Record<string, number>
  avg_quality_score: number
  processing_time_ms: number
  input_books: number
  input_chapters: number
  input_words: number
}

export interface FineTuneProgress {
  status: 'idle' | 'generating' | 'generating_complete' | 'validating' | 'training' | 'complete' | 'error'
  progress: number
  message: string
  current_step: string
}

export interface TrainingJob {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
  config: FineTuneConfig
  metrics: FineTuneMetrics | null
  error_message: string | null
}
