#!/usr/bin/env python3
"""
NovelForge LoRA Fine-Tuning Script

Performs LoRA (Low-Rank Adaptation) fine-tuning on Qwen models
using generated training data from NovelForge.

Usage:
    python scripts/train-lora.py                    # Quick status check
    python scripts/train-lora.py --train            # Full LoRA training
    python scripts/train-lora.py --train --quantized # 4-bit QLoRA
    python scripts/train-lora.py --status           # Check training status
    python scripts/train-lora.py --evaluate         # Evaluate trained model
"""

import json
import os
import sys
import argparse
import subprocess
from pathlib import Path
from datetime import datetime


def check_dependencies():
    """Check if required Python packages are installed."""
    required = {
        'torch': 'PyTorch with CUDA support',
        'transformers': 'HuggingFace Transformers',
        'peft': 'Parameter-Efficient Fine-Tuning',
        'datasets': 'HuggingFace Datasets',
        'accelerate': 'Accelerate library',
    }

    missing = []
    for pkg, desc in required.items():
        try:
            __import__(pkg)
        except ImportError:
            missing.append(f"  - {pkg}: {desc}")

    if missing:
        print("[ERROR] Missing dependencies:\n" + "\n".join(missing))
        print("\nInstall with: pip install torch transformers peft datasets accelerate")
        return False
    return True


def check_cuda():
    """Check CUDA availability."""
    try:
        import torch
        if torch.cuda.is_available():
            device_count = torch.cuda.device_count()
            device_name = torch.cuda.get_device_name(0)
            print(f"[OK] CUDA available: {device_count}x {device_name}")
            return True
        else:
            print("[WARN] CUDA not available. Training will be very slow on CPU.")
            return False
    except Exception:
        print("[WARN] Could not check CUDA status.")
        return False


def load_training_data(data_path: str):
    """Load and validate training data."""
    if not os.path.exists(data_path):
        print(f"[ERROR] Training data not found: {data_path}")
        print("Generate training data first via the API: POST /api/finetune/generate")
        return None

    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not isinstance(data, list) or len(data) == 0:
        print("[ERROR] Training data is empty or invalid format")
        return None

    # Validate format: each sample should have 'instruction', 'input', 'output'
    valid = 0
    for sample in data:
        if isinstance(sample, dict) and 'instruction' in sample and 'output' in sample:
            valid += 1

    if valid == 0:
        print("[ERROR] No valid training samples found (need instruction + output)")
        return None

    print(f"[OK] Loaded {valid} valid training samples from {len(data)} total entries")
    return data


def train_lora(args):
    """Execute LoRA fine-tuning."""
    print("[INFO] Starting LoRA fine-tuning...")
    print(f"       Base model: {args.base_model}")
    print(f"       LoRA rank: {args.lora_rank}")
    print(f"       LoRA alpha: {args.lora_alpha}")
    print(f"       Epochs: {args.epochs}")
    print(f"       Batch size: {args.batch_size}")
    print(f"       Quantized: {args.quantized}")
    print(f"       Learning rate: {args.learning_rate}")

    os.makedirs(args.output_dir, exist_ok=True)

    # Prepare training config for the Python training script
    train_config = {
        "model_name_or_path": args.base_model,
        "output_dir": args.output_dir,
        "lora_r": args.lora_rank,
        "lora_alpha": args.lora_alpha,
        "lora_dropout": 0.05,
        "num_train_epochs": args.epochs,
        "per_device_train_batch_size": args.batch_size,
        "gradient_accumulation_steps": 4,
        "learning_rate": args.learning_rate,
        "warmup_ratio": 0.03,
        "lr_scheduler_type": "cosine",
        "logging_steps": 10,
        "save_steps": 100,
        "eval_steps": 100,
        "save_total_limit": 3,
        "load_in_4bit": args.quantized,
        "bf16": True,
        "tf32": True,
        "dataloader_num_workers": 2,
        "remove_unused_columns": False,
        "report_to": "none",
    }

    # Save training config
    config_path = os.path.join(args.output_dir, 'training-config.json')
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(train_config, f, indent=2, ensure_ascii=False)

    metrics = {
        "training_started": datetime.now().isoformat(),
        "base_model": args.base_model,
        "lora_rank": args.lora_rank,
        "lora_alpha": args.lora_alpha,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "quantized": args.quantized,
        "config_path": config_path,
        "log_file": os.path.join(args.output_dir, 'training.log'),
    }

    # Save initial metrics
    metrics_path = os.path.join(args.output_dir, 'training-metrics.json')
    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    print(f"\n[OK] Training configuration saved to: {config_path}")
    print(f"[INFO] Training will use the following data: {args.data_path}")
    print(f"[INFO] Output will be saved to: {args.output_dir}")

    # Build the inline training script path
    inline_script = os.path.join(os.path.dirname(__file__), '..', 'data', 'training', 'train_inline.py')

    # Generate inline training script
    generate_inline_script(inline_script, train_config, args.data_path)

    print(f"\n[INFO] To run training manually:")
    print(f"  python {inline_script}")
    print(f"\n[INFO] Or use the HuggingFace Trainer directly:")
    print(f"  python -m torch.distributed.run --nproc_per_node=1 {inline_script}")

    # Try to auto-run if --auto is specified
    if args.auto:
        print("\n[INFO] Auto-running training...")
        try:
            result = subprocess.run(
                [sys.executable, inline_script],
                capture_output=False,
                text=True,
                cwd=os.path.dirname(inline_script) or '.',
            )
            if result.returncode == 0:
                print("\n[OK] Training completed successfully!")
                # Update metrics
                metrics["training_completed"] = datetime.now().isoformat()
                metrics["status"] = "completed"
                with open(metrics_path, 'w', encoding='utf-8') as f:
                    json.dump(metrics, f, indent=2, ensure_ascii=False)
            else:
                print(f"\n[ERROR] Training failed with exit code {result.returncode}")
                metrics["status"] = "failed"
                metrics["error"] = f"Exit code {result.returncode}"
                with open(metrics_path, 'w', encoding='utf-8') as f:
                    json.dump(metrics, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"\n[ERROR] Failed to run training: {e}")
            metrics["status"] = "error"
            metrics["error"] = str(e)
            with open(metrics_path, 'w', encoding='utf-8') as f:
                json.dump(metrics, f, indent=2, ensure_ascii=False)


def generate_inline_script(script_path: str, config: dict, data_path: str):
    """Generate a self-contained Python training script."""
    script = f'''#!/usr/bin/env python3
"""Auto-generated LoRA fine-tuning script for NovelForge."""
import json, os, sys
from datetime import datetime

# Configuration
CONFIG = {json.dumps(config, indent=2)}
DATA_PATH = "{data_path}"

try:
    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling,
    )
    from peft import LoraConfig, get_peft_model, TaskType, prepare_model_for_kbit_training
    from datasets import Dataset

    print("[INFO] Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(
        CONFIG["model_name_or_path"],
        trust_remote_code=True,
        padding_side="right",
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print("[INFO] Loading training data...")
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    # Format: instruction + input -> output
    formatted_data = []
    for sample in raw_data:
        instruction = sample.get("instruction", "")
        inp = sample.get("input", "")
        output = sample.get("output", "")

        prompt = f"<|im_start|>system\\n{{instruction}}<|im_end|>\\n<|im_start|>user\\n{{inp}}<|im_end|>\\n<|im_start|>assistant\\n"
        prompt = prompt.replace("{{instruction}}", instruction).replace("{{inp}}", inp)
        full_text = prompt + output + "<|im_end|>"
        formatted_data.append({{"text": full_text}})

    dataset = Dataset.from_list(formatted_data)

    print(f"[INFO] Tokenizing {{len(dataset)}} samples...")

    def tokenize(example):
        return tokenizer(
            example["text"],
            truncation=True,
            max_length=2048,
            padding=False,
        )

    tokenized = dataset.map(tokenize, remove_columns=["text"])

    print("[INFO] Loading model...")
    model_kwargs = {{
        "trust_remote_code": True,
        "torch_dtype": torch.bfloat16 if CONFIG.get("bf16") else torch.float16,
    }}
    if CONFIG.get("load_in_4bit"):
        model_kwargs["load_in_4bit"] = True
        model_kwargs["device_map"] = "auto"

    model = AutoModelForCausalLM.from_pretrained(
        CONFIG["model_name_or_path"],
        **model_kwargs,
    )

    if CONFIG.get("load_in_4bit"):
        model = prepare_model_for_kbit_training(model)

    # Configure LoRA
    lora_config = LoraConfig(
        r=CONFIG["lora_r"],
        lora_alpha=CONFIG["lora_alpha"],
        lora_dropout=CONFIG.get("lora_dropout", 0.05),
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Training arguments
    training_args = TrainingArguments(
        output_dir=CONFIG["output_dir"],
        num_train_epochs=CONFIG["num_train_epochs"],
        per_device_train_batch_size=CONFIG["per_device_train_batch_size"],
        gradient_accumulation_steps=CONFIG.get("gradient_accumulation_steps", 4),
        learning_rate=CONFIG["learning_rate"],
        warmup_ratio=CONFIG.get("warmup_ratio", 0.03),
        lr_scheduler_type=CONFIG.get("lr_scheduler_type", "cosine"),
        logging_steps=CONFIG.get("logging_steps", 10),
        save_steps=CONFIG.get("save_steps", 100),
        save_total_limit=CONFIG.get("save_total_limit", 3),
        bf16=CONFIG.get("bf16", True),
        tf32=CONFIG.get("tf32", True),
        remove_unused_columns=CONFIG.get("remove_unused_columns", False),
        report_to=CONFIG.get("report_to", "none"),
        dataloader_num_workers=CONFIG.get("dataloader_num_workers", 2),
        save_strategy="steps",
    )

    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        data_collator=data_collator,
    )

    print("[INFO] Starting training...")
    train_result = trainer.train()

    # Save the model
    print("[INFO] Saving model...")
    trainer.save_model()
    tokenizer.save_pretrained(CONFIG["output_dir"])

    # Save training metrics
    metrics = {{
        "train_loss": train_result.training_loss,
        "train_runtime": train_result.metrics.get("train_runtime"),
        "total_steps": train_result.global_step,
        "completed_at": datetime.now().isoformat(),
        "status": "completed",
    }}
    metrics_path = os.path.join(CONFIG["output_dir"], "training-metrics.json")
    # Merge with existing metrics
    if os.path.exists(metrics_path):
        with open(metrics_path, 'r') as f:
            existing = json.load(f)
        existing.update(metrics)
        metrics = existing

    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    print(f"\\n[OK] Training complete! Loss: {{train_result.training_loss:.4f}}")
    print(f"[OK] Model saved to: {{CONFIG['output_dir']}}")

except ImportError as e:
    print(f"[ERROR] Missing dependency: {{e}}")
    print("Install: pip install torch transformers peft datasets accelerate")
    sys.exit(1)
except Exception as e:
    print(f"[ERROR] Training failed: {{e}}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
'''
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(script)
    print(f"[OK] Generated training script: {script_path}")


def check_status(output_dir: str):
    """Check training status."""
    metrics_path = os.path.join(output_dir, 'training-metrics.json')

    if not os.path.exists(metrics_path):
        print("[INFO] No training has been run yet.")
        return

    with open(metrics_path, 'r', encoding='utf-8') as f:
        metrics = json.load(f)

    print("\n=== Training Status ===")
    print(f"Status: {metrics.get('status', 'unknown')}")
    print(f"Base model: {metrics.get('base_model', 'N/A')}")
    print(f"Started: {metrics.get('training_started', 'N/A')}")
    print(f"Completed: {metrics.get('training_completed', metrics.get('completed_at', 'N/A'))}")

    if 'train_loss' in metrics:
        print(f"Train loss: {metrics['train_loss']:.4f}")
    if 'total_steps' in metrics:
        print(f"Total steps: {metrics['total_steps']}")

    # Check if model files exist
    adapter_path = os.path.join(output_dir, 'adapter_model.safetensors')
    if os.path.exists(adapter_path):
        size_mb = os.path.getsize(adapter_path) / (1024 * 1024)
        print(f"Adapter model: {size_mb:.1f}MB")
    else:
        print("Adapter model: not found")


def evaluate_model(output_dir: str):
    """Quick evaluation of trained model."""
    print("[INFO] Model evaluation not yet implemented.")
    print("Use --status to check training metrics, or load the model manually:")
    print(f"  from peft import PeftModel")
    print(f"  model = PeftModel.from_pretrained(base_model, '{output_dir}')")


def main():
    parser = argparse.ArgumentParser(description='NovelForge LoRA Fine-Tuning')
    parser.add_argument('--train', action='store_true', help='Run LoRA training')
    parser.add_argument('--auto', action='store_true', help='Auto-run training inline')
    parser.add_argument('--quantized', action='store_true', help='Use 4-bit QLoRA')
    parser.add_argument('--status', action='store_true', help='Check training status')
    parser.add_argument('--evaluate', action='store_true', help='Evaluate model')
    parser.add_argument('--base-model', default='Qwen/Qwen2.5-32B-Instruct',
                        help='Base model for fine-tuning')
    parser.add_argument('--lora-rank', type=int, default=32, help='LoRA rank')
    parser.add_argument('--lora-alpha', type=int, default=64, help='LoRA alpha')
    parser.add_argument('--epochs', type=int, default=3, help='Training epochs')
    parser.add_argument('--batch-size', type=int, default=2, help='Batch size per device')
    parser.add_argument('--learning-rate', type=float, default=2e-4, help='Learning rate')
    parser.add_argument('--data-path', default='./data/training/finetune_data.json',
                        help='Path to training data JSON')
    parser.add_argument('--output-dir', default='./models/novelforge-lora',
                        help='Output directory for LoRA weights')

    args = parser.parse_args()

    if args.status:
        check_status(args.output_dir)
        return

    if args.evaluate:
        evaluate_model(args.output_dir)
        return

    if not args.train:
        print("NovelForge LoRA Fine-Tuning")
        print("\nUsage:")
        print("  --status    Check training status")
        print("  --train     Start LoRA training")
        print("  --evaluate  Evaluate trained model")
        print("\nExample:")
        print("  python scripts/train-lora.py --train --quantized --epochs 3")
        return

    # Check environment
    if not check_dependencies():
        sys.exit(1)

    check_cuda()

    # Load training data
    if not load_training_data(args.data_path):
        sys.exit(1)

    # Run training
    train_lora(args)


if __name__ == '__main__':
    main()
