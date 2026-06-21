#!/usr/bin/env python3
"""
NovelForge DPO Training Script

Performs Direct Preference Optimization (DPO) training on Qwen model
using collected preference data.

Usage:
    python scripts/dpo-train.py              # Quick check mode
    python scripts/dpo-train.py --train      # Full DPO training
    python scripts/dpo-train.py --quantized  # 4-bit quantized DPO
    python scripts/dpo-train.py --status     # Check training status
    python scripts/dpo-train.py --evaluate   # Evaluate trained model
"""

import json
import os
import sys
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
        'trl': 'Transformer Reinforcement Learning (required for DPO)',
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
        print("   pip install torch transformers peft datasets accelerate trl")
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


def load_dpo_data(data_path: str):
    """Load and validate DPO training data."""
    if not os.path.exists(data_path):
        print(f"❌ DPO data not found: {data_path}")
        print("   Please collect DPO data first using the Studio")
        return None
    
    try:
        with open(data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"✅ Loaded {len(data)} DPO samples")
        
        # Validate data structure
        required_fields = {'prompt', 'chosen', 'rejected'}
        for i, sample in enumerate(data[:5]):
            if not required_fields.issubset(sample.keys()):
                print(f"⚠️  Sample {i} missing required fields: {required_fields - sample.keys()}")
        
        # Filter invalid samples
        valid_samples = []
        for sample in data:
            if sample.get('prompt') and sample.get('chosen') and sample.get('rejected'):
                if sample['chosen'] != sample['rejected']:
                    valid_samples.append(sample)
        
        print(f"   Valid samples: {len(valid_samples)}/{len(data)}")
        
        if len(valid_samples) < 10:
            print(f"⚠️  Warning: Too few valid samples ({len(valid_samples)})")
            print("   DPO training requires at least 100 samples for good results")
            print("   Recommended: 1000+ samples")
        
        return valid_samples
    
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in DPO data: {e}")
        return None


def prepare_dataset(data, tokenizer):
    """Tokenize DPO data for training."""
    from datasets import Dataset
    
    print("🔤 Tokenizing DPO data...")
    
    tokenized_chosen = []
    tokenized_rejected = []
    
    for i, sample in enumerate(data):
        prompt = sample.get('prompt', '')
        chosen = sample.get('chosen', '')
        rejected = sample.get('rejected', '')
        
        # Format for Chosen
        chosen_prompt = f"[INST] {prompt} [/INST] {chosen}"
        chosen_tok = tokenizer(
            chosen_prompt,
            truncation=True,
            max_length=1024,
            padding=False,
        )
        tokenized_chosen.append({
            'input_ids': chosen_tok['input_ids'],
            'attention_mask': chosen_tok['attention_mask'],
        })
        
        # Format for Rejected
        rejected_prompt = f"[INST] {prompt} [/INST] {rejected}"
        rejected_tok = tokenizer(
            rejected_prompt,
            truncation=True,
            max_length=1024,
            padding=False,
        )
        tokenized_rejected.append({
            'input_ids': rejected_tok['input_ids'],
            'attention_mask': rejected_tok['attention_mask'],
        })
        
        if (i + 1) % 100 == 0:
            print(f"   Tokenized {i + 1}/{len(data)} samples...")
    
    print(f"✅ Tokenization complete")
    
    # Return as separate datasets for DPO
    return (
        Dataset.from_list(tokenized_chosen),
        Dataset.from_list(tokenized_rejected),
    )


def run_dpo_training(chosen_dataset, rejected_dataset, gpu_info, output_dir, config):
    """Run DPO training using TRL library."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainingArguments
    from peft import LoraConfig, get_peft_model
    from trl import DPOTrainer
    
    base_model = config.get('base_model', 'Qwen/Qwen2.5-32B-Instruct')
    lora_r = config.get('lora_r', 32)
    lora_alpha = config.get('lora_alpha', 64)
    num_epochs = config.get('num_epochs', 3)
    batch_size = config.get('batch_size', 2)
    learning_rate = config.get('learning_rate', 5e-5)
    max_length = config.get('max_length', 1024)
    beta = config.get('beta', 0.1)  # DPO temperature parameter
    
    print(f"\n{'='*60}")
    print(f"🎯 Starting DPO Training")
    print(f"{'='*60}")
    print(f"Base model: {base_model}")
    print(f"LoRA rank: {lora_r}, alpha: {lora_alpha}")
    print(f"Epochs: {num_epochs}, Batch size: {batch_size}")
    print(f"Learning rate: {learning_rate}")
    print(f"Max length: {max_length}")
    print(f"Beta (DPO temp): {beta}")
    print(f"Output directory: {output_dir}")
    print(f"{'='*60}\n")
    
    # Load tokenizer
    print("📦 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    
    # Configure quantization if needed
    if config.get('quantized', False) and gpu_info['vram_gb'] < 24:
        print("🔧 Configuring 4-bit quantization...")
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )
        
        print("🎯 Loading base model (quantized)...")
        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            quantization_config=quantization_config,
            device_map="auto",
            trust_remote_code=True,
        )
    else:
        print("🎯 Loading base model (full precision)...")
        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            device_map="auto" if gpu_info['available'] else None,
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
    
    # Setup DPO training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=4,
        learning_rate=learning_rate,
        logging_steps=10,
        save_strategy='epoch',
        fp16=gpu_info['available'],
        remove_unused_columns=False,
        report_to='none',
        dataloader_num_workers=4,
    )
    
    # Train with DPO
    print("\n🏋️  Starting DPO training...")
    
    dpo_trainer = DPOTrainer(
        model,
        args=training_args,
        ref_model=None,  # TRL will create reference model automatically
        train_dataset=chosen_dataset,
        tokenizer=tokenizer,
        beta=beta,
        max_prompt=max_length // 2,
        max_target=max_length // 2,
    )
    
    try:
        train_result = dpo_trainer.train()
        
        # Save model
        print(f"\n💾 Saving DPO model to {output_dir}...")
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
                'beta': beta,
                'dpo_mode': True,
            }
        }
        
        metrics_path = os.path.join(output_dir, 'dpo-training-metrics.json')
        with open(metrics_path, 'w', encoding='utf-8') as f:
            json.dump(metrics, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*60}")
        print(f"✅ DPO Training complete!")
        print(f"   Output: {output_dir}")
        print(f"   Metrics: {metrics_path}")
        print(f"{'='*60}")
        
        return True
    
    except Exception as e:
        print(f"\n❌ DPO training failed: {e}")
        print("   Tips:")
        print("   - Reduce batch_size if OOM")
        print("   - Use --quantized flag for 4-bit training")
        print("   - Check GPU memory: nvidia-smi")
        print("   - Ensure you have at least 100 DPO samples")
        return False


def check_training_status(output_dir):
    """Check if there's an existing DPO training run."""
    if not os.path.exists(output_dir):
        print(f"No DPO training run found at: {output_dir}")
        return None
    
    metrics_path = os.path.join(output_dir, 'dpo-training-metrics.json')
    if os.path.exists(metrics_path):
        with open(metrics_path, 'r') as f:
            metrics = json.load(f)
        print(f"✅ Found existing DPO training run:")
        print(f"   Loss: {metrics.get('train_loss', 'N/A')}")
        print(f"   Time: {metrics.get('training_time', 'N/A')}")
        print(f"   Config: {json.dumps(metrics.get('config', {}), indent=2)}")
        return metrics
    
    print(f"⚠️  Directory exists but no DPO training metrics found")
    return None


def main():
    parser = argparse.ArgumentParser(description='NovelForge DPO Training Script')
    parser.add_argument('--data', default='./data/training/dpo_data.json',
                       help='Path to DPO data (default: ./data/training/dpo_data.json)')
    parser.add_argument('--output', default='./models/novelforge-dpo-lora',
                       help='Output directory for trained model (default: ./models/novelforge-dpo-lora)')
    parser.add_argument('--train', action='store_true',
                       help='Run DPO training (default: check mode only)')
    parser.add_argument('--quantized', action='store_true',
                       help='Use 4-bit quantized training (for consumer GPUs)')
    parser.add_argument('--status', action='store_true',
                       help='Check existing DPO training status')
    parser.add_argument('--evaluate', action='store_true',
                       help='Evaluate trained model on test data')
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
    parser.add_argument('--learning-rate', type=float, default=5e-5,
                       help='Learning rate (default: 5e-5)')
    parser.add_argument('--beta', type=float, default=0.1,
                       help='DPO beta parameter (default: 0.1)')
    
    args = parser.parse_args()
    
    print("="*60)
    print("  NovelForge DPO Training Script")
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
    
    # Validate DPO data
    print("📊 Validating DPO data...")
    data = load_dpo_data(args.data)
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
        'learning_rate': args.learning_rate,
        'max_length': 1024,
        'beta': args.beta,
        'quantized': args.quantized,
    }
    
    # If not in train mode, show summary
    if not args.train:
        print("ℹ️  Check mode (use --train to start DPO training)")
        print()
        print("Configuration:")
        for key, value in config.items():
            print(f"  {key}: {value}")
        print()
        print(f"DPO samples: {len(data)}")
        print(f"GPU: {gpu_info['model']} ({gpu_info['vram_gb']:.1f} GB VRAM)")
        print()
        
        if len(data) < 100:
            print(f"⚠️  Warning: Only {len(data)} DPO samples")
            print("   DPO training works best with 1000+ samples")
            print("   Consider collecting more data in Studio")
        
        if not gpu_info['available']:
            print("⚠️  Warning: No GPU detected")
            print("   DPO training on CPU will be very slow")
        
        print()
        print("Next steps:")
        print("  1. Collect more DPO data in Studio (recommended: 1000+)")
        print("  2. Run: python scripts/dpo-train.py --train --quantized")
        print("  3. Monitor training: python scripts/dpo-train.py --status")
        return
    
    # Run DPO training
    if args.quantized:
        print("🎛️  Using quantized DPO training mode (4-bit)")
    else:
        print("⚡ Using full precision DPO training mode")
        if gpu_info['vram_gb'] < 24:
            print("⚠️  Warning: Low VRAM detected")
            print("   Full precision requires 24GB+ VRAM")
            print("   Consider using --quantized flag")
    
    print()
    
    # Tokenize data
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(config['base_model'], trust_remote_code=True)
    chosen_dataset, rejected_dataset = prepare_dataset(data, tokenizer)
    
    # Run DPO training
    success = run_dpo_training(chosen_dataset, rejected_dataset, gpu_info, args.output, config)
    
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
