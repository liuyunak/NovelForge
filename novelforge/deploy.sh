#!/usr/bin/env sh
# ============================================================
# NovelForge Production Deploy Script
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "==========================================="
echo " NovelForge Production Deploy"
echo "==========================================="
echo "Project: $PROJECT_DIR"
echo ""

# ---- Check prerequisites ----
check_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "[ERROR] $1 not found. Please install it first."
        exit 1
    fi
}

check_command node
check_command pnpm

NODE_VERSION=$(node -v)
PNPM_VERSION=$(pnpm -v)
echo "[OK] Node $NODE_VERSION, pnpm $PNPM_VERSION"
echo ""

# ---- Step 1: Install dependencies ----
echo "[1/5] Installing dependencies..."
pnpm install --frozen-lockfile
echo "[OK] Dependencies installed"
echo ""

# ---- Step 2: Build backend ----
echo "[2/5] Building backend..."
pnpm build
echo "[OK] Backend built"
echo ""

# ---- Step 3: Build frontend ----
echo "[3/5] Building frontend..."
cd "$PROJECT_DIR/studio"
pnpm install --frozen-lockfile
pnpm build
cd "$PROJECT_DIR"
echo "[OK] Frontend built"
echo ""

# ---- Step 4: Verify ----
echo "[4/5] Verifying build..."
if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "[ERROR] Backend dist/ not found"
    exit 1
fi
if [ ! -d "$PROJECT_DIR/studio/dist" ]; then
    echo "[ERROR] Frontend studio/dist/ not found"
    exit 1
fi

# Check critical files
REQUIRED_FILES="dist/server.js dist/api/index.js dist/state/schemas/index.js"
for f in $REQUIRED_FILES; do
    if [ ! -f "$PROJECT_DIR/$f" ]; then
        echo "[WARN] Missing expected file: $f"
    fi
done

echo "[OK] Build verified"
echo ""

# ---- Step 5: Create directories ----
echo "[5/5] Creating runtime directories..."
mkdir -p "$PROJECT_DIR/workspace"
mkdir -p "$PROJECT_DIR/data/training"
mkdir -p "$PROJECT_DIR/data/processed"
mkdir -p "$PROJECT_DIR/models"
mkdir -p "$PROJECT_DIR/logs"

# Check .env
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "[WARN] No .env file found. Create one from .env.example if available."
    echo "      Required: DEEPSEEK_API_KEY or OPENAI_API_KEY"
fi

echo "[OK] Directories created"
echo ""

echo "==========================================="
echo " Build Complete!"
echo "==========================================="
echo ""
echo "Start production server:"
echo "  node dist/server.js"
echo ""
echo "Start with Docker:"
echo "  docker compose up -d"
echo ""
echo "Default port: 3920"
echo "Health check: http://localhost:3920/api/health"
