# NovelForge v3.5 — AI 辅助长篇网文创作工作台（最终版）

> **开发模式**：从零开发  
> **目标平台**：Node.js + React + DeepSeek V4 + 本地微调模型  
> **协议**：MIT 开源，100% 自主知识产权  
> **适用场景**：10万字以上长篇网文，单人作者创作  
> **代码量估算**：30,000–38,000 行  
> **开发周期**：30–36 周  
> **核心定位**：AI执行，人工决策 — 辅助创作而非替代创作  
> **月度成本**：$2-4/月（优化后）

---

## 目录

1. [项目概述](#1-项目概述)
2. [核心能力](#2-核心能力)
3. [技术架构](#3-技术架构)
4. [DAG并行编排引擎](#4-dag并行编排引擎)
5. [Agent 规格说明](#5-agent-规格说明)
6. [全文记忆架构](#6-全文记忆架构)
7. [风格迁移引擎](#7-风格迁移引擎)
8. [数据架构](#8-数据架构)
9. [知识增强层](#9-知识增强层)
10. [生成质量增强](#10-生成质量增强)
11. [去AI味四层架构](#11-去ai味四层架构)
12. [写作规则引擎](#12-写作规则引擎)
13. [本地模型微调方案](#13-本地模型微调方案)
14. [API 设计](#14-api-设计)
15. [前端页面设计](#15-前端页面设计)
16. [差异化功能](#16-差异化功能)
17. [用户使用流程](#17-用户使用流程)
18. [工作分解结构](#18-工作分解结构)
19. [开发计划](#19-开发计划)
20. [验收标准](#20-验收标准)
21. [风险评估](#21-风险评估)
22. [预期效果](#22-预期效果)
23. [成本分析](#23-成本分析)
24. [技术可行性分析](#24-技术可行性分析)
25. [附录](#25-附录)

---

## 1. 项目概述

### 1.1 项目定位（v3.5 最终版）

**核心定位**：一个**AI辅助**的网文创作工作台。作者在可视化界面中管理作品、规划大纲，AI负责执行生成，作者负责质量决策。完整创作流程人机协作完成。

**v3.5 核心突破**：

| 突破点 | 技术支撑 | 效果 |
|--------|---------|------|
| **全文记忆** | DeepSeek V4 1M上下文 | 50章+一致性，彻底解决衰减问题 |
| **风格迁移** | 作者旧稿提取+Prompt注入 | 个性化创作，学习你的风格 |
| **极致缓存** | Prompt静态前缀缓存 | 成本降低50-70% |
| **/dream整合** | 每10章自动整合记忆 | AI味进一步降低 |

**设计原则**：

```
原则1: 作者至上
  系统提供信息和建议，作者做最终决定

原则2: 诚实预期
  不夸大AI能力，明确告知局限性

原则3: 渐进增强
  核心功能优先，高级功能可选

原则4: 破格友好
  系统识别"规则例外"请求，作者可随时打破

原则5: 成本可控
  Prompt缓存+本地模型，月度$2-4
```

### 1.2 版本演进

| 版本 | 核心变化 | 综合评分 |
|------|---------|---------|
| v2.0 | 原始方案，7-Agent串行 | 7.5/10 |
| v3.0 | DAG并行+三层记忆+分层审计 | 7.78/10 |
| **v3.5** | **全文记忆+风格迁移+极致缓存+差异化功能** | **8.37/10** |

### 1.3 目标用户

- 网文作者（日更 4000–6000 字）
- 10 万字以上长篇创作
- 有一台 RTX 3070 8GB 级别电脑（可选）
- 愿意为创作质量投入少量 API 费用（$2-4/月）
- 有一定数量的参考网文文本（可选）
- **核心需求**：想要AI帮忙执行，但保持创作决策权

---

## 2. 核心能力

### 2.1 人机协作创作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    人机协作创作流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  作者决策点1: 创建新书 + 风格注入                                │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  作者: 完成6步问卷，上传3-5章旧稿（可选）            │       │
│  │  系统: 自动生成设定 + 提取风格指纹                    │       │
│  └─────────────────────────────────────────────────────┘       │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: Planner生成章纲 + 场景卡                      │   │
│  │  模型: DeepSeek V4-Flash（1M上下文）                    │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  作者决策点2: 大纲审批                                          │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  作者: 审阅大纲，决定是否调整                          │       │
│  │  选项: [批准] [修改大纲] [跳过本章]                    │       │
│  └────────────────────┬────────────────────────────────┘       │
│                       │ 批准                                    │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: Composer装配上下文                             │   │
│  │  · 全文记忆: 最近20章全文（V4 1M上下文）                │   │
│  │  · 风格指纹: 动态注入Writer                             │   │
│  │  · 作者意图: 捕获并注入                                 │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: Writer分段生成（流式输出）                    │   │
│  │  模型: 本地Qwen3.6-35B（优先）或 V4-Pro                │   │
│  │  场景1 → 自检 → 场景2 → 自检 → 场景3 → 自检            │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: FastAudit快速检查（规则引擎，零LLM）         │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: DeepAudit聚焦审计                             │   │
│  │  模型: DeepSeek V4-Pro（1M上下文，全文审计）            │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  作者决策点3: 审计后介入                                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  作者: 查看审计报告，决定如何处理                      │       │
│  │  选项: [继续] [人工修改] [标记问题] [重写某段]         │       │
│  └────────────────────┬────────────────────────────────┘       │
│                       │ 继续                                    │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: Analyst提取事实 + 更新状态                    │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: Polisher去AI味 + 润色                        │   │
│  │  · 四层去AI味架构                                       │   │
│  │  · 风格指纹校验                                         │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  作者决策点4: 最终审阅                                          │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  作者: 审阅终稿，决定发布或修改                        │       │
│  │  选项: [通过发布] [手动修改] [重写]                    │       │
│  └────────────────────┬────────────────────────────────┘       │
│                       │ 通过                                    │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统自动: 更新全文记忆                                  │   │
│  │  · 新章节加入全文记忆                                    │   │
│  │  · 每10章触发/dream整合                                 │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│                   章节发布                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 全文记忆架构（核心突破）

```
┌─────────────────────────────────────────────────────────────────┐
│                    全文记忆架构（v3.5 核心）                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  主路径: 全文记忆（在线模式）                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  DeepSeek V4 1M上下文                                    │   │
│  │                                                          │   │
│  │  Prompt结构:                                            │   │
│  │  ┌─────────────────────────────────────────────┐       │   │
│  │  │ [STATIC - 永久缓存]                          │       │   │
│  │  │   写作铁律（5000字）                          │       │   │
│  │  │   风格指纹（2000字）                          │       │   │
│  │  │   角色档案（3000字）                          │       │   │
│  │  │   世界观设定（4000字）                        │       │   │
│  │  │   // 约14万Token，首次调用后永久缓存         │       │   │
│  │  ├─────────────────────────────────────────────┤       │   │
│  │  │ [DYNAMIC - 每次变化]                          │       │   │
│  │  │   最近20章全文（~15万Token）                  │       │   │
│  │  │   当前场景卡（800字）                         │       │   │
│  │  │   作者意图（200字）                           │       │   │
│  │  │   // 实际成本 $0.021/次                       │       │   │
│  │  └─────────────────────────────────────────────┘       │   │
│  │                                                          │   │
│  │  效果:                                                  │   │
│  │  · 50章+一致性，无衰减                                 │   │
│  │  · 无需向量检索                                         │   │
│  │  · 成本 $0.021/章                                      │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Fallback: 三层记忆（本地模型离线模式）                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Layer 1: Working Memory (~2000t) — 自动注入Writer       │   │
│  │  Layer 2: Episodic Memory (~4000t) — 语义检索            │   │
│  │  Layer 3: Semantic Memory — 按需检索（Story Bible）      │   │
│  │                                                          │   │
│  │  适用场景: 无网络、本地模型推理时                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  增强: /dream 记忆整合机制                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  触发条件: 每10章自动触发                                │   │
│  │                                                          │   │
│  │  处理流程:                                               │   │
│  │  1. 收集最近10章的章节摘要、事件、角色变化              │   │
│  │  2. 调用LLM整合为"故事简报"（~2000字）                 │   │
│  │  3. 合并、去重、验证路径有效性                          │   │
│  │  4. 更新Working Memory的summary字段                     │   │
│  │                                                          │   │
│  │  效果:                                                  │   │
│  │  · 减少AI味累积                                         │   │
│  │  · 保持长期一致性                                       │   │
│  │  · 每10章成本 ~$0.02                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 风格迁移引擎（个性化增强）

```
┌─────────────────────────────────────────────────────────────────┐
│                    风格迁移引擎（v3.5 新增）                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: 风格提取（一次性，成本~$0.02）                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  输入: 作者上传3-5章旧稿                                │   │
│  │                                                          │   │
│  │  提取维度:                                               │   │
│  │  · 句式模式（短句占比、复合句复杂度）                    │   │
│  │  · 常用动词/名词集合                                     │   │
│  │  · 对话标签风格（"道"、"说"、无标签）                   │   │
│  │  · 修辞密度                                              │   │
│  │  · 节奏特征                                              │   │
│  │  · 情感表达方式                                          │   │
│  │                                                          │   │
│  │  输出: style_fingerprint.json                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Phase 2: 动态注入（每次生成，零成本）                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Writer Prompt注入:                                      │   │
│  │                                                          │   │
│  │  [风格指纹-作者偏好]                                     │   │
│  │  - 偏好四字短句，单句不超过15字                         │   │
│  │  - 避免"然而""但是"，用"可""却"代替                   │   │
│  │  - 对话中少用"说道"，直接动作+引号                     │   │
│  │  - 环境描写偏好: 视觉+听觉为主，少用嗅觉              │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Phase 3: 偏离检测+修正（自动，零成本）                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  生成后检测:                                             │   │
│  │  · 句长偏差 > 30% → 触发二次改写                        │   │
│  │  · 对话标签风格不一致 → 标记提醒                        │   │
│  │  · 修辞密度偏离 → 调整建议                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 DAG并行编排架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAG并行编排引擎                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户点击"写下一章"                                             │
│            │                                                    │
│            ▼                                                    │
│     ┌──────────┐                                                │
│     │ Planner   │  ~2s（V4-Flash）                              │
│     └────┬─────┘                                                │
│          │ 输出: 章纲 + 场景卡                                   │
│          │                                                      │
│          ▼                                                      │
│     ┌───────────────────────────────────────┐                  │
│     │          并行分叉（同时执行）           │                  │
│     ├───────────┬───────────┬───────────────┤                  │
│     │ Composer  │ PreAudit  │ ContextPrep   │                  │
│     │ 全文记忆  │ 快速门禁  │ 前文摘要装配  │                  │
│     │ ~500ms    │ ~1s(代码) │ ~200ms        │                  │
│     └─────┬─────┴─────┬─────┴───────┬───────┘                  │
│           │           │             │                           │
│           └───────────┼─────────────┘                           │
│                       │ 合并上下文包                            │
│                       ▼                                         │
│               ┌──────────────┐                                  │
│               │ Writer        │  ~15-30s（流式输出）             │
│               │ 分段场景生成  │                                  │
│               │ 风格注入      │                                  │
│               └──────┬───────┘                                  │
│                      │                                          │
│                      ▼                                          │
│               ┌──────────────┐                                  │
│               │ FastAudit     │  ~3s（规则引擎，零LLM）          │
│               │ 12项快速检查  │                                  │
│               └──────┬───────┘                                  │
│                      │                                          │
│               ┌──────▼───────┐                                  │
│               │ DeepAudit     │  ~8-15s（V4-Pro，1M上下文）      │
│               │ 全文审计      │                                  │
│               └──────┬───────┘                                  │
│                      │                                          │
│               ┌──────▼───────┐                                  │
│               │ Analyst       │  ~5s                             │
│               └──────┬───────┘                                  │
│                      │                                          │
│               ┌──────▼───────┐                                  │
│               │ Polisher      │  ~5s                             │
│               │ 风格校验      │                                  │
│               └──────┬───────┘                                  │
│                      │                                          │
│               ┌──────▼───────┐                                  │
│               │ MemoryUpdate  │  ~1s                             │
│               │ 全文记忆更新  │                                  │
│               └──────────────┘                                  │
│                                                                  │
│  总耗时: ~35-60s                                                │
│  用户感知: ~15s（Writer流式输出期间有内容显示）                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 技术架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层                                │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  书架    │ │ 工作台   │ │ 编辑器   │ │ 设置页   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │ 封面生成 │ │ 短剧导出 │ │ 风格管理 │                       │
│  └──────────┘ └──────────┘ └──────────┘                       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                        API网关层                                 │
│                                                                  │
│  Hono HTTP Server (Port 3001)                                   │
│  ├─ REST API（作品/章节/审计管理）                               │
│  ├─ SSE（实时进度推送 + 流式生成）                              │
│  └─ 静态文件服务（封面等）                                      │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    DAG编排引擎层                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  DAG Orchestrator                                         │   │
│  │  · 有向无环图定义                                         │   │
│  │  · 并行任务调度                                           │   │
│  │  · 依赖管理                                               │   │
│  │  · 审批节点暂停/恢复                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                        Agent 模块层                              │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│  │Planner  │ │Composer │ │Writer   │ │FastAudit│             │
│  │V4-Flash │ │代码+检索 │ │本地/V4  │ │规则引擎 │             │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│  │DeepAudit│ │Analyst  │ │Polisher │ │PreAudit │             │
│  │V4-Pro   │ │V4-Pro   │ │本地/Flash│ │代码     │             │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                         │
│  │CoverGen │ │ScriptExp│ │StyleExt │                         │
│  │封面生成 │ │短剧导出 │ │风格提取 │                         │
│  └─────────┘ └─────────┘ └─────────┘                         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                      知识增强层                                   │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ 写作规则库 │ │ 角色模式库 │ │ 情节结构库 │ │ 参考作品库 │  │
│  │ (动态权重) │ │ (JSON)     │ │ (JSON)     │ │ (向量DB)   │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐                                 │
│  │ AI检测规则 │ │ 平台格式模板│                                 │
│  └────────────┘ └────────────┘                                 │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    记忆架构层                                     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  主路径: 全文记忆（V4 1M上下文，最近20章全文）           │   │
│  │  Fallback: 三层记忆（本地模型离线模式）                  │   │
│  │  /dream: 每10章自动整合记忆                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                      模型路由层                                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  DeepSeek V4生态（主）+ Kimi（备选）+ 本地模型（离线）   │   │
│  │  Prompt缓存优化（静态前缀，成本降低50-70%）             │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │  │ 本地微调模型  │  │ 本地基座模型  │  │ DeepSeek API │ │   │
│  │  │ (Qwen+LoRA)  │  │ (Qwen)       │  │ (V4 Pro/Flash│ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                      数据存储层                                   │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │  SQLite    │ │ JSON文件   │ │ 向量数据库  │ │ 章节文件   │  │
│  │ (记忆库)   │ │ (状态文件) │ │ (参考作品) │ │ (.md)      │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐                                 │
│  │ 封面文件   │ │ 剧本文件   │                                 │
│  │ (.png)     │ │ (.json)    │                                 │
│  └────────────┘ └────────────┘                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 技术栈明细

```
后端（TypeScript）：
  运行时:     Node.js 20 LTS
  HTTP框架:   Hono（轻量、高性能）
  数据库:     better-sqlite3（零配置）
  向量检索:   @xenova/transformers（bge-large-zh-v1.5）
  DAG编排:    自研（基于依赖图的任务调度器）
  校验:       Zod
  日志:       pino
  缓存:       node-cache（Prompt缓存）

前端（TypeScript）：
  构建:       Vite 5
  框架:       React 18
  样式:       Tailwind CSS 3
  图表:       Recharts（节奏曲线）
  关系图:     D3.js（伏笔/角色关系图）
  路由:       React Router 6
  状态管理:   Zustand
  流式渲染:   SSE + React streaming

AI相关：
  主模型:     DeepSeek V4 Pro/Flash（云端）
  本地模型:   Qwen3.6-35B-A3B + LoRA
  风格提取:   DeepSeek V4 / Claude 4（可选）
  封面生成:   Stable Diffusion API（可选）

微调相关（Python）：
  基座模型:   Qwen3.6-35B-A3B
  微调框架:   transformers + peft
  量化:       bitsandbytes（4-bit）
  训练:       QLoRA / DPO（后期）

测试：
  单元测试:   Vitest
  E2E测试:    Playwright（后续）

工具链：
  包管理:     pnpm
  代码规范:   Biome
  版本控制:   Git
```

---

## 4. DAG并行编排引擎

### 4.1 DAG定义

```typescript
// src/core/dag.ts

interface DAGNode {
  id: string;
  agent: string;
  dependencies: string[];
  parallel?: boolean;
  approvalRequired?: boolean;
  timeout?: number;
}

const NOVELFORGE_DAG: DAGDefinition = {
  nodes: [
    { id: 'planner', agent: 'Planner', dependencies: [], timeout: 30000 },
    { id: 'composer', agent: 'Composer', dependencies: ['planner'], parallel: true },
    { id: 'preaudit', agent: 'PreAudit', dependencies: ['planner'], parallel: true },
    { id: 'contextprep', agent: 'ContextPrep', dependencies: ['planner'], parallel: true },
    { id: 'writer', agent: 'Writer', dependencies: ['composer', 'preaudit', 'contextprep'], timeout: 60000 },
    { id: 'fastaudit', agent: 'FastAudit', dependencies: ['writer'], timeout: 5000 },
    { id: 'deepaudit', agent: 'DeepAudit', dependencies: ['fastaudit'], timeout: 30000 },
    { id: 'approval1', agent: 'HumanApproval', dependencies: ['deepaudit'], approvalRequired: true },
    { id: 'analyst', agent: 'Analyst', dependencies: ['approval1'], timeout: 10000 },
    { id: 'polisher', agent: 'Polisher', dependencies: ['analyst'], timeout: 10000 },
    { id: 'memoryupdate', agent: 'MemoryUpdate', dependencies: ['polisher'], timeout: 5000 },
    { id: 'approval2', agent: 'HumanApproval', dependencies: ['memoryupdate'], approvalRequired: true },
  ],
  edges: [
    ['planner', 'composer'],
    ['planner', 'preaudit'],
    ['planner', 'contextprep'],
    ['composer', 'writer'],
    ['preaudit', 'writer'],
    ['contextprep', 'writer'],
    ['writer', 'fastaudit'],
    ['fastaudit', 'deepaudit'],
    ['deepaudit', 'approval1'],
    ['approval1', 'analyst'],
    ['analyst', 'polisher'],
    ['polisher', 'memoryupdate'],
    ['memoryupdate', 'approval2'],
  ]
};
```

### 4.2 并行执行时序

```
时间轴 (秒)
0    2    4    6    8   10   15   20   25   30   35   40
│    │    │    │    │    │    │    │    │    │    │    │
├────┤ Planner (V4-Flash, ~2s)
     │
     ├─────────┤ 并行执行
     │ Composer │ (~500ms)
     │ PreAudit │ (~1s)
     │ CtxPrep  │ (~200ms)
     │
     ├────────────────────────────────────────────────────────────┤
     │                    Writer (流式输出, ~15-30s)               │
     │                    用户在此期间看到内容逐步出现              │
     ├────────────────────────────────────────────────────────────┤
                                                                    │
                                                                    ├────┤
                                                                    │FastAudit (~3s)
                                                                    │
                                                                    ├──────────────────┤
                                                                    │DeepAudit (~8-15s)
                                                                    │
                                                                    ├────────────┤
                                                                    │Analyst (~5s)
                                                                    │
                                                                    ├────────────┤
                                                                    │Polisher (~5s)
                                                                    │
                                                                    ├────┤
                                                                    │MemoryUpdate (~1s)
                                                                    │
                                                                    总计: ~35-50s
                                                                    用户感知: ~15s（Writer流式期间）
```

---

## 5. Agent 规格说明

### 5.1 总览

| # | Agent | 模型 | 温度 | 并行 | 耗时 | 缓存 |
|---|-------|------|------|------|------|------|
| 1 | Planner | V4-Flash | 0.3 | 否 | ~2s | 静态前缀缓存 |
| 2 | Composer | 无（代码） | — | 是 | ~500ms | — |
| 3 | PreAudit | 无（代码） | — | 是 | ~1s | — |
| 4 | ContextPrep | 无（代码） | — | 是 | ~200ms | — |
| 5 | Writer | **本地微调/V4-Pro** | 0.8 | 否 | ~15-30s | 静态前缀缓存 |
| 6 | FastAudit | 无（规则） | — | 否 | ~3s | — |
| 7 | DeepAudit | V4-Pro | 0.1 | 否 | ~8-15s | 静态前缀缓存 |
| 8 | Analyst | V4-Pro | 0.1 | 否 | ~5s | 静态前缀缓存 |
| 9 | Polisher | 本地/Flash | 0.3 | 否 | ~5s | 静态前缀缓存 |
| 10 | MemoryUpdate | 无（代码） | — | 否 | ~1s | — |
| 11 | StyleExtractor | V4/Claude4 | 0.1 | 否 | ~5s | — |
| 12 | CoverGenerator | V4-Flash+SD | 0.7 | 否 | ~10s | — |
| 13 | ScriptExporter | 无（规则） | — | 否 | ~2s | — |

### 5.2 Agent 1 — Planner（规划师）

**职责**：读卷纲 + 块纲 → 生成章纲 → 拆解场景卡

**模型**：DeepSeek V4-Flash（1M上下文，规划能力强）

**输入**：
- 当前卷纲 (volumes/volume_N.json)
- 当前块纲 (blocks/volume_N_block_M.json)
- 前一章摘要 (chapter_summaries.json[latest])
- Working Memory

**输出**：

Phase 1 — 章纲：
```json
{
  "chapter_number": 42,
  "title": "青云城拍卖会",
  "word_count_target": 3000,
  "core_event": "主角在拍卖会上与张家正面冲突，意外拍得古墓地图残片",
  "characters_in": ["林逸", "张明", "张三", "拍卖师"],
  "hooks_to_setup": [
    {"content": "古墓地图残片指向秘境", "expected_payoff_chapter": 50}
  ],
  "hooks_to_payoff": [],
  "subplot_touch": {
    "A线_复仇主线": "了解张家在青云城的经济实力",
    "B线_感情线": "无",
    "C线_势力建设": "获得第一桶金"
  },
  "satisfaction_preview": "抬价反杀 + 捡漏宝物 + 章末钩子"
}
```

Phase 2 — 场景卡：
```json
[
  {
    "scene_number": 1,
    "location": "青云城中央拍卖场·三楼贵宾室",
    "time": "大夏历156年深秋·午后",
    "atmosphere": "奢华压抑，暗流涌动",
    "characters_present": ["林逸", "张明", "拍卖师"],
    "pov_character": "林逸",
    "scene_goal": "拍下筑基丹材料，展示财力引起注意",
    "scene_conflict": "张明恶意抬价 → 林逸反制",
    "key_beats": [
      "林逸入场，张三提前告知张明也在",
      "筑基丹材料开拍，张明首次抬价",
      "林逸反手抬价张明想要的物品，逼其消耗资金",
      "张明被迫退出，林逸低价拍得目标物品",
      "张明离场时阴狠一瞥"
    ],
    "hooks_connection": ["首次展示主角的商业头脑，为后续商战埋线"],
    "paragraph_rhythm": [
      {"paragraphs": [1,2], "instruction": "环境描写+入场，短句快切"},
      {"paragraphs": [3,5], "instruction": "竞拍过程，对话为主节奏加快"},
      {"paragraphs": [6,7], "instruction": "反杀高潮，单句成段"}
    ],
    "word_count_estimate": 1200
  }
]
```

### 5.3 Agent 2 — Composer（编排师）

**职责**：全文记忆装配 + 知识库检索 → 装配上下文包

**特点**：纯代码实现，零 LLM 调用

**全文记忆装配逻辑**：

```typescript
async function composeWriterContext(
  chapterPlan: ChapterPlan,
  fullTextMemory: FullTextMemory,
  knowledgeBase: KnowledgeBase,
  authorStyle: StyleFingerprint
): Promise<WriterContext> {
  
  // 1. 获取最近20章全文（~15万Token）
  const recentChapters = await fullTextMemory.getRecentChapters(20);
  
  // 2. 检索知识库（风格参考）
  const styleReferences = await knowledgeBase.searchStyleReferences(
    chapterPlan.genre,
    chapterPlan.core_event
  );
  
  // 3. 组装上下文包
  return {
    // 静态部分（缓存）
    static: {
      writingRules: await loadWritingRules(chapterPlan.genre),
      styleFingerprint: authorStyle,
      characterProfiles: await loadCharacterProfiles(chapterPlan.characters_in),
      worldSettings: await loadWorldSettings()
    },
    // 动态部分
    dynamic: {
      fullText: recentChapters,  // 最近20章全文
      sceneCard: chapterPlan.scenes,
      authorIntent: await captureAuthorIntent(),
      styleReferences: styleReferences
    }
  };
}
```

### 5.4 Agent 5 — Writer（写手）

**职责**：注入风格指纹 + 写作铁律 + 全文记忆 → 分段生成初稿

**模型优先级**：
1. 本地微调模型（Qwen3.6-35B + LoRA）— 优先，免费
2. DeepSeek V4-Pro — 降级，$0.14/M tokens

**分段生成流程**：

```
场景1(1200字):
  Writer生成场景1 → 段级快速自检(代码) → 通过 → 缓存
                                          ↓ 不通过
                                       定点修改 → 再检

场景2(1000字):
  Writer生成场景2（携带场景1缓存作为上文）→ 自检 → 通过

场景3(800字):
  Writer生成场景3 → 自检 → 通过

全文拼装 → Polisher全局润色
```

**Prompt结构（缓存优化）**：

```
[STATIC - 永久缓存，首次调用后不重复计费]
  系统指令 + 写作铁律(5000字) + 风格指纹(2000字) + 角色档案(3000字) + 世界观(4000字)
  // 约14万Token

[DYNAMIC - 每次变化]
  最近20章全文(~15万Token) + 当前场景卡(800字) + 作者意图(200字)
  // 实际成本 $0.021/次

[作者风格注入]
  [风格指纹-作者偏好]
  - 偏好四字短句，单句不超过15字
  - 避免"然而""但是"，用"可""却"代替
  - 对话中少用"说道"，直接动作+引号
```

### 5.5 Agent 7 — DeepAudit（深度审计）

**职责**：聚焦式LLM审计，15维

**模型**：DeepSeek V4-Pro（1M上下文，可审计全文）

**输入**：
- 最近20章全文
- 当前章节
- MASTER_SETTING
- FastAudit检查结果

**15维审计**：

| 大类 | 维度 | 说明 |
|------|------|------|
| 角色 | 3 | 动机合理性、行为一致性、对话风格 |
| 世界 | 2 | 设定一致性、逻辑合理性 |
| 伏笔 | 2 | 伏笔状态、悬念强度 |
| 战力 | 2 | 战力等级、越级合理性 |
| 节奏 | 2 | 情绪曲线、节奏变化 |
| AI味 | 2 | 句式重复、情感空洞 |
| 逻辑 | 2 | 情节逻辑、因果关系 |

### 5.6 Agent 11 — StyleExtractor（风格提取）

**职责**：从作者旧稿提取风格特征

**模型**：DeepSeek V4 或 Claude 4

**输入**：作者上传的3-5章旧稿

**输出**：style_fingerprint.json

```json
{
  "sentence_pattern": {
    "avg_sentence_length": 12,
    "short_sentence_ratio": 0.65,
    "complex_sentence_ratio": 0.2
  },
  "vocabulary": {
    "preferred_verbs": ["握紧", "眯眼", "冷笑"],
    "preferred_nouns": [],
    "filler_word_rate": 0.02
  },
  "dialogue_style": {
    "tag_preference": "none",  // "道"/"说"/"无标签"
    "action_with_dialogue": true,
    "avg_dialogue_length": 15
  },
  "rhetoric": {
    "metaphor_density": 0.1,
    "preferred_rhetoric": ["比喻", "排比"],
    "sensory_preference": ["视觉", "听觉"]
  },
  "pacing": {
    "description_to_action_ratio": 0.3,
    "inner_monologue_ratio": 0.1
  }
}
```

### 5.7 Agent 12 — CoverGenerator（封面生成）

**职责**：根据小说内容生成封面图

**模型**：DeepSeek V4-Flash（生成提示词）+ Stable Diffusion API（生成图片）

**流程**：
```
1. 读取MASTER_SETTING（标题、题材、核心设定）
2. V4-Flash生成封面提示词（英文）
3. 调用SD API生成图片
4. 保存到workspace/novel_xxx/cover.png
```

**输出**：封面图片文件

### 5.8 Agent 13 — ScriptExporter（短剧导出）

**职责**：将章节转换为短剧/漫剧剧本格式

**实现**：纯规则引擎，零LLM调用

**转换规则**：
```
章节内容 → 短剧格式：
  1. 按场景卡分割为镜头
  2. 叙述文本 → 旁白字幕
  3. 对话 → 角色台词
  4. 动作描写 → 镜头指示
  5. 情绪描写 → 配乐/音效提示
```

**输出格式**（JSON）：
```json
{
  "title": "第42章 青云城拍卖会",
  "scenes": [
    {
      "scene_id": 1,
      "location": "青云城中央拍卖场",
      "shots": [
        {
          "shot_id": 1,
          "type": "establishing",
          "description": "拍卖场全景，人声鼎沸",
          "duration": 3,
          "sfx": "人群嘈杂声"
        },
        {
          "shot_id": 2,
          "type": "dialogue",
          "character": "张三",
          "line": "林兄，张明那小子也在。",
          "action": "张三凑近，压低声音",
          "emotion": "紧张"
        }
      ]
    }
  ]
}
```

---

## 6. 全文记忆架构

### 6.1 全文记忆实现

```typescript
// src/memory/full-text-memory.ts

class FullTextMemory {
  private chapters: Chapter[] = [];
  private maxChapters = 20;  // 最近20章
  private maxTokens = 150000;  // ~15万Token

  // 添加新章节
  async addChapter(chapter: Chapter): Promise<void> {
    this.chapters.push(chapter);
    
    // 保持最近20章
    if (this.chapters.length > this.maxChapters) {
      this.chapters.shift();
    }
    
    // 检查是否触发/dream
    if (chapter.number % 10 === 0) {
      await this.triggerDream();
    }
  }

  // 获取最近N章全文
  async getRecentChapters(n: number): Promise<string> {
    const recent = this.chapters.slice(-n);
    return recent.map(ch => ch.fullText).join('\n\n');
  }

  // /dream 记忆整合
  async triggerDream(): Promise<void> {
    const last10Chapters = this.chapters.slice(-10);
    
    // 调用LLM整合记忆
    const summary = await this.llm.summarize({
      chapters: last10Chapters,
      instruction: '整合为故事简报，包含：主要事件、角色变化、伏笔状态、待解决问题'
    });
    
    // 更新Working Memory
    await this.workingMemory.update({
      dream_summary: summary,
      dream_chapter: this.chapters[this.chapters.length - 1].number
    });
    
    // 压缩早期章节（保留摘要）
    this.compressOldChapters();
  }

  // 压缩早期章节
  private compressOldChapters(): void {
    // 保留最近5章全文
    // 更早的章节只保留摘要
    for (let i = 0; i < this.chapters.length - 5; i++) {
      this.chapters[i].compressed = true;
      this.chapters[i].fullText = this.chapters[i].summary;
    }
  }
}
```

### 6.2 /dream 机制

```
触发条件: 每10章自动触发

处理流程:
  1. 收集最近10章的章节摘要、事件、角色变化
  2. 调用V4-Flash整合为"故事简报"（~2000字）
  3. 合并、去重、验证路径有效性
  4. 更新Working Memory的summary字段
  5. 压缩早期章节（保留摘要，释放Token空间）

成本: ~$0.02/次（每10章）

效果:
  · 减少AI味累积
  · 保持长期一致性
  · 控制Token使用量
```

---

## 7. 风格迁移引擎

### 7.1 风格提取流程

```
作者上传3-5章旧稿
        │
        ▼
┌─────────────────────────────────────────┐
│  调用V4/Claude分析                       │
│  · 句式模式                              │
│  · 词汇偏好                              │
│  · 对话风格                              │
│  · 修辞特征                              │
│  · 节奏特征                              │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  生成 style_fingerprint.json             │
│  保存到 workspace/novel_xxx/style.json   │
└────────────────────┬────────────────────┘
                     │
                     ▼
              风格提取完成
```

### 7.2 风格注入Prompt

```
[风格指纹-作者偏好]

句式特征:
- 偏好四字短句，单句不超过15字
- 短句占比65%，复合句占比20%
- 避免"然而""但是"，用"可""却"代替

对话特征:
- 对话标签少用"说道"，直接动作+引号
- 对话平均长度15字
- 对话中30%含潜台词

修辞特征:
- 修辞密度10%
- 偏好比喻、排比
- 感官描写以视觉、听觉为主

节奏特征:
- 描写与行动比3:7
- 内心独白占比10%
- 章末必有悬念
```

### 7.3 偏离检测

```typescript
// 检测生成内容是否偏离风格
function detectStyleDeviation(
  generated: string,
  fingerprint: StyleFingerprint
): StyleDeviation[] {
  const deviations: StyleDeviation[] = [];
  
  // 1. 句长偏差
  const avgSentenceLength = calculateAvgSentenceLength(generated);
  if (Math.abs(avgSentenceLength - fingerprint.sentence_pattern.avg_sentence_length) > 5) {
    deviations.push({
      type: 'sentence_length',
      expected: fingerprint.sentence_pattern.avg_sentence_length,
      actual: avgSentenceLength
    });
  }
  
  // 2. 对话标签风格
  const dialogueTagCount = countDialogueTags(generated, ['说道', '道', '说']);
  if (dialogueTagCount > fingerprint.dialogue_style.tag_preference_threshold) {
    deviations.push({
      type: 'dialogue_tag',
      message: '对话标签过多，建议减少"说道"的使用'
    });
  }
  
  // 3. AI味句式
  const aiTasteHits = scanAITaste(generated);
  if (aiTasteHits.length > 0) {
    deviations.push({
      type: 'ai_taste',
      hits: aiTasteHits
    });
  }
  
  return deviations;
}
```

---

## 8. 数据架构

### 8.1 作品目录结构

```
workspace/                                    # 所有作品根目录
├── global_config.json                        # 全局配置
│
├── novel_仙道独尊/                           # 单部作品
│   ├── MASTER_SETTING.json                   # 不可变核心设定
│   ├── book_config.json                      # 本书配置
│   ├── style.json                            # 风格指纹（新增）
│   ├── cover.png                             # 封面图片（新增）
│   │
│   ├── state/
│   │   ├── working_memory.json               # 工作记忆
│   │   ├── current_state.json                # 双通道世界状态
│   │   ├── characters.json                   # 角色统一档案
│   │   ├── plot_threads.json                 # 伏笔 + 支线
│   │   ├── particle_ledger.json              # 资源账本
│   │   ├── chapter_summaries.json            # 章级摘要
│   │   ├── rhythm_map.json                   # 6 维节奏地图
│   │   ├── power_system.json                 # 功法体系
│   │   ├── learned_rules.json                # 自学习规则
│   │   └── ai_fingerprint_blacklist.json     # AI 味特征库
│   │
│   ├── memory.db                             # SQLite 时序记忆
│   ├── full-text-cache/                      # 全文记忆缓存（新增）
│   │   └── chapters/                         # 最近20章全文缓存
│   ├── volumes/                              # 卷纲目录
│   ├── blocks/                               # 块纲目录
│   ├── sheets/                               # 章级写作表
│   ├── scenes/                               # 场景卡
│   ├── chapters/                             # 章节正文（Markdown）
│   ├── braindump/                            # 灵感碎片
│   ├── versions/                             # 状态快照 + 分支
│   └── exports/                              # 导出文件（新增）
│       ├── scripts/                          # 短剧剧本
│       └── covers/                           # 封面图片
```

### 8.2 14 个核心数据模型

| 文件 | 核心字段 | 说明 |
|------|---------|------|
| `MASTER_SETTING.json` | work_id, title, genre, core_premise, core_conflict, world_rules, golden_finger | 不可变核心设定 |
| `style.json` | sentence_pattern, vocabulary, dialogue_style, rhetoric, pacing | **新增**：风格指纹 |
| `working_memory.json` | summary, character_states, hot_hooks, dream_summary | 工作记忆 |
| `current_state.json` | fact_channel + intent_channel | 双通道世界状态 |
| `characters.json` | basic + OCEAN + speech + behavior_rules + relationships + power | 角色完整档案 |
| `plot_threads.json` | subplots + hooks + reading_debt | 伏笔与支线追踪 |
| `particle_ledger.json` | 物品、数量、归属、变更日志 | 物品追踪 |
| `chapter_summaries.json` | 每章摘要 + 事件 + 角色 + 情绪 | 章节摘要 |
| `rhythm_map.json` | hook_strength + cool_points + emotional_curve | 6维节奏地图 |
| `power_system.json` | realm_hierarchy + combat_rules | 战力体系 |
| `learned_rules.json` | pattern + weight + confidence + source | 动态规则权重 |
| `ai_fingerprint_blacklist.json` | forbidden_patterns + templates | AI味特征库 |
| `book_config.json` | model_override + style_override | 本书配置 |
| `global_config.json` | model_routing + audit + knowledge + cache | 全局配置 |

---

## 9. 知识增强层

### 9.1 写作规则库（动态权重）

```json
{
  "rules": [
    {
      "id": "rule_001",
      "category": "节奏",
      "rule": "每1000字至少包含1个微冲突或信息增量",
      "weight": 0.7,
      "confidence": 0.6,
      "genre_overrides": {"玄幻": 0.8, "悬疑": 0.5}
    },
    {
      "id": "rule_006",
      "category": "章末",
      "rule": "最后3段必须包含悬念/期待/冲突元素之一",
      "weight": 0.9,
      "confidence": 0.9
    }
  ]
}
```

### 9.2 参考作品库

**重要声明**：仅用于风格学习，不用于情节参考。

```
使用范围:
  ✓ 学习真人网文的句式结构
  ✓ 学习对话的自然表达
  ✓ 学习环境描写的技巧
  
  ✗ 不复制情节结构
  ✗ 不借鉴人物设定
```

### 9.3 AI检测特征库（新增）

```json
{
  "platforms": {
    "知网": {
      "forbidden_patterns": ["然而.*却", "不仅.*而且", "在.*的过程中"],
      "style_indicators": ["短句为主", "避免长复合句"]
    },
    "维普": {
      "forbidden_patterns": ["由此可见", "综上所述", "值得注意的是"],
      "style_indicators": ["减少学术性表达"]
    },
    "朱雀": {
      "forbidden_patterns": ["不禁", "竟然", "居然"],
      "style_indicators": ["减少惊叹表达"]
    }
  }
}
```

### 9.4 平台格式模板（新增）

```json
{
  "起点": {
    "paragraph_indent": true,
    "max_paragraph_length": 200,
    "title_format": "第{num}章 {title}",
    "special_symbols": ["*", "【】"]
  },
  "晋江": {
    "paragraph_indent": true,
    "max_paragraph_length": 150,
    "title_format": "第{num}章 {title}",
    "forbidden_symbols": ["*"]
  },
  "番茄": {
    "paragraph_indent": false,
    "max_paragraph_length": 300,
    "title_format": "{title}",
    "short_paragraph_preferred": true
  }
}
```

---

## 10. 生成质量增强

### 10.1 分段场景生成

```
传统方式:
  Writer生成全文(3000字) → Auditor检查全文 → 发现问题 → 修复 → 重审

增强方式（以场景卡为粒度）:

  场景1(1200字):
    Writer生成场景1 → 段级快速自检(代码) → 通过 → 缓存

  场景2(1000字):
    Writer生成场景2（携带场景1缓存作为上文）→ 自检 → 通过

  场景3(800字):
    Writer生成场景3 → 自检 → 通过

  全文拼装 → 风格校验 → Polisher全局润色
```

### 10.2 段级自检

```typescript
function sceneLevelCheck(sceneText: string, context: SceneContext): CheckResult {
  const issues: Issue[] = [];
  
  // 角色名一致性
  const unknownNames = extractUnknownNames(sceneText, context.knownCharacters);
  if (unknownNames.length > 0) {
    issues.push({type: 'unknown_character', names: unknownNames});
  }
  
  // AI味句式检测
  const aiTasteHits = scanBlacklist(sceneText);
  if (aiTasteHits.length > 0) {
    issues.push({type: 'ai_taste', hits: aiTasteHits});
  }
  
  // 风格偏离检测
  const styleDeviations = detectStyleDeviation(sceneText, context.styleFingerprint);
  if (styleDeviations.length > 0) {
    issues.push({type: 'style_deviation', deviations: styleDeviations});
  }
  
  return { passed: issues.length === 0, issues };
}
```

---

## 11. 去AI味四层架构

### 11.1 四层架构

```
Layer 0: 模板注入层（Writer Prompt预防）
  成本: 0，效果: 从源头减少30% AI味

Layer 1: 正则/规则扫描层
  成本: ~10ms，效果: 捕获40%的表面AI味

Layer 2: 语料指纹替换层
  成本: ~100ms，效果: 真人写过的自然表达

Layer 3: LLM精修层（降级使用）
  成本: 仅处理10-15%
```

### 11.2 预期效果（诚实评估）

| 层级 | 处理占比 | 累计效果 |
|------|---------|---------|
| Layer 0 | 30% | 30% |
| Layer 1 | 40% | 70% |
| Layer 2 | 15% | 85% |
| Layer 3 | 5% | 90% |
| **无法消除** | **10-15%** | — |

**诚实预期**：AI味消除60-70%，文风自然度65-70分。

---

## 12. 写作规则引擎

### 12.1 动态规则系统

```typescript
interface WritingRule {
  id: string;
  category: string;
  rule: string;
  weight: number;
  confidence: number;
  source: 'builtin' | 'learned' | 'author';
  genre_overrides?: Record<string, number>;
}

class RuleEngine {
  // 获取当前适用的规则（按题材自适应）
  getActiveRules(genre: string): WritingRule[] {
    return this.rules
      .map(rule => ({
        ...rule,
        effective_weight: rule.genre_overrides?.[genre] ?? rule.weight
      }))
      .filter(rule => rule.effective_weight > 0.3);
  }

  // 作者覆盖规则时调整权重
  onAuthorOverride(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.weight = Math.max(0.1, rule.weight - 0.1);
      rule.source = 'author';
    }
  }
}
```

### 12.2 作者意图捕获

```typescript
interface AuthorIntent {
  primary_goal: 'excitement' | 'foreshadowing' | 'character_development' | 'pacing';
 破格_requests?: string[];
  emotional_tone: string;
  notes?: string;
}

// 将作者意图作为高优先级注入Writer
function injectAuthorIntent(prompt: string, intent: AuthorIntent): string {
  return `
[作者意图 - 最高优先级]
本章主要目标: ${intent.primary_goal}
情绪基调: ${intent.emotional_tone}
${intent.破格_requests ? `破格请求: ${intent.破格_requests.join('; ')}` : ''}

[系统规则 - 次要优先级]
当作者意图与系统规则冲突时，以作者意图为准。
...
${prompt}
`;
}
```

---

## 13. 本地模型微调方案

### 13.1 微调目标

通过LoRA微调，让本地Qwen3.6-35B模型：
1. 学习真人网文的写作风格
2. 减少AI味句式
3. 提高对话自然度

### 13.2 微调配置

```
基座模型: Qwen3.6-35B-A3B
微调方法: QLoRA（4-bit量化 + LoRA）
目标模块: q_proj, v_proj, k_proj, o_proj, gate_proj, up_proj, down_proj

训练超参数:
  rank: 32
  lora_alpha: 64
  epochs: 3
  batch_size: 2
  learning_rate: 2e-4
  max_seq_length: 4096
  
硬件需求:
  GPU: RTX 3070 8GB（最低）
  显存占用: ~6GB
  训练时间: 24-48小时
```

### 13.3 DPO偏好学习（后期）

```
数据来源: 人工修改 + AI生成的对比对
积累目标: 1000+对
训练框架: TRL + PEFT
预期效果: AI味进一步减少15-20%
```

---

## 14. API 设计

### 14.1 端点清单

```
作品管理:
  POST   /api/workspace                   创建新作品
  GET    /api/workspace                   列出所有作品
  GET    /api/workspace/:id               获取作品概览
  PUT    /api/workspace/:id/config        更新本书配置
  DELETE /api/workspace/:id               归档作品

大纲管理:
  GET    /api/workspace/:id/outline       获取完整大纲树
  PUT    /api/workspace/:id/outline       更新大纲

章节管理:
  GET    /api/workspace/:id/chapter/:num  获取章节内容
  PUT    /api/workspace/:id/chapter/:num  手动保存章节
  DELETE /api/workspace/:id/chapter/:num  删除章节

流水线:
  POST   /api/workspace/:id/pipeline/write     触发「写下一章」(SSE流式)
  POST   /api/workspace/:id/pipeline/audit     仅审计指定章节
  POST   /api/workspace/:id/pipeline/polish    仅去AI味

审批:
  POST   /api/workspace/:id/approval/:node     提交审批结果

审计:
  GET    /api/workspace/:id/audit/:chapter      获取审计报告

角色管理:
  GET    /api/workspace/:id/characters          获取角色列表
  PUT    /api/workspace/:id/characters/:name    更新角色档案

数据看板:
  GET    /api/workspace/:id/plots                获取伏笔/支线数据
  GET    /api/workspace/:id/rhythm/:chapter      获取节奏数据

风格管理:
  POST   /api/workspace/:id/style/extract       提取风格指纹
  GET    /api/workspace/:id/style                获取风格指纹
  PUT    /api/workspace/:id/style                更新风格指纹

导出:
  GET    /api/workspace/:id/export/:format       导出（txt/docx/pdf/epub）
  POST   /api/workspace/:id/export/script        导出短剧剧本

封面:
  POST   /api/workspace/:id/cover/generate       生成封面

知识库:
  POST   /api/knowledge/process-books             处理书籍数据
  GET    /api/knowledge/search                    检索知识库

微调:
  POST   /api/finetune/prepare                    生成训练数据
  POST   /api/finetune/train                      开始训练
  GET    /api/finetune/status                     训练状态

配置:
  GET    /api/config                              获取全局配置
  PUT    /api/config                              更新全局配置
```

### 14.2 SSE流式生成

```
POST /api/workspace/:id/pipeline/write

→ Server-Sent Events 流：

  data: {"type":"progress","agent":"planner","status":"running"}
  data: {"type":"progress","agent":"planner","status":"completed"}
  data: {"type":"approval_required","node":"outline","data":{...}}
  → 等待审批
  data: {"type":"progress","agent":"writer","status":"running"}
  data: {"type":"content","token":"林"}
  data: {"type":"content","token":"逸"}
  ...
  data: {"type":"progress","agent":"writer","status":"completed"}
  data: {"type":"progress","agent":"fastaudit","status":"completed","score":0.85}
  data: {"type":"progress","agent":"deepaudit","status":"completed","score":0.82}
  data: {"type":"approval_required","node":"post_audit","issues":[...]}
  → 等待作者决策
  data: {"type":"progress","agent":"analyst","status":"completed"}
  data: {"type":"progress","agent":"polisher","status":"completed"}
  data: {"type":"progress","agent":"memoryupdate","status":"completed"}
  data: {"type":"approval_required","node":"final","data":{...}}
  → 等待最终审批
  data: {"type":"pipeline_complete","chapter":42,"score":0.85}
```

---

## 15. 前端页面设计

### 15.1 页面清单

| 页面 | 路由 | 上线阶段 | 核心功能 |
|------|------|---------|---------|
| 书架 | `/bookshelf` | Q2 | 作品列表、创建新书 |
| 创作工作台 | `/workspace/:id` | Q2 | 大纲树 + 编辑器 + 审批 |
| 章节编辑器 | workspace 内 | Q2 | Markdown + 流式预览 |
| 大纲树 | workspace 侧栏 | Q2 | 卷→块→章 三级 |
| 审批面板 | workspace 底栏 | Q2 | 3个审批节点 |
| 角色档案 | `/workspace/:id/characters` | Q2 | OCEAN 人格编辑 |
| 审计面板 | workspace 内 | Q2 | Fast/DeepAudit结果 |
| 伏笔看板 | `/workspace/:id/plots` | Q3 | 伏笔列表+逾期 |
| 节奏曲线 | `/workspace/:id/rhythm` | Q3 | 折线图+爽点 |
| 执行日志 | workspace 侧面板 | Q3 | 实时进度 |
| 设置页 | `/workspace/:id/settings` | Q3 | 模型+参数 |
| **风格管理** | `/workspace/:id/style` | Q2 | **风格提取+预览** |
| **封面生成** | `/workspace/:id/cover` | Q3 | **一键生成封面** |
| **短剧导出** | `/workspace/:id/script` | Q3 | **剧本格式转换** |
| 知识库管理 | `/knowledge` | Q3 | 书籍处理 |
| 微调管理 | `/finetune` | Q4 | 训练状态 |

---

## 16. 差异化功能

### 16.1 一键封面生成

```
功能: 根据小说内容自动生成封面

流程:
  1. 读取MASTER_SETTING（标题、题材、核心设定）
  2. V4-Flash生成封面提示词
  3. 调用Stable Diffusion API生成图片
  4. 保存到workspace/novel_xxx/cover.png

用户操作:
  点击 [生成封面] → 等待10秒 → 预览 → 确认/重新生成

成本: ~$0.01/张
```

### 16.2 短剧剧本导出

```
功能: 将章节转换为短剧/漫剧剧本格式

转换规则:
  · 章节内容 → 场景分割
  · 叙述文本 → 旁白字幕
  · 对话 → 角色台词
  · 动作描写 → 镜头指示
  · 情绪描写 → 配乐/音效提示

输出格式:
  · JSON（结构化数据）
  · DOCX（可编辑文档）

用户操作:
  点击 [导出剧本] → 选择格式 → 下载

成本: $0（规则引擎）
```

### 16.3 AI检测预检（P2）

```
功能: 预测内容在各平台的AIGC检测风险

检测规则:
  · 知网检测规则
  · 维普检测规则
  · 朱雀检测规则

输出:
  · AIGC风险评分（0-100）
  · 高风险段落标记
  · 修改建议

用户操作:
  审计面板中显示风险评分
  点击 [查看详情] → 查看高风险段落 → [自动修改]
```

---

## 17. 用户使用流程

### 17.1 一次性设置（约1-2小时）

```
Step 1: 环境准备
  1. 安装 Node.js 20+
  2. 安装 pnpm: npm install -g pnpm
  3. 克隆项目: git clone ...
  4. 安装依赖: pnpm install
  5. 配置 .env（填入 DeepSeek API Key）

Step 2: 启动系统
  运行: pnpm dev
  访问: http://localhost:3000

Step 3: 创建新书
  点击 [+ 创建新书] → 完成6步问卷

Step 4: 风格注入（可选）
  上传3-5章旧稿 → 系统自动提取风格指纹

Step 5: 放入参考书籍（可选）
  将网文文本放入 data/raw-books/
  运行: pnpm run knowledge:process

Step 6: 微调模型（可选，需要GPU）
  运行: pnpm run fine-tune:all
```

### 17.2 日常创作流程

```
Step 1: 启动系统
  运行: pnpm dev
  访问: http://localhost:3000

Step 2: 打开作品
  在书架点击作品 → 进入工作台

Step 3: 点击 [写下一章]
  系统自动执行流水线:
  1. Planner生成章纲
  2. 弹出大纲审批 → 你审阅并批准
  3. Writer流式生成（边生成边显示）
  4. FastAudit快速检查
  5. DeepAudit深度分析
  6. 弹出审计后介入 → 你决定如何处理
  7. Analyst提取事实
  8. Polisher去AI味
  9. 更新全文记忆
  10. 弹出最终审阅 → 你批准发布

Step 4: 人工微调（可选）
  在编辑器中直接修改 → 保存

Step 5: 导出发布
  点击 [导出] → 选择格式 → 下载
  或点击 [生成封面] → 获取封面图
  或点击 [导出剧本] → 获取短剧格式
```

---

## 18. 工作分解结构

### 18.1 工作项总览

```
Phase  Q1（第 1-4 周）   14 个工作项   数据层 + 知识库基础 + DAG引擎
Phase  Q2（第 5-10 周）  22 个工作项   10 Agent + Studio 核心 + 风格迁移
Phase  Q3（第 11-18 周） 16 个工作项   质量达标 + 差异化功能 + Studio增强
Phase  Q4（第 19-26 周） 12 个工作项   微调集成 + DPO + 高级功能 + 交付
─────────────────────────────────────────────────────────────
总计                      64 个工作项
```

### 18.2 Q1 — 数据层 + 知识库基础 + DAG引擎（第 1-4 周）

```
工作项 Q1-00 [项目初始化脚本]
工作项 Q1-01 [项目脚手架]
工作项 Q1-02 [全局类型定义]
工作项 Q1-03 [14个JSON Schema]
工作项 Q1-04 [SQLite记忆库]
工作项 Q1-05 [状态管理器]
工作项 Q1-06 [版本快照+回滚]
工作项 Q1-07 [模型路由器+Prompt缓存]
工作项 Q1-08 [全文记忆模块]
工作项 Q1-09 [上下文装配器]
工作项 Q1-10 [分步问卷]
工作项 Q1-11 [AI味特征库]
工作项 Q1-12 [数据处理Pipeline]
工作项 Q1-13 [知识库基础]
工作项 Q1-14 [DAG编排引擎]
```

### 18.3 Q2 — 10 Agent + Studio 核心 + 风格迁移（第 5-10 周）

```
工作项 Q2-01 [Planner Agent]
工作项 Q2-02 [Composer Agent]
工作项 Q2-03 [PreAudit Agent]
工作项 Q2-04 [ContextPrep Agent]
工作项 Q2-05 [Writer Agent]
工作项 Q2-06 [FastAudit Agent]
工作项 Q2-07 [DeepAudit Agent]
工作项 Q2-08 [Analyst Agent]
工作项 Q2-09 [Polisher Agent]
工作项 Q2-10 [MemoryUpdate Agent]
工作项 Q2-11 [StyleExtractor Agent]  ← 新增
工作项 Q2-12 [DAG流水线集成]
工作项 Q2-13 [API层]
工作项 Q2-14 [Studio—书架页]
工作项 Q2-15 [Studio—工作台框架]
工作项 Q2-16 [Studio—大纲树]
工作项 Q2-17 [Studio—章节编辑器+流式渲染]
工作项 Q2-18 [Studio—审批面板（3节点）]
工作项 Q2-19 [Studio—审计面板]
工作项 Q2-20 [Studio—角色档案]
工作项 Q2-21 [Studio—风格管理页]  ← 新增
工作项 Q2-22 [Studio—执行日志+设置页]
```

### 18.4 Q3 — 质量达标 + 差异化功能 + Studio增强（第 11-18 周）

```
工作项 Q3-01 [记忆生命周期]
工作项 Q3-02 [风格引擎]
工作项 Q3-03 [追读力系统]
工作项 Q3-04 [动态规则引擎]
工作项 Q3-05 [作者意图捕获]
工作项 Q3-06 [/dream记忆整合]  ← 新增
工作项 Q3-07 [宏观审计]
工作项 Q3-08 [题材模板库]
工作项 Q3-09 [Studio—伏笔看板+节奏曲线]
工作项 Q3-10 [Studio—请求统计]
工作项 Q3-11 [导出工具]
工作项 Q3-12 [Studio—导出面板]
工作项 Q3-13 [CoverGenerator Agent]  ← 新增
工作项 Q3-14 [Studio—封面生成页]  ← 新增
工作项 Q3-15 [ScriptExporter Agent]  ← 新增
工作项 Q3-16 [Studio—短剧导出页]  ← 新增
```

### 18.5 Q4 — 微调集成 + DPO + 高级功能 + 交付（第 19-26 周）

```
工作项 Q4-01 [微调数据生成器]
工作项 Q4-02 [微调执行脚本]
工作项 Q4-03 [Studio—微调管理]
工作项 Q4-04 [DPO数据收集模块]  ← 新增
工作项 Q4-05 [DPO训练脚本]  ← 新增
工作项 Q4-06 [版本分叉与合并]
工作项 Q4-07 [Reviewer Agent]
工作项 Q4-08 [Studio—关系图]
工作项 Q4-09 [AI检测预检]  ← 新增
工作项 Q4-10 [模型输出优化]
工作项 Q4-11 [长篇交付测试]
工作项 Q4-12 [用户文档+部署脚本]
```

---

## 19. 开发计划

### 19.1 里程碑

| 里程碑 | 完成工作项 | 预计时间 | 验收标准 |
|--------|----------|---------|---------|
| M1: 数据层+DAG | Q1全部 | 第4周 | Schema通过，DAG可执行 |
| M2: 3章闭环 | Q2-01~Q2-13 | 第8周 | 3章生成，延迟<60s |
| M3: Studio可用+风格迁移 | Q2-14~Q2-22 | 第10周 | 核心页面+风格提取 |
| M4: 10章质量+/dream | Q3-01~Q3-08 | 第14周 | 错误率<5%，/dream正常 |
| M5: 差异化功能 | Q3-09~Q3-16 | 第18周 | 封面+短剧可用 |
| M6: 微调+DPO | Q4-01~Q4-05 | 第22周 | 微调模型+DPO数据 |
| M7: 长篇交付 | Q4-06~Q4-12 | 第26周 | 10万字，一致性≥8/10 |

### 19.2 甘特图

```
周次  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26
      ├──┴──┴──┴──┤
Q1    ████████████████  数据层+DAG引擎
      │                ├──┴──┴──┴──┴──┴──┤
Q2    │                ████████████████████████████  10 Agent+Studio+风格迁移
      │                │                        ├──┴──┴──┴──┴──┴──┴──┴──┤
Q3    │                │                        ████████████████████████████████  质量+差异化
      │                │                        │                        ├──┴──┴──┴──┴──┴──┴──┴──┤
Q4    │                │                        │                        ████████████████████████████  微调+DPO+交付
      │                │                        │                        │
M1────●                │                        │                        │
      │                M2──────────────────────●│                        │
      │                │                        M3──────────────────────●│
      │                │                        │                        M4──────────────────────●
      │                │                        │                        │                        M5──────────●
      │                │                        │                        │                        │            M6──────────●
      │                │                        │                        │                        │            │            M7──────●
```

---

## 20. 验收标准

### 20.1 功能验收

| 功能 | 验收标准 |
|------|---------|
| 全文记忆 | 最近20章全文可检索，50章+一致性 |
| /dream整合 | 每10章自动触发，生成故事简报 |
| 风格提取 | 3-5章旧稿 → style_fingerprint.json |
| 风格注入 | Writer自动学习作者风格 |
| 风格偏离检测 | 偏离>30%自动标记 |
| 一键封面 | 10秒内生成封面图 |
| 短剧导出 | 章节→短剧格式，可编辑 |
| 流式输出 | Writer生成期间用户看到内容 |

### 20.2 质量验收（诚实预期）

| 维度 | 目标 | 说明 |
|------|------|------|
| 单章质量 | 7.5/10 | 主观评分 |
| 10章一致性 | 8/10 | 全文记忆保障 |
| 30章一致性 | 8.5/10 | /dream整合 |
| 50章+一致性 | 8/10 | 全文记忆主路径 |
| AI味消除 | 60-70% | 诚实预期 |
| 风格一致性 | 75分 | 风格迁移保障 |
| 生成速度 | <60s | 含审计 |
| 错误率 | <5% | 需人工修改 |

### 20.3 性能验收

| 指标 | 目标 |
|------|------|
| API响应时间 | <100ms |
| 全文记忆检索 | <500ms |
| FastAudit | <3s |
| 章节生成 | <60s |
| 流式首token | <500ms |
| 内存占用 | <4GB |

---

## 21. 风险评估

### 21.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| V4 1M上下文性能 | 低 | 中 | 实测验证，可降级到20章 |
| 本地模型显存不足 | 中 | 中 | 4-bit量化，batch=1 |
| 微调效果不达预期 | 中 | 中 | 调整超参数 |
| 风格提取不准确 | 中 | 低 | 提供手动调整 |

### 21.2 创作风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| 爽点公式化 | 高 | 高 | 放松硬约束，建议性标注 |
| 参考作品抄袭 | 中 | 高 | 仅用于风格学习 |
| 审计限制创意 | 中 | 中 | 作者意图可覆盖规则 |

---

## 22. 预期效果

### 22.1 诚实的效果对比

| 维度 | v2.0 | v3.0 | v3.5 | 说明 |
|------|------|------|------|------|
| AI味消除 | 85%+ | 60-70% | 60-70% | 诚实预期 |
| 文风自然度 | 75-80分 | 65-70分 | 70-75分 | 风格迁移+1 |
| 单章质量 | 80-85分 | 75-80分 | 78-82分 | 全文记忆+1 |
| 10章一致性 | 75分 | 75分 | 8.0分 | 全文记忆+1 |
| 30章+一致性 | 70分 | 70分 | 8.5分 | /dream+1.5 |
| 个性化程度 | 低 | 中 | **高** | 风格迁移 |
| 差异化功能 | 无 | 无 | **封面+短剧** | 新增 |
| 月度成本 | $5-10 | $5-8 | **$2-4** | 缓存优化 |

### 22.2 预期创作效率

| 指标 | 传统写作 | 使用NovelForge | 提升 |
|------|---------|---------------|------|
| 日更字数 | 4000-6000字 | 8000-15000字 | +100-150% |
| 单章耗时 | 2-4小时 | 20-40分钟 | -60-75% |
| 10万字耗时 | 20-30天 | 10-15天 | -50% |
| 质量一致性 | 依赖状态 | AI辅助保证 | + |
| 个性化程度 | 依赖作者 | 风格自动学习 | + |

---

## 23. 成本分析

### 23.1 月度成本估算

| 项目 | 原方案 | v3.5优化后 | 说明 |
|------|--------|-----------|------|
| Planner | $0.3/月 | **$0.1/月** | V4-Flash+缓存 |
| Writer | $0 | **$0** | 本地模型 |
| DeepAudit | $1.5/月 | **$0.5/月** | V4-Pro+缓存 |
| Analyst | $1.0/月 | **$0.3/月** | V4-Pro+缓存 |
| Polisher | $0.5/月 | **$0.1/月** | 本地/Flash |
| /dream | $0 | **$0.02/次** | 每10章 |
| 封面生成 | $0 | **$0.01/张** | 可选 |
| 风格提取 | $0 | **$0.02/次** | 一次性 |
| 电费 | $3/月 | **$3/月** | 不变 |
| **总计** | **$5-8/月** | **$2-4/月** | **降50%** |

### 23.2 Prompt缓存节省

```
DeepSeek V4缓存命中价格: $0.0028/M（未命中$0.14/M，便宜50倍）

Writer Prompt结构:
  [STATIC] 写作铁律+风格+角色+世界观 = 14万Token
    首次调用: $0.0196
    后续调用: $0.000392（缓存命中）
    
  [DYNAMIC] 最近20章+场景卡+意图 = 15万Token
    每次: $0.021

月度（日更1章）:
  首次调用: $0.0196（一次性）
  每章: $0.021
  30章: $0.63/月
  
  vs 无缓存: $1.26/月
  节省: 50%
```

---

## 24. 技术可行性分析

### 24.1 技术栈成熟度

| 技术 | 成熟度 | 风险 | 说明 |
|------|--------|------|------|
| TypeScript | 高 | 低 | 主流语言 |
| Hono | 中 | 低 | 轻量HTTP |
| SQLite | 高 | 低 | 成熟稳定 |
| React | 高 | 低 | 前端主流 |
| DeepSeek V4 | 中 | 低 | 1M上下文已验证 |
| Qwen3.6-35B | 中 | 中 | 开源模型 |
| LoRA微调 | 中 | 中 | 技术成熟 |
| Stable Diffusion | 高 | 低 | 封面生成成熟 |

### 24.2 关键功能可行性

| 功能 | 可行性 | 依据 |
|------|--------|------|
| 全文记忆(V4 1M) | **极高** | 已有实测数据 |
| 风格迁移注入 | 高 | Prompt注入成熟 |
| /dream记忆整合 | 高 | LLM摘要成熟 |
| 一键封面生成 | 高 | SD API成熟 |
| 短剧格式转换 | 高 | 规则引擎简单 |
| DPO偏好学习 | 中 | 需数据积累 |
| AI检测预检 | 中高 | 规则库可构建 |

### 24.3 预估成功率

| 维度 | 成功率 | 说明 |
|------|--------|------|
| 代码实现 | 95%+ | 技术成熟 |
| 全文记忆效果 | 90%+ | V4 1M已验证 |
| 风格迁移效果 | 85% | Prompt注入有效 |
| /dream效果 | 85% | LLM摘要可靠 |
| 封面生成效果 | 90% | SD成熟 |
| 短剧导出效果 | 90% | 规则简单 |
| DPO效果 | 70% | 需数据积累 |
| AI味消除60% | 85% | 保守但可达 |

---

## 25. 附录

### 25.1 配置文件示例

#### .env
```env
# DeepSeek API
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Claude API（可选，用于风格提取）
CLAUDE_API_KEY=your_claude_key_here

# Stable Diffusion API（可选，用于封面生成）
SD_API_URL=https://api.stability.ai
SD_API_KEY=your_sd_key_here

# 本地模型（可选）
LOCAL_MODEL_ENABLED=true
LOCAL_MODEL_PATH=./models/novelforge-qwen-lora
LOCAL_MODEL_BASE_URL=http://127.0.0.1:8080/v1

# 服务配置
PORT=3001
HOST=0.0.0.0

# 数据库
DB_PATH=./data/novelforge.db
```

#### global_config.json
```json
{
  "model_routing": {
    "planner": {
      "primary": "deepseek-v4-flash",
      "temperature": 0.3,
      "max_tokens": 4096,
      "cache_enabled": true
    },
    "writer": {
      "primary": "local-finetuned",
      "fallback": "deepseek-v4-pro",
      "temperature": 0.8,
      "max_tokens": 8192,
      "cache_enabled": true
    },
    "deep_audit": {
      "primary": "deepseek-v4-pro",
      "temperature": 0.1,
      "max_tokens": 4096,
      "cache_enabled": true
    },
    "analyst": {
      "primary": "deepseek-v4-pro",
      "temperature": 0.1,
      "max_tokens": 8192,
      "cache_enabled": true
    },
    "polisher": {
      "primary": "local-model",
      "fallback": "deepseek-v4-flash",
      "temperature": 0.3,
      "max_tokens": 4096
    },
    "style_extractor": {
      "primary": "deepseek-v4-flash",
      "fallback": "claude-4",
      "temperature": 0.1
    },
    "cover_generator": {
      "prompt_model": "deepseek-v4-flash",
      "image_model": "stable-diffusion"
    }
  },
  "memory": {
    "full_text_chapters": 20,
    "dream_interval": 10,
    "dream_model": "deepseek-v4-flash"
  },
  "audit": {
    "fast_audit_enabled": true,
    "deep_audit_threshold": 0.7,
    "pass_as_reference": true
  },
  "knowledge": {
    "enabled": true,
    "vector_db_path": "./data/knowledge-base/vector-index",
    "reference_top_k": 3,
    "style_learning_only": true
  },
  "local_model": {
    "enabled": true,
    "base_url": "http://127.0.0.1:8080/v1",
    "model": "novelforge-qwen-lora"
  },
  "features": {
    "cover_generation": true,
    "script_export": true,
    "ai_detection": true
  }
}
```

### 25.2 快速启动命令

```bash
# 1. 克隆项目
git clone https://github.com/xxx/novelforge.git
cd novelforge

# 2. 安装依赖
pnpm install

# 3. 配置环境
cp .env.example .env
# 编辑 .env 填入 API Key

# 4. 初始化系统
pnpm run setup

# 5. 启动开发
pnpm dev

# 6. （可选）处理参考书籍
pnpm run knowledge:process

# 7. （可选）提取风格指纹
curl -X POST http://localhost:3001/api/workspace/1/style/extract \
  -F "files=@chapter1.txt" -F "files=@chapter2.txt"

# 8. （可选）微调模型
pnpm run fine-tune:all
```

### 25.3 评审意见整合清单

| 评审意见 | 整合方式 |
|---------|---------|
| 流水线串行瓶颈 | ✅ DAG并行 |
| 33维审计过度设计 | ✅ FastAudit+DeepAudit |
| 长篇一致性低估 | ✅ 全文记忆(V4 1M) |
| 去AI味目标乐观 | ✅ 60-70%诚实预期 |
| 爽点公式陷阱 | ✅ 放松硬约束 |
| 参考作品风险 | ✅ 仅风格学习 |
| 审批节点位置 | ✅ 3个决策点 |
| 风格个性化 | ✅ 风格迁移引擎 |
| 成本控制 | ✅ Prompt缓存优化 |
| 差异化功能 | ✅ 封面+短剧导出 |
| /dream机制 | ✅ 记忆整合 |
| DPO学习 | ✅ 后期积累 |

---

*NovelForge v3.5 最终版 | 全文记忆 | 风格迁移 | 极致缓存 | 差异化功能 | 2026-06-12*
