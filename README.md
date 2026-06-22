# 万事 TaskDeck

> 一句话登记任务，剩下交给 AI。个人任务中控台桌面应用。

输入一句自然语言（如「下周三前交季度报告」），后台 AI 自动完成**打标签、推断日期、定优先级**，并整理进日历与标签视图。AI 默认复用你本机已登录的 **Claude Code 默认模型**，零配置、无需 API key；也可在设置里切换到 **DeepSeek**（OpenAI 兼容，填 API Key 即可）。数据全部存本地 SQLite，私有、自用。

## 截图

对话区（ChatGPT 式）输入任务 → AI 即时解析为结构化任务卡：

- 对话 / 日历日程 / 按标签 / 全部任务，四视图左侧切换
- Apple 视觉基底 + ChatGPT 式对话交互

## 技术栈

- **桌面壳**：Tauri 2 (Rust)
- **前端**：React 19 + TypeScript + Vite
- **后端**：Node + Express + better-sqlite3 + `@anthropic-ai/claude-agent-sdk`
- **数据**：本地 SQLite（WAL）

## 快速开始

> 前置：Node ≥ 20、本机已安装并登录 Claude Code、Rust 工具链（Tauri 需要）、macOS Xcode CLT。

```bash
cd app

# 方式一：完整桌面应用（Tauri 窗口）
npm run dev

# 方式二：仅浏览器调试（不编译 Rust，最快）
npm run dev:browser   # 然后浏览器打开 http://localhost:5173
```

首次 `npm run dev` 会编译 Tauri（Rust，稍慢）；之后秒起。

## 目录结构

```
260622TaskDeck/
├── AGENTS.md          # 给 AI agent 的项目指令（接手前必读）
├── doc/               # 架构 / 数据模型 / API / 里程碑
├── design/            # 设计 token 与参考
└── app/
    ├── frontend/      # React + TS + Vite
    ├── server/        # Node 后端（AI + SQLite）
    └── src-tauri/     # Tauri 壳
```

## 当前进度

**M1 闭环 MVP 已完成**：输入 → AI 分析 → 入库 → 四视图呈现，端到端跑通。

**M2 可用性增强（进行中）**，已落地：

- **优先级**：四档 急 / 高 / 低 / 中（`urgent/high/medium/low`），各有点缀色。
- **已完成任务**：全部任务页右下角「已完成」浮窗集中查看；任务划掉当次仍留主列表，下次打开自动归入浮窗；完成满 **7 天物理删除**。
- **日历**：左上角年 / 月支持点击微调与直接输入数字切换；某天的圆点按**当天最高优先级**着色。
- **标签库**：标签升级为可管理的字典表（预设 学习/工作/生活/娱乐/健康/财务/家庭/社交/旅行），标签页支持新增、删除（删除需二次确认，防误删）；AI 打标签时优先复用标签库，新标签自动并入。任务模型已**砍掉「分类」维度，只保留更灵活的标签**。
- **设置与多模型**：侧栏齿轮进设置，可在「本机 Claude Code（默认零配置）」与「DeepSeek（OpenAI 兼容，需 API Key）」间切换；DeepSeek 模型下拉选 V4 Flash / V4 Pro；侧栏底部常显当前接入模型。
- **首启引导**：第一次启动**强制先选定并配置 AI 模型**（本机 Claude Code 零配置 / DeepSeek 需填 Key，未填 Key 时「开始使用」禁用）才能进入主界面；配置写入本机 `settings`（`setup_done` 标记），之后不再出现，仍可在设置里随时切换。
- **品牌与视觉**：自绘 App 图标（任务卡叠加 + 蓝色对勾），`tauri icon` 生成 macOS/iOS/Android 全套；Web favicon 与窗口标题同步为「万事 TaskDeck」。文案精简为「你说一句，剩下的交给我 / 输入任务，我来整理」。

后续里程碑（DDL 通知提醒 / M3 打包发布 / M4 子任务拆解等）见 `doc/milestones.md`。

## 接入说明

AI 调用通过 `app/server/src/ai/provider.ts` 抽象：

- **默认（本地开发）**：Agent SDK 复用本机 Claude Code，零 API key；认证异常时可设 `TASKDECK_PROVIDER=cli` 回退到 `claude -p`。
- **DeepSeek**：设置里切到 DeepSeek 并填 API Key，走 `openaiCompatProvider`（OpenAI 兼容，`https://api.deepseek.com`）。可选模型为当前生产版 `deepseek-v4-flash` / `deepseek-v4-pro`；旧别名 `deepseek-chat` / `deepseek-reasoner` 官方将于 2026/07/24 停用，故未列出。

> **打包发布版只走 DeepSeek**：为给安装包瘦身，打包时会从 sidecar 依赖中剔除 Claude Agent SDK（约 219 MB 原生二进制，见 `scripts/build-sidecar.sh`）。因此发布版首启**直接配置 DeepSeek**，UI 仍保留「本机 Claude Code」选项但禁用并标注「（暂停配置）」。本地开发（`npm run dev`）不受影响，Claude 照常可用。

详见 `AGENTS.md`。
