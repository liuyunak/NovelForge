#!/bin/bash

# NovelForge 启动脚本 (Linux/macOS)
# 一键启动前后端服务

set -e

echo "========================================"
echo "  NovelForge 启动服务"
echo "========================================"
echo ""

# 进入项目目录
cd "$(dirname "$0")/novelforge"

# 检查是否正在运行
if [ -f ".pids/backend.pid" ]; then
    BACKEND_PID=$(cat .pids/backend.pid)
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "[提示] 后端服务已在运行（PID: $BACKEND_PID）"
    else
        rm -f .pids/backend.pid
    fi
fi

if [ -f ".pids/frontend.pid" ]; then
    FRONTEND_PID=$(cat .pids/frontend.pid)
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "[提示] 前端服务已在运行（PID: $FRONTEND_PID）"
    else
        rm -f .pids/frontend.pid
    fi
fi

# 启动后端
echo "[1/2] 启动后端服务（端口 3001）..."
tsx src/index.ts &
BACKEND_PID=$!
echo $BACKEND_PID > .pids/backend.pid
echo "[成功] 后端服务已启动，PID: $BACKEND_PID"

# 启动前端
echo "[2/2] 启动前端服务（端口 3000）..."
cd studio
pnpm dev &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../.pids/frontend.pid
echo "[成功] 前端服务已启动，PID: $FRONTEND_PID"
cd ..

echo ""
echo "========================================"
echo "  服务启动完成！"
echo "========================================"
echo ""
echo "  前端：http://localhost:3000"
echo "  后端：http://localhost:3001"
echo ""
echo "按 Ctrl+C 停止服务"
echo "或运行 ./stop.sh 停止"
echo ""

# 等待用户中断
wait
