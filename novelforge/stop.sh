#!/bin/bash

# NovelForge 停止脚本 (Linux/macOS)
# 精准停止前后端服务

set -e

echo "========================================"
echo "  NovelForge 停止服务"
echo "========================================"
echo ""

cd "$(dirname "$0")/novelforge"

# 停止后端
if [ -f ".pids/backend.pid" ]; then
    BACKEND_PID=$(cat .pids/backend.pid)
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "[1/2] 停止后端服务（PID: $BACKEND_PID）..."
        kill "$BACKEND_PID"
        echo "[成功] 后端服务已停止"
    else
        echo "[提示] 后端服务未在运行"
    fi
    rm -f .pids/backend.pid
else
    echo "[提示] 未找到后端 PID 文件"
fi

# 停止前端
if [ -f ".pids/frontend.pid" ]; then
    FRONTEND_PID=$(cat .pids/frontend.pid)
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "[2/2] 停止前端服务（PID: $FRONTEND_PID）..."
        kill "$FRONTEND_PID"
        echo "[成功] 前端服务已停止"
    else
        echo "[提示] 前端服务未在运行"
    fi
    rm -f .pids/frontend.pid
else
    echo "[提示] 未找到前端 PID 文件"
fi

echo ""
echo "========================================"
echo "  服务已停止"
echo "========================================"
echo ""
echo "如需强制终止，可运行："
echo "  lsof -ti:3000 | xargs kill -9"
echo "  lsof -ti:3001 | xargs kill -9"
echo ""
