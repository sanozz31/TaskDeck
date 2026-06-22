# AGENTS.md — TaskDeck（万事）

> 本文件作用等同 CLAUDE.md：任何 AI agent（含 Claude Code）接手本项目时，先读本文件再动手。约定与铁律 **override 默认行为**。

## 一、项目定位

TaskDeck（中文名「万事」）是一个**个人任务中控台桌面应用**。核心闭环：

> 用户在对话框输入一句自然语言任务 → 后台 AI 自动「打标签 / 分类 / 推断截止与执行日期 / 定优先级」→ 结构化入库 → 在对话、日历、标签、全部任务四个视图中呈现。

定位是**本地、私有、自用**。数据全部存本机 SQLite，AI 复用本机已登录的 Claude Code，不依赖任何云服务或 API key。

## 二、架构与启动

| 层 | 技术 | 位置 |
|---|---|---|
| 桌面壳 | Tauri 2 (Rust) | `app/src-tauri/` |
| 前端 | React 19 + TypeScript + Vite | `app/frontend/` |
| 后端 | Node + Express + better-sqlite3 + Claude Agent SDK | `app/server/` |
| 编排 | concurrently（根 `app/package.json`） | `app/` |

- 前端 ↔ 后端：HTTP，后端固定 `http://127.0.0.1:8787`（仅 loopback），前端 Vite `5173`。
- **一键开发**：`cd app && npm run dev`（同时起 server + vite + tauri dev）。
- **仅浏览器调试**（不编译 Rust，最快）：`cd app && npm run dev:browser`，浏览器开 `http://localhost:5173`。
- 端到端截图自测：`node app/e2e-shot.mjs`（需先起 `dev:browser`；复用本机 Chrome）。

## 三、AI 接入铁律（最重要）

1. **一切经 provider 抽象**：`app/server/src/ai/provider.ts` 的 `ClaudeProvider` 接口。默认 `SdkProvider`（Agent SDK），回退 `CliProvider`（`claude -p`），可选 `OpenAiCompatProvider`（DeepSeek 等第三方）。`getProvider()` 按**设置**（`settings` 表的 `ai_provider`）+ 环境变量动态选择，新增 AI 能力也走这个抽象，不要在路由里直接调 SDK。
2. **默认复用本机 Claude Code，零配置；第三方模型走设置**：未配置时默认 `SdkProvider` 调本机 CC，复用 `~/.claude` 登录与默认模型——此路径下**不要硬编码 ANTHROPIC_API_KEY、不要写死 model**，如需指定模型用 `TASKDECK_MODEL`。用户可在**设置弹窗**改用 DeepSeek 等（OpenAI 兼容）：其 API Key / 接口地址 / 模型名存本机 `settings` 表（`settingsRepo.ts`），**不入 env、不硬编码、不回传明文给前端**（GET /settings 只给 `hasDeepseekKey`）。
3. **不加载用户全局人设**：`SdkProvider` 故意**不设 `settingSources`**，避免把用户 `~/.claude/CLAUDE.md`（含个人人设）带进任务分析，污染输出。保持这一行为。
4. **结构化输出靠 json_schema**：分析结构定义在 `ai/schema.ts` 的 `analysisJsonSchema` + `Analysis` 接口。**改 schema 必须三处同步**：`schema.ts` 的 interface、`analysisJsonSchema`、以及 DB 列（`db.ts` 建表 + `taskRepo.ts` 读写）。
5. **AI 失败要降级不阻塞**：`routes/tasks.ts` 的 `fallbackAnalysis` 在 AI 异常时把任务原样登记为「待分类」，闭环不能因 AI 挂掉而断。保留此降级。
6. `maxTurns` 不要设为 1：配合 `outputFormat` 时模型需多轮产出/校验 JSON，设 1 会 `error_max_turns`。当前为 5。
7. **打包发布版只走 DeepSeek，Claude SDK 仅本地开发用**：`scripts/build-sidecar.sh` 在装完生产依赖后 `rm -rf sidecar-server/node_modules/@anthropic-ai`（瘦身 ~219MB），故发布版**不内置** Agent SDK。两条铁律须保持：(a) `getProvider()` 里 `sdkProvider` 必须**动态 `import()`**，绝不能改成顶层静态 import，否则发布版加载即崩；(b) 前端凡涉及 provider 选择的 UI（首启引导 `Onboarding.tsx`、设置 `SettingsModal.tsx`）都用 `lib/env.ts` 的 `CLAUDE_PAUSED`（=`import.meta.env.PROD`）门控——发布版默认 DeepSeek、Claude 选项禁用标「（暂停配置）」。本机 `server/node_modules` 不要动。

## 四、数据约定

- 日期一律 `YYYY-MM-DD`（纯日期，MVP 不到分钟）；由后端基于「今天」算好落库，前端只读。
- `tags` 在 DB 存 **JSON 数组文本**，查询用 SQLite `json_each`。标签重命名/统计等高级需求再考虑规范化为关联表。
- 任何表结构变更走迁移（`db.ts` 的 `migrate`），不要手改已落盘的库。
- DB 文件：开发期 `app/server/data/taskdeck.db`（WAL）；M3 打包后改落 Tauri app data 目录。

## 五、设计规范

- 风格：**Apple 视觉基底 + ChatGPT 式对话**。冷静、克制、大留白、单一强调色。
- Token 唯一来源：`app/frontend/src/styles/tokens.css`（配色 / 字体 / 圆角 / 间距）。**不要在组件里写死颜色**，引用 `var(--...)`。详见 `design/tokens.md`。
- 强调色只用一个：Action Blue `--accent (#0071e3)`。优先级用低饱和点缀色。
- 响应式（遵循 `~/Projects/AGENTS.md`）：`clamp()/min()/max()/svh`、grid 轨道、`env(safe-area-inset-*)`；窄窗侧栏收为顶部横条。

## 六、目录纪律

- `doc/` 文档、`app/` 代码、`design/` 设计，三者分离。新文档落 `doc/`。
- 代码内分层：`server/src/{ai,repo,routes}`、`frontend/src/{api,store,components,lib,styles}`。

## 七、已知坑（踩过的，别再踩）

- **npm 缓存权限**：本机 `~/.npm/_cacache` 有历史 root 文件，`npm install` 报 EACCES。解法：`npm install --cache /tmp/npm-cache-taskdeck`。
- **Rust `time` 0.3.50 被 yank**：Tauri 传递依赖会锁到已撤回的坏版本 `time 0.3.50`（`time-macros::timestamp` 编译错误）。解法：`cd app/src-tauri && cargo update -p time --precise 0.3.49`（已固定在 Cargo.lock）。
- **Tauri 需要 cargo**：跑 `tauri dev/build` 前先 `source ~/.cargo/env`。
- Agent SDK 首次冷启动慢（~20-30s），属正常；UI 已有「分析中」打字态。
- **sidecar node 必须与编译 better-sqlite3 的 node 同 major 版本**：`build-sidecar.sh` 下载官方 node 时按本机 `node -v` 锁版本。若改成别的版本，会与 `npm install` 编译出的 better-sqlite3 原生模块 ABI（`NODE_MODULE_VERSION`）不匹配，装好的 app 一启动 `require` 原生模块就崩。换 node 版本务必同步保证两者一致。
- **删依赖后清断链**：从随包 `node_modules` 删包（如瘦身删 `@anthropic-ai`）后，`.bin/` 里会留悬空软链，Tauri 打包资源会报 `resource path ... doesn't exist`。`build-sidecar.sh` 已用 `find -L -type l` 清理，删别的包时同理。
- **打包目标只设 dmg**：`tauri.conf.json` `bundle.targets=["dmg"]`，打完 dmg 后 `bundle/macos/` 不留独立 `.app`。
