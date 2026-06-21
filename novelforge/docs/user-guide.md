# NovelForge 用户指南

## 快速开始

### 1. 安装依赖

```bash
cd novelforge
pnpm install
cd studio
pnpm install
cd ..
```

### 2. 配置环境

复制 `.env.example` 为 `.env`，填入你的 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=your_api_key_here
```

### 3. 启动服务

```bash
# 一键启动（推荐）
pnpm dev

# 或分别启动
# 启动后端
pnpm dev:backend

# 启动前端（新终端）
pnpm dev:frontend
```

### 4. 访问应用

打开浏览器访问 http://localhost:3000

---

## 功能说明

### 创建新书

1. 点击书架页的"+ 创建新书"
2. 填写书名、题材、核心设定
3. 点击"创建"

### 写下一章

1. 进入作品工作台
2. 点击"写下一章"
3. 等待系统生成
4. 审阅大纲，点击"批准"
5. 等待章节生成完成
6. 审阅最终结果

### 风格管理

1. 进入作品设置
2. 上传3-5章旧稿
3. 点击"提取风格"
4. 系统自动学习你的写作风格

### 导出作品

1. 点击"导出"
2. 选择格式（TXT/DOCX/PDF/EPUB）
3. 点击"导出"

---

## 常见问题

### Q: API调用失败？

A: 检查 `.env` 中的 `DEEPSEEK_API_KEY` 是否正确。

### Q: 生成速度慢？

A: 首次生成需要加载模型，后续会更快。也可以配置本地模型加速。

### Q: 如何微调模型？

A: 参考 `scripts/fine-tune.sh` 脚本。
