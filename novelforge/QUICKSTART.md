# NovelForge 快速入门指南

> 5 分钟开始你的 AI 辅助创作之旅

---

## 🚀 超快速开始（3 步）

### 第 1 步：运行部署脚本

**Windows 用户：**
```bash
双击 deploy.bat
```

**macOS/Linux 用户：**
```bash
chmod +x deploy.sh
./deploy.sh
```

### 第 2 步：配置 API Key

编辑 `.env` 文件，填入你的 DeepSeek API Key：

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> 💡 如何获取 API Key？
> 1. 访问 https://platform.deepseek.com
> 2. 注册账号
> 3. 进入"API Keys"页面
> 4. 创建新的 API Key
> 5. 复制并粘贴到 `.env` 文件中

### 第 3 步：启动服务

**Windows 用户：**
```bash
双击 start.bat
```

**macOS/Linux 用户：**
```bash
bash start.sh
```

浏览器会自动打开 http://localhost:3000

---

## 📖 详细操作

### 完整安装步骤（约 15 分钟）

#### 1. 安装 Node.js

1. 访问 https://nodejs.org
2. 下载 LTS 版本（推荐 v20.x）
3. 运行安装程序，一直点"下一步"
4. 验证安装：
   ```bash
   node --version
   # 应该显示 v20.x.x
   ```

#### 2. 克隆项目

```bash
git clone https://github.com/your-repo/novelforge.git
cd novelforge
```

或直接下载 ZIP 包并解压。

#### 3. 运行一键部署

```bash
# Windows
deploy.bat

# macOS/Linux
chmod +x deploy.sh
./deploy.sh
```

#### 4. 开始创作

1. 访问 http://localhost:3000
2. 点击"[+ 创建新书]"
3. 完成 6 步问卷
4. 点击"[写下一章]"
5. 享受 AI 辅助创作！

---

## 🎯 核心功能速览

### 1. AI 供应商配置

**设置 → 🔌 AI 供应商**

- 支持 DeepSeek、OpenAI、Ollama、llama.cpp、LM Studio
- 一键预设模板，秒级配置
- 可为不同 Agent 选择不同供应商

### 2. 创建作品

**书架 → [+ 创建新书]**

填写 6 步问卷：
- 书名
- 题材（玄幻修仙/都市重生/科幻末世等）
- 核心设定
- 主要角色
- 世界观
- 写作目标

### 3. 写下一章

点击 **[写下一章]**，系统自动执行：

1. **Planner** 生成章纲（2 秒）
2. **你审批大纲** ✋
3. **Writer** 流式生成正文（15-30 秒）
4. **FastAudit** 快速检查（3 秒）
5. **DeepAudit** 深度审计（8-15 秒）
6. **你决定处理方式** ✋
7. **Analyst** 提取事实（5 秒）
8. **Polisher** 润色（5 秒）
9. **更新全文记忆**（1 秒）
10. **你最终审阅** ✋

**总耗时：约 35-60 秒**

### 4. 导出发布

- 支持 TXT、DOCX、PDF、EPUB 格式
- 一键生成封面
- 导出短剧/漫剧剧本

---

## 💰 成本估算

| 方案 | 月费 | 说明 |
|------|------|------|
| 纯云端 | $2-4 | 使用 DeepSeek/OpenAI |
| 混合模式 | $1-2 | 云端+本地搭配 |
| 纯本地 | $0 | 全部使用本地模型 |

---

## ❓ 常见问题

### Q1: 服务无法启动？

**A:** 运行 `stop.bat` 停止服务，或检查端口 3000/3001 是否被占用。

### Q2: API 调用失败？

**A:** 检查 `.env` 文件中的 `DEEPSEEK_API_KEY` 是否正确。

### Q3: 生成内容质量不佳？

**A:** 
- 上传更多风格样本
- 调整 Temperature 参数
- 使用本地微调模型

### Q4: 如何停止服务？

**A:** 
- Windows: 双击 `stop.bat`
- macOS/Linux: `./stop.sh`

---

## 📚 更多资源

- **完整操作手册**: `docs/NovelForge_用户操作手册_v3.5.docx`
- **项目文档**: `README.md`
- **问题反馈**: GitHub Issues

---

## 🎉 开始创作吧！

记住：**AI 执行，人工决策**。你始终掌握创作的控制权。

祝你创作愉快！✍️
