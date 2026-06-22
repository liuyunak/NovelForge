# NovelForge v3.5

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/node-%3E%3D20-green.svg" alt="Node.js >=20">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
</p>

<p align="center">
  <b>AI 辅助长篇网文创作工作台</b><br>
  不替代你写作，而是帮你执行——你负责创意和决策，AI 负责生成草稿和检查质量。
</p>

---

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 🧠 **全文记忆** | DeepSeek 1M 上下文，50 章+一致性不衰减 |
| ✍️ **风格迁移** | 从你的旧稿中提取风格指纹，让 AI 学习你的文风 |
| 🔀 **多供应商** | 支持 DeepSeek / OpenAI / Ollama / llama.cpp / LM Studio |
| 🏗️ **DAG 并行编排** | 10+ Agent 协作，35-60 秒生成一章 |
| 🛡️ **双层审计** | FastAudit 规则引擎 + DeepAudit LLM 审计 |
| 🎨 **一键封面** | 根据小说内容自动生成封面图 |
| 🎬 **短剧导出** | 章节转短剧/漫剧剧本格式 |
| 💰 **低成本** | 云端模式仅 $2-4/月 |

## 🚀 快速开始（3 步）

### Windows 用户（推荐）

```bash
# 第 1 步：双击 install.bat
#   自动检查环境、安装依赖、初始化项目

# 第 2 步：双击 start.bat
#   启动服务，浏览器自动打开

# 第 3 步：在配置向导中完成设置
#   创建管理员账号 → 配置 AI 供应商 → 完成！
```

### macOS / Linux 用户

```bash
# 第 1 步：安装依赖
chmod +x install.sh
./install.sh

# 第 2 步：启动服务
chmod +x start.sh
./start.sh

# 第 3 步：访问 http://localhost:3000/setup
#   在配置向导中完成设置
```

### Docker 用户

```bash
docker compose up -d
# 访问 http://localhost:3000/setup
```

## 📋 系统要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| 操作系统 | Windows 10+ / macOS 12+ / Ubuntu 20+ | - |
| Node.js | v20.0 | v20 LTS |
| 内存 | 8 GB | 16 GB |
| 磁盘 | 5 GB | 10 GB |
| GPU（可选） | - | RTX 3070（本地微调用） |

## 🛠️ 技术栈

- **后端**: TypeScript + Hono + SQLite (via sql.js)
- **前端**: React + Vite + TailwindCSS + Zustand
- **AI**: Multi-Agent 协作管线 (Planner / Writer / DeepAudit / Polisher / Analyst)
- **认证**: JWT + 密码哈希 (PBKDF2-SHA512)

## 📂 项目结构

```
novelforge/
├── src/              # 后端源码
│   ├── agents/       # AI 智能体
│   ├── core/         # 核心管线与服务
│   ├── api/          # REST API 路由
│   ├── middleware/   # 认证中间件
│   └── state/        # 状态管理
├── studio/           # 前端应用 (React)
│   └── src/
│       ├── components/  # UI 组件
│       ├── pages/       # 页面组件
│       └── stores/      # Zustand 状态
├── docs/             # 文档
├── scripts/          # 工具脚本
├── data/             # 运行时数据
├── workspace/        # 创作数据
├── install.bat       # Windows 一键安装
├── start.bat         # Windows 一键启动
├── Dockerfile        # Docker 镜像
└── docker-compose.yml
```

## 🎮 使用流程

```
1. 打开书架 → 创建新书（6 步问卷）
2. 进入工作台 → 点击 [写下一章]
3. AI 生成章纲 → 你审批 ✋
4. AI 流式生成正文 → 你实时查看
5. AI 快速检查 + 深度审计 → 你决定如何处理 ✋
6. AI 提取事实 + 润色
7. 你最终审阅并发布 ✋

总耗时：约 35-60 秒 | 人工决策点：3 个
```

## ⚙️ 配置

所有配置通过 **Web 界面** 完成，无需手动编辑文件：

配置项 | 路径
-------|------
AI 供应商 | 设置 → 🔌 AI 供应商
Agent 路由 | 设置 → 🔀 Agent 路由
风格管理 | 工作台 → 风格管理
封面生成 | 作品 → 导出 → 生成封面

## 🧪 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 代码检查
pnpm lint
```

## 📚 文档

- **[用户操作手册 (Word)](docs/NovelForge_用户操作手册_v3.5.docx)** — 10 章完整操作指南
- **[快速入门](QUICKSTART.md)** — 5 分钟快速上手
- **[贡献指南](CONTRIBUTING.md)** — 如何参与开发

## 🤝 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与。

提交 Issue、PR、文档改进、Bug 报告都欢迎！

## 📄 许可证

[MIT License](LICENSE) — 可自由使用、修改、分发。

## 🙏 致谢

- [DeepSeek](https://deepseek.com) — 高性价比 AI API
- [Hono](https://hono.dev) — 轻量级 Web 框架
- [React](https://react.dev) — UI 框架
- [TailwindCSS](https://tailwindcss.com) — 样式框架

---

<p align="center">
  <b>AI 执行，人工决策</b><br>
  你始终掌握创作的控制权 ✍️
</p>
