#!/usr/bin/env python3
"""
NovelForge Fine-tune Script

Performs LoRA fine-tuning of Qwen model on generated training data.
Supports both full GPU training and quantized training (4-bit) for consumer GPUs.

Usage:
    python scripts/fine-tune.py              # Quick check mode (no training)
    python scripts/fine-tune.py --train      # Full training mode
    python scripts/fine-tune.py --quantized  # 4-bit quantized training
    python scripts/fine-tune.py --status     # Check training status
"""

import json
import os
import sys
import subprocess
import argparse
from pathlib import Path
from datetime import datetime


def check_python_dependencies():
    """Check if required Python packages are installed."""
    required = {
        'torch': 'PyTorch with CUDA support',
        'transformers': 'HuggingFace Transformers',
        'peft': 'Parameter-Efficient Fine-Tuning',
        'datasets': 'HuggingFace Datasets',
        'accelerate': 'Accelerate library for distributed training',
    }
    
    missing = []
    for package, description in required.items():
        try:
            __import__(package)
        except ImportError:
            missing.append(f"{package} ({description})")
    
    if missing:
        print("❌ Missing required packages:")
        for pkg in missing:
            print(f"   - {pkg}")
        print("\n💡 Install with:")
        print("   pip install torch transformers peft datasets accelerate")
        print("   # For CUDA support:")
        print("   pip install torch --index-url https://download.pytorch.org/whl/cu118")
        return False
    
    print("✅ All required packages found")
    return True


def check_gpu():
    """Check GPU availability and specifications."""
    try:
        import torch
        
        if not torch.cuda.is_available():
            print("⚠️  CUDA not available")
            print("   Training will fall back to CPU (very slow)")
            print("   Recommended: Install PyTorch with CUDA support")
            return {
                'available': False,
                'device': 'cpu',
                'vram_gb': 0,
                'model': 'N/A',
            }
        
        device_count = torch.cuda.device_count()
        current_device = torch.cuda.current_device()
        gpu_props = torch.cuda.get_device_properties(current_device)
        
        print(f"✅ GPU detected: {gpu_props.name}")
        print(f"   VRAM: {gpu_props.total_mem / (1024**3):.1f} GB")
        print(f"   CUDA Version: {torch.version.cuda}")
        
        return {
            'available': True,
            'device': f'cuda:{current_device}',
            'vram_gb': gpu_props.total_mem / (1024**3),
            'model': gpu_props.name,
            'cuda_version': torch.version.cuda,
        }
    
    except ImportError:
        print("⚠️  PyTorch not installed")
        return {'available': False, 'device': 'cpu', 'vram_gb': 0, 'model': 'N/A'}


def load_training_data(data_path: str):
    """Load and validate training data."""
    if not os.path.exists(data_path):
        print(f"❌ Training data not found: {data_path}")
        print("   Please run: npx tsx tools/fine-tune-generator.ts")
        return None
    
    try:
        with open(data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"✅ Loaded {len(data)} training samples")
        
        # Validate data structure
        required_fields = {'instruction', 'input', 'output'}
        for i, sample in enumerate(data[:5]):  # Check first 5
            if not required_fields.issubset(sample.keys()):
                print(f"⚠️  Sample {i} missing required fields: {required_fields - sample.keys()}")
        
        return data
    
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in training data: {e}")
        return None


def prepare_dataset(data, tokenizer):
    """Tokenize training data for model input."""
    from datasets import Dataset
    
    print("🔤 Tokenizing training data...")
    
    tokenized_inputs = []
    for i, sample in enumerate(data):
        instruction = sample.get('instruction', '')
        input_text = sample.get('input', '')
        output = sample.get('output', '')
        
        # Format: [INST] instruction + input [/INST] output
        full_prompt = f"[INST] {instruction} {input_text} [/INST] {output}"
        
        tokenized = tokenizer(
            full_prompt,
            truncation=True,
            max_length=2048,
            padding=False,
        )
        
        tokenized_inputs.append({
            'input_ids': tokenized['input_ids'],
            'attention_mask': tokenized['attention_mask'],
        })
        
        if (i + 1) % 1000 == 0:
            print(f"   Tokenized {i + 1}/{len(data)} samples...")
    
    print(f"✅ Tokenization complete")
    return Dataset.from_list(tokenized_inputs)


def run_quantized_training(dataset, gpu_info, output_dir, config):
    """Run 4-bit quantized training (for consumer GPUs like RTX 3070)."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainingArguments
    from peft import LoraConfig, get_peft_model
    
    base_model = config.get('base_model', 'Qwen/Qwen2.5-32B-Instruct')
    lora_r = config.get('lora_r', 32)
    lora_alpha = config.get('lora_alpha', 64)
    num_epochs = config.get('num_epochs', 3)
    batch_size = config.get('batch_size', 2)
    learning_rate = config.get('learning_rate', 2e-4)
    max_length = config.get('max_length', 2048)
    
    print(f"\n{'='*60}")
    print(f"🚀 Starting Quantized LoRA Fine-tuning")
    print(f"{'='*60}")
    print(f"Base model: {base_model}")
    print(f"LoRA rank: {lora_r}, alpha: {lora_alpha}")
    print(f"Epochs: {num_epochs}, Batch size: {batch_size}")
    print(f"Learning rate: {learning_rate}")
    print(f"Max sequence length: {max_length}")
    print(f"Output directory: {output_dir}")
    print(f"{'='*60}\n")
    
    # Load tokenizer
    print("📦 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    
    # Configure 4-bit quantization
    print("🔧 Configuring 4-bit quantization...")
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )
    
    # Load base model with quantization
    print("🎯 Loading base model (quantized)...")
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        quantization_config=quantization_config,
        device_map="auto",
        trust_remote_code=True,
    )
    
    # Prepare LoRA
    print("🔀 Applying LoRA adapters...")
    lora_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        target_modules=['q_proj', 'v_proj', 'k_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
        lora_dropout=0.05,
        bias='none',
        task_type='CAUSAL_LM',
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    # Setup training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=4,
        learning_rate=learning_rate,
        logging_steps=100,
        save_strategy='epoch',
        fp16=True,
        remove_unused_columns=False,
        report_to='none',
    )
    
    # Train
    print("\n🏋️  Starting training...")
    from transformers import Trainer
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        tokenizer=tokenizer,
    )
    
    try:
        train_result = trainer.train()
        
        # Save model
        print(f"\n💾 Saving LoRA adapter to {output_dir}...")
        model.save_pretrained(output_dir)
        tokenizer.save_pretrained(output_dir)
        
        # Save training metrics
        metrics = {
            'train_loss': train_result.training_loss,
            'metrics': train_result.metrics,
            'training_time': datetime.now().isoformat(),
            'config': {
                'base_model': base_model,
                'lora_r': lora_r,
                'lora_alpha': lora_alpha,
                'epochs': num_epochs,
                'batch_size': batch_size,
                'learning_rate': learning_rate,
            }
        }
        
        metrics_path = os.path.join(output_dir, 'training-metrics.json')
        with open(metrics_path, 'w', encoding='utf-8') as f:
            json.dump(metrics, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*60}")
        print(f"✅ Training complete!")
        print(f"   Output: {output_dir}")
        print(f"   Metrics: {metrics_path}")
        print(f"{'='*60}")
        
        return True
    
    except Exception as e:
        print(f"\n❌ Training failed: {e}")
        print("   Tips:")
        print("   - Reduce batch_size if OOM")
        print("   - Use --quantized flag for 4-bit training")
        print("   - Check GPU memory: nvidia-smi")
        return False


def check_training_status(output_dir):
    """Check if there's an existing training run."""
    if not os.path.exists(output_dir):
        print(f"No training run found at: {output_dir}")
        return None
    
    metrics_path = os.path.join(output_dir, 'training-metrics.json')
    if os.path.exists(metrics_path):
        with open(metrics_path, 'r') as f:
            metrics = json.load(f)
        print(f"✅ Found existing training run:")
        print(f"   Loss: {metrics.get('train_loss', 'N/A')}")
        print(f"   Time: {metrics.get('training_time', 'N/A')}")
        print(f"   Config: {json.dumps(metrics.get('config', {}), indent=2)}")
        return metrics
    
    print(f"⚠️  Directory exists but no training metrics found")
    return None


def main():
    parser = argparse.ArgumentParser(description='NovelForge Fine-tuning Script')
    parser.add_argument('--data', default='./data/training/finetune_data.json',
                       help='Path to training data (default: ./data/training/finetune_data.json)')
    parser.add_argument('--output', default='./models/novelforge-lora',
                       help='Output directory for trained model (default: ./models/novelforge-lora)')
    parser.add_argument('--train', action='store_true',
                       help='Run full training (default: check mode only)')
    parser.add_argument('--quantized', action='store_true',
                       help='Use 4-bit quantized training (for consumer GPUs)')
    parser.add_argument('--status', action='store_true',
                       help='Check existing training status')
    parser.add_argument('--base-model', default='Qwen/Qwen2.5-32B-Instruct',
                       help='Base model name (default: Qwen/Qwen2.5-32B-Instruct)')
    parser.add_argument('--epochs', type=int, default=3,
                       help='Number of training epochs (default: 3)')
    parser.add_argument('--batch-size', type=int, default=2,
                       help='Batch size per device (default: 2)')
    parser.add_argument('--lora-r', type=int, default=32,
                       help='LoRA rank (default: 32)')
    parser.add_argument('--lora-alpha', type=int, default=64,
                       help='LoRA alpha (default: 64)')
    
    args = parser.parse_args()
    
    print("="*60)
    print("  NovelForge Fine-tuning Script")
    print("="*60)
    print()
    
    # Check status if requested
    if args.status:
        check_training_status(args.output)
        return
    
    # Check dependencies
    print("📋 Checking dependencies...")
    if not check_python_dependencies():
        print("\n❌ Cannot proceed without required packages")
        print("   Please install dependencies first")
        sys.exit(1)
    print()
    
    # Check GPU
    print("🖥️  Checking GPU...")
    gpu_info = check_gpu()
    print()
    
    # Validate training data
    print("📊 Validating training data...")
    data = load_training_data(args.data)
    if data is None:
        sys.exit(1)
    print()
    
    # Prepare training configuration
    config = {
        'base_model': args.base_model,
        'lora_r': args.lora_r,
        'lora_alpha': args.lora_alpha,
        'num_epochs': args.epochs,
        'batch_size': args.batch_size,
        'learning_rate': 2e-4 if not args.quantized else 5e-4,
        'max_length': 2048,
    }
    
    # If not in train mode, show summary
    if not args.train:
        print("ℹ️  Check mode (use --train to start training)")
        print()
        print("Configuration:")
        for key, value in config.items():
            print(f"  {key}: {value}")
        print()
        print(f"Training data: {len(data)} samples")
        print(f"GPU: {gpu_info['model']} ({gpu_info['vram_gb']:.1f} GB VRAM)")
        print()
        
        if not gpu_info['available']:
            print("⚠️  Warning: No GPU detected")
            print("   Training on CPU will be very slow")
            print("   Consider using --quantized for GPU acceleration")
        
        print()
        print("Next steps:")
        print("  1. Install GPU drivers and CUDA")
        print("  2. Run: python scripts/fine-tune.py --train --quantized")
        print("  3. Monitor training: python scripts/fine-tune.py --status")
        return
    
    # Run training
    if args.quantized:
        print("🎛️  Using quantized training mode (4-bit)")
    else:
        print("⚡ Using full precision training mode")
        if gpu_info['vram_gb'] < 24:
            print("⚠️  Warning: Low VRAM detected")
            print("   Full precision requires 24GB+ VRAM")
            print("   Consider using --quantized flag")
    
    print()
    
    # Tokenize data
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(config['base_model'], trust_remote_code=True)
    dataset = prepare_dataset(data, tokenizer)
    
    # Run training
    success = run_quantized_training(dataset, gpu_info, args.output, config)
    
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
