#!/bin/bash
# NovelForge One-Click Install (Linux/macOS)
set -e

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║      NovelForge 一键安装向导             ║"
echo "  ║   AI 辅助长篇网文创作工作台 v3.5        ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Check Node.js
echo "[1/4] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js not found!"
    echo "  Please install Node.js v20+ from https://nodejs.org"
    exit 1
fi
echo "  [OK] Node.js: $(node --version)"

# Check pnpm
echo "[2/4] Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
    echo "  Installing pnpm..."
    npm install -g pnpm
fi
echo "  [OK] pnpm: $(pnpm --version)"

# Install dependencies
echo "[3/4] Installing dependencies..."
cd "$(dirname "$0")"
if [ -d "node_modules" ]; then
    echo "  [OK] Dependencies already installed"
else
    pnpm install
fi

# Initialize
echo "[4/4] Initializing..."
mkdir -p data workspace
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
fi

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║          Installation Complete! ✨       ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "  1. Run ./start.sh to start services"
echo "  2. Open http://localhost:3000/setup"
echo "  3. Follow the setup wizard"
echo ""
