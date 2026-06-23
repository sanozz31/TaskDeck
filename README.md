# 万事 TaskDeck

> 一句话登记任务，剩下交给 AI。个人任务中控台桌面应用。

输入一句自然语言（如「下周三前交季度报告」），后台 AI 自动完成**打标签、推断日期、定优先级**，并整理进日历与标签视图。AI 走 **DeepSeek**（OpenAI 兼容，在设置里填 API Key 即可，模型可选 V4 Flash / V4 Pro）。数据全部存本地 SQLite，私有、自用。

## 截图

对话区（ChatGPT 式）输入任务 → AI 即时解析为结构化任务卡：

- 对话 / 日历日程 / 按标签 / 全部任务，四视图左侧切换
- Apple 视觉基底 + ChatGPT 式对话交互

## 技术栈

- **桌面壳**：Tauri 2 (Rust)
- **前端**：React 19 + TypeScript + Vite
- **后端**：Node + Express + better-sqlite3；AI 走 DeepSeek（OpenAI 兼容，纯 `fetch`，无第三方 SDK）
- **数据**：本地 SQLite（WAL）

## 快速开始

> 前置：Node ≥ 20、Rust 工具链（Tauri 需要）、macOS Xcode CLT；以及一个 DeepSeek API Key（首次启动时在引导里填）。

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

**v1.0.2 — 代码审查收敛版**，端到端闭环完整。以下按能力域概览，详细功能与版本演进见 `CHANGELOG.md` 和 `doc/milestones.md`。

### 一句话建任务

输入自然语言 → AI 自动打标签、推断日期与时刻、定优先级 → 结构化入库。

- **多任务拆解**：一句话含多件事、或「X 号到 Y 号每天 / 每周」这类日期范围/重复，AI 自动拆成多条任务逐一入库，对话里一并展示「已登记 N 项 ✓」。如「7月1号到5号每天中午12点健身」→ 自动建 5 条。
- **优先级智能判断**：AI 按「距截止≤24h→急、≤48h→高、≤72h→中」定底线，再结合语义重要度上调；与自动升级共用同一套时间标准。
- **相对时间解析**：支持「十分钟后 / 半小时后 / 2 小时后」等说法，以当前精确时刻为基准换算出绝对截止时刻，跨零点自动进位次日。
- **输入草稿持久化**：对话输入框未发送的文字本地留存，切窗口 / 重挂载不丢。
- **AI 降级兜底**：未配置 DeepSeek 或 AI 异常时，任务原样登记为「待整理」，不丢数据。

### 时间感知与优先级（重点）

TaskDeck 的任务优先级有**静态与动态两层**：用户 / AI 设定的是"重要度"，系统按距截止远近实时派生的是"紧急度"，二者互不污染。

- **优先级随 DDL 自动升级**：后端定时器（启动 + 每 5 分钟）按距截止远近自动提升开放任务优先级——剩 ≤24h→急、≤48h→高、≤72h→中。**只升不降、幂等**；前端各视图 60s 轮询刷新。
- **迫近高亮**：DDL 前 2 小时内（含已过期未完成）任务标题实时变红——覆盖悬浮窗近期/全部、主窗口全部/日历/标签、对话页 DDL 时间轴。有迫近任务时悬浮球白光晕脉动 + 透明度闪烁 + 上下浮动。
- **DDL 系统提醒**：截止前 24 小时、前 6 小时各弹一次 Web Notification；纯日期任务（无具体时刻）锚定当天 23:59；超过截止 24h 不再补提醒避免刷屏；`localStorage` 去重防重复弹窗。
- **截止时刻统一口径**：迫近高亮、优先级升级、DDL 提醒三项能力共享同一 `dueAtMs` 计算逻辑，消除多份时间解析实现的漂移风险。

### 四视图与交互

- **对话视图**：ChatGPT 式消息流，顶部 DDL 时间轴（近 3 天任务按时刻横排，可滑动，点圆圈即完成）。
- **日历视图**：`react-day-picker`，年/月下拉切换、日圆点按当天最高优先级着色。**完成日图片**：某天所有任务完成时数字变为随机图片覆盖（hover 淡出露数字），往 `src/assets/calendar-overlays/` 加图即自动纳入随机池。
- **标签视图**：按任务数量降序排列，数量相同按拼音首字母升序。标签库可新增/删除/重排。
- **全部任务**：主列表 + 右下角「已完成」浮窗；完成满 7 天物理删除，支持一键清理所有已完成。

### 桌面悬浮球

设置弹窗开关（默认开），桌面常驻一颗圆形悬浮球。点击展开近期/全部任务卡片可勾选完成、⤢ 唤起主窗口；拖动换位；拖到边缘自动吸附收球。窗口置顶 + 跨工作区可见。迫近任务时呼吸预警。详见 `~/Projects/Doc/floating-window-interaction.md`。

### 数据与配置

所有数据存于本机，不上传任何业务数据。分布如下：

| 数据 | 存储位置 |
|---|---|
| 任务 / 标签库 / 设置 | `~/Library/Application Support/com.taskdeck.desktop/taskdeck.db` |
| 对话记录 | `~/Library/WebKit/com.taskdeck.desktop/`（localStorage `taskdeck.chat.v1`） |
| 悬浮窗位置/开关 | 同上（localStorage `taskdeck.widget.*`） |
| 日历完成日映射 | 同上（localStorage `taskdeck.calendar.dones`） |
| 输入草稿 / 提醒去重 | 同上（localStorage `taskdeck.chat.draft` / `notified.v2`） |

- 卸载或更新 App **不会删除**上述两个目录，重装后数据自动恢复
- 如需彻底清除：设置弹窗底部「清除所有本地数据」一键重置，或手动删除 `~/Library/Application Support/com.taskdeck.desktop/` 与 `~/Library/WebKit/com.taskdeck.desktop/` 两个文件夹
- 开发版（`npm run dev`）数据库位于 `app/server/data/taskdeck.db`
- **AI 走 DeepSeek**：用户自填 API Key，纯 `fetch`，无第三方 SDK。模型可选 `deepseek-v4-flash` / `deepseek-v4-pro`。
- **首启引导**：首次启动强制配置 DeepSeek API Key 才能进入主界面；之后可在设置随时调整。
- **已产出 DMG**（aarch64）：47 MB，`npm run build` 一键打包。

后续里程碑（M4 子任务拆解 / 通知常驻 / Mochi 联动等）见 `doc/milestones.md`。

## 接入说明

AI 调用通过 `app/server/src/ai/provider.ts` 抽象，当前**唯一 provider 为 DeepSeek**：

- 设置里填 DeepSeek API Key，走 `openaiCompatProvider`（OpenAI 兼容，默认 `https://api.deepseek.com`，纯 `fetch`、无第三方 SDK）。可选模型为当前生产版 `deepseek-v4-flash` / `deepseek-v4-pro`；旧别名 `deepseek-chat` / `deepseek-reasoner` 官方将于 2026/07/24 停用，故未列出。
- 未配置 Key 时，路由层 `fallbackAnalysis` 兜底降级入库（仍记下原文，不丢任务）。

> 早期版本曾支持「本机 Claude Code（Agent SDK）」作为默认零配置通路，后已**整体下线、统一走 DeepSeek**，`server` 不再依赖 `@anthropic-ai`。相关瘦身历史见 `doc/milestones.md` M3。

详见 `AGENTS.md`。
