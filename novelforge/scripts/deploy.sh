#!/bin/bash

# NovelForge Deployment Script
# Usage: bash scripts/deploy.sh

set -e

echo "=== NovelForge Deployment Script ==="
echo ""

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "Node.js version: $NODE_VERSION"

# Check pnpm (corepack enables it automatically on Node >= 16.9)
echo "Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found — enabling via corepack..."
    corepack enable pnpm || { echo "Error: pnpm/corepack is required"; exit 1; }
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Installing frontend dependencies..."
cd studio
pnpm install --frozen-lockfile
cd ..

# Create directories
echo ""
echo "Creating directories..."
mkdir -p workspace
mkdir -p data/raw-books
mkdir -p data/processed
mkdir -p data/training

# Create .env if not exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "Please edit .env and add your DEEPSEEK_API_KEY"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "To start the application:"
echo "  1. Edit .env and add your API key"
echo "  2. Run: pnpm run dev"
echo "  3. Open http://localhost:3000"
echo ""
