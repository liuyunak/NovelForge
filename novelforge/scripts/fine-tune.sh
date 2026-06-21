#!/bin/bash

# NovelForge Fine-tune Script
# Usage: bash scripts/fine-tune.sh [check|generate|train|dpo|full]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TRAINING_DATA="$PROJECT_ROOT/data/training/finetune_data.json"
DPO_DATA="$PROJECT_ROOT/data/training/dpo_data.json"
MODEL_OUTPUT="$PROJECT_ROOT/models/novelforge-lora"
DPO_MODEL_OUTPUT="$PROJECT_ROOT/models/novelforge-dpo-lora"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    echo ""
    
    local missing=()
    
    # Check Python
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        log_success "Python: $PYTHON_VERSION"
    else
        missing+=("python3")
        log_error "python3 not found"
    fi
    
    # Check pip
    if command_exists pip3; then
        log_success "pip3: $(pip3 --version | awk '{print $3}')"
    else
        missing+=("pip3")
        log_error "pip3 not found"
    fi
    
    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version)
        log_success "Node.js: $NODE_VERSION"
    else
        missing+=("node")
        log_warn "Node.js not found (needed for data generation)"
    fi
    
    # Check pnpm
    if command_exists pnpm; then
        log_success "pnpm: $(pnpm --version)"
    else
        missing+=("pnpm")
        log_warn "pnpm not found (needed for data generation)"
    fi
    
    echo ""
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing: ${missing[*]}"
        log_info "Install missing dependencies and retry"
        return 1
    fi
    
    log_success "All prerequisites satisfied"
    return 0
}

# Step 2: Check GPU
check_gpu() {
    log_info "Checking GPU availability..."
    echo ""
    
    python3 -c "
import torch
if torch.cuda.is_available():
    print(f'  CUDA: Available (v{torch.version.cuda})')
    print(f'  GPU: {torch.cuda.get_device_name(0)}')
    print(f'  VRAM: {torch.cuda.get_device_properties(0).total_mem / (1024**3):.1f} GB')
    print(f'  Devices: {torch.cuda.device_count()}')
else:
    print('  CUDA: Not available')
    print('  Falling back to CPU (very slow for training)')
" 2>/dev/null || {
        log_warn "PyTorch not installed or CUDA not available"
        return 1
    }
    
    echo ""
    return 0
}

# Step 3: Install Python dependencies
install_dependencies() {
    log_info "Installing Python dependencies..."
    echo ""
    
    pip3 install --quiet \
        torch --index-url https://download.pytorch.org/whl/cu118 \
        transformers \
        peft \
        datasets \
        accelerate \
        bitsandbytes \
        trl
    
    log_success "Python dependencies installed"
    echo ""
}

# Step 4: Generate training data
generate_data() {
    log_info "Generating training data..."
    echo ""
    
    cd "$PROJECT_ROOT"
    
    if [ ! -d "data/processed" ]; then
        log_error "Processed data not found at data/processed/"
        log_info "Run data processing first: pnpm run knowledge:process"
        return 1
    fi
    
    npx tsx tools/fine-tune-generator.ts \
        --input ./data/processed \
        --output ./data/training \
        --max-samples 50000
    
    log_success "Training data generated"
    echo ""
}

# Step 5: Validate training data
validate_data() {
    log_info "Validating training data..."
    echo ""
    
    if [ ! -f "$TRAINING_DATA" ]; then
        log_error "Training data not found at: $TRAINING_DATA"
        log_info "Run: bash scripts/fine-tune.sh generate"
        return 1
    fi
    
    python3 -c "
import json
import sys

with open('$TRAINING_DATA', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Total samples: {len(data)}')

# Validate structure
required_fields = {'instruction', 'input', 'output'}
valid = 0
invalid = 0

for i, sample in enumerate(data):
    if required_fields.issubset(sample.keys()):
        valid += 1
    else:
        invalid += 1
        if invalid <= 3:
            print(f'  Sample {i} missing fields: {required_fields - sample.keys()}')

print(f'Valid: {valid}, Invalid: {invalid}')

if invalid > len(data) * 0.1:
    print(f'Warning: {invalid/len(data)*100:.1f}% samples are invalid')
    sys.exit(1)
else:
    print(f'Data quality: {valid/len(data)*100:.1f}% valid')
"
    
    local exit_code=$?
    echo ""
    
    if [ $exit_code -eq 0 ]; then
        log_success "Training data validated"
    else
        log_error "Training data validation failed"
    fi
    
    return $exit_code
}

# Step 6: Run training
run_training() {
    log_info "Starting fine-tuning..."
    echo ""
    
    cd "$PROJECT_ROOT"
    
    python3 scripts/fine-tune.py \
        --data "$TRAINING_DATA" \
        --output "$MODEL_OUTPUT" \
        --train \
        --quantized
    
    local exit_code=$?
    echo ""
    
    if [ $exit_code -eq 0 ]; then
        log_success "Training completed successfully"
        log_info "Model saved to: $MODEL_OUTPUT"
        log_info "To use the model:"
        log_info "  1. Update config.ts with model path: $MODEL_OUTPUT"
        log_info "  2. Restart the server"
    else
        log_error "Training failed"
    fi
    
    return $exit_code
}

# Step 7: Check training status
check_status() {
    log_info "Checking training status..."
    echo ""
    
    cd "$PROJECT_ROOT"
    
    python3 scripts/fine-tune.py --status --output "$MODEL_OUTPUT"
}

# Step 8: Run DPO training
run_dpo_training() {
    log_info "Starting DPO fine-tuning..."
    echo ""
    
    cd "$PROJECT_ROOT"
    
    if [ ! -f "$DPO_DATA" ]; then
        log_error "DPO data not found at: $DPO_DATA"
        log_info "Please collect DPO data in Studio first"
        return 1
    fi
    
    python3 scripts/dpo-train.py \
        --data "$DPO_DATA" \
        --output "$DPO_MODEL_OUTPUT" \
        --train \
        --quantized
    
    local exit_code=$?
    echo ""
    
    if [ $exit_code -eq 0 ]; then
        log_success "DPO training completed successfully"
        log_info "DPO model saved to: $DPO_MODEL_OUTPUT"
        log_info "To use the DPO model:"
        log_info "  1. Update config.ts with DPO model path: $DPO_MODEL_OUTPUT"
        log_info "  2. Restart the server"
    else
        log_error "DPO training failed"
    fi
    
    return $exit_code
}

# Step 9: Check DPO training status
check_dpo_status() {
    log_info "Checking DPO training status..."
    echo ""
    
    cd "$PROJECT_ROOT"
    
    python3 scripts/dpo-train.py --status --output "$DPO_MODEL_OUTPUT"
}

# Main execution
main() {
    local mode="${1:-check}"
    
    echo ""
    echo "============================================================"
    echo "  NovelForge Fine-tune Script"
    echo "============================================================"
    echo ""
    echo "Mode: $mode"
    echo ""
    
    case $mode in
        check)
            check_prerequisites
            check_gpu
            ;;
        generate)
            check_prerequisites
            generate_data
            validate_data
            ;;
        train)
            check_prerequisites
            check_gpu
            validate_data
            run_training
            ;;
        dpo)
            check_prerequisites
            check_gpu
            run_dpo_training
            ;;
        dpo-status)
            check_dpo_status
            ;;
        full)
            check_prerequisites
            check_gpu
            generate_data
            validate_data
            run_training
            ;;
        status)
            check_status
            ;;
        *)
            echo "Usage: bash scripts/fine-tune.sh [check|generate|train|dpo|dpo-status|full|status]"
            echo ""
            echo "Modes:"
            echo "  check      - Check prerequisites and GPU"
            echo "  generate   - Generate and validate training data"
            echo "  train      - Validate data and run training"
            echo "  dpo        - Run DPO fine-tuning with collected data"
            echo "  dpo-status - Check existing DPO training status"
            echo "  full       - Full pipeline (check + generate + train)"
            echo "  status     - Check existing training status"
            exit 1
            ;;
    esac
    
    echo ""
    echo "============================================================"
    echo "  Done"
    echo "============================================================"
    echo ""
}

main "$@"
