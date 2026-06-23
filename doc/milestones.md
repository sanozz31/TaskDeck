# 里程碑

## M1 — 闭环 MVP ✅ 已完成

输入 → AI 分析 → 入库 → 四视图呈现，端到端跑通。

交付物：
- 脚手架（Tauri + React/TS + Node + SQLite）+ 一键 `npm run dev`
- Node 后端：SQLite schema/repo、provider 抽象、SdkProvider 结构化输出、CliProvider 回退、REST 全套
- 前端：ChatPanel（ChatGPT 式）、Sidebar 四视图、CalendarView（react-day-picker）、TagView、TaskList
- Apple + ChatGPT 设计 token 落地
- Tauri 壳编译通过（修复 `time 0.3.50` yank 问题）

验收（已通过）：输入「下周三前交季度报告」「周五前交报销单」「周日陪家人散步」→ 标题/标签/优先级/日期均正确推断，四视图可见，数据持久化。模型实测 `deepseek-v4-pro`。

## M2 — 可用性增强 ✅ 已完成（并入 v1.0.0）

> **变更说明（重要）**：本里程碑后期已将「本机 Claude Code（Agent SDK）」通路**整体下线，AI 统一走 DeepSeek**（`server` 不再依赖 `@anthropic-ai`，`provider.ts` 唯一实现为 `OpenAiCompatProvider`）。下文涉及「Claude Code 默认 / 多模型切换 / 剔除 SDK 瘦身」的条目均为**当时的历史记录**，现状以本说明为准。

已交付：
- **优先级**：四档命名 急 / 高 / 中 / 低（`urgent/high/medium/low`）+ 点缀色。
- **已完成任务浮窗**：全部任务页右下角「已完成」入口；任务划掉当次仍留主列表（可反悔），下次打开归入浮窗；完成满 **7 天物理删除**（`completed_at` + 启动/打开时清理）。
- **日历**：左上角年 / 月支持点击微调与直接输入数字切换；圆点按**当天最高优先级**着色；当天任务按具体时间（`due_time`，24h）升序排列。
- **标签库**：标签升级为字典表 `tag_defs`（预设 学习/工作/生活/娱乐/健康/财务/家庭/社交/旅行）；标签页支持新增 / 删除；AI 打标签优先复用标签库，新标签自动并入。
- **具体时间维度**：`due_time`（HH:MM，24h），AI 从「下午3点」等解析。
- **DDL 通知提醒**（App 运行时）：任务**截止前 24 小时、前 6 小时**各弹一次系统通知；超过截止 24h 不再补提醒（防刷屏）；Web Notification + localStorage 去重；**关闭 App 不提醒**为当前 MVP 限制。
- **对话历史持久化**（localStorage，刷新不丢）。
- 删除对话页示例气泡；全部任务 / 标签页空态引导 CTA。
- **设置与多模型接入**：侧栏齿轮进设置弹窗，AI provider 可在「本机 Claude Code（默认，零配置）」与「DeepSeek（OpenAI 兼容，需 API Key）」间切换；语言偏好（本轮仅 UI）。DeepSeek 模型从手填文本框升级为下拉，选项为当前生产版 `deepseek-v4-flash` / `deepseek-v4-pro`（旧别名 `deepseek-chat` / `deepseek-reasoner` 官方 2026/07/24 停用，已下线）；服务端默认模型同步改为 `deepseek-v4-flash`。侧栏底部常显当前接入模型名。
- **首启引导（强制配置模型）**：第一次启动进入全屏引导（`frontend/src/components/Onboarding.tsx`），**必须显式选定并配置 AI 模型**才能进主界面——本机 Claude Code 零配置可直接「开始使用」，DeepSeek 需填 API Key（未填则「开始使用」禁用）。完成后写入 `settings.setup_done="1"`，`useSettings` 失效自动重渲染进主界面，此后不再出现；模型仍可在设置弹窗随时切换。实现：服务端 `setup_done` 入 `settingsRepo` 默认 + `publicSettings.setupDone` + `PATCH /settings` 接受 `setupDone`；前端 `App.tsx` 在 health 就绪后拉 `settings`，`!setupDone` 时渲染 `Onboarding`。
- **文案精简**：空态主标题「万事皆有安排」、副标题「你说一句，剩下的交给我」、输入框 placeholder「有任务，立即安排」。
- **应用图标与品牌**：替换为自绘 App 图标（任务卡叠加 + 蓝色对勾，呼应「任务卡」主题），经 `tauri icon` 生成 macOS/iOS/Android 全套（icns/ico/png）；Web 端 favicon 与窗口 `<title>`（万事 TaskDeck）同步更新。
- **任务模型精简**：下线「分类」维度，只保留更灵活的标签；删除标签加确认弹窗（复用通用 `ConfirmModal`，红色危险按钮）防误删。
- **对话页顶部「DDL 时间轴」**（`DeadlineTimeline.tsx`）：今天起 3 天内、有截止时间的未完成任务，按截止时刻**横排成一行**——有任务处按任务块内容宽度自然撑开、块间固定最小间距，空白时段不按比例占位；跨天处插「今天/明天/后天」日期刻度，每个任务块上方标精确时刻（`due_time` 或「全天」）。任务块 = 优先级色点 + 标题 + 空白圆圈（点圆圈即标记完成）。整条可横向滑动，无任务时退化为三个日期刻度。**收放**：右上角裸三角（正/倒三角平滑切换，无圆环背景），无任务默认收起、有任务默认展开（仅在有/无翻转时自动切，手动收放保留）。卡片为**独立不透明浮层**（`z-index` 盖在对话滚动层之上），上滑时对话内容滚到其后被自然遮住。
- **标签排序**：标签页气泡按**任务数量降序**展示，数量相同按**首字母（拼音，`localeCompare('zh-Hans-CN')`）**升序。后端 `tag_defs` 已加 `sort_order` 列与 `PUT /tag-defs/order` 重排接口（含 CORS 放行 PUT）作为手动排序的基础设施，当前前端采用按量自动排序。
- **布局健壮性**：`.app`（grid）锁定行高 `minmax(0,1fr)` + `overflow:hidden`、`.main` 补 `min-height:0`，修复「对话变长时整窗被撑高、出现整页滚动」——滚动严格收敛在对话区内部，输入栏钉底、消息向上堆。

> **已知限制（WKWebView）**：时间轴卡片采用「独立浮层 + 不透明遮盖」而非"对话区裁切到卡片下沿"。原因：Tauri 的 macOS WKWebView 在滚动时对 `overflow` / `contain:paint` / `clip-path` 的裁切不稳定，无法可靠地把对话内容裁在卡片下边界内（标准 Chrome 正常）。故改为不透明卡片浮在上层遮住滚上来的内容，作为当前取舍。

待办：
- 任务编辑 UI：标题/日期/优先级/标签可改（PATCH 已就绪，补 UI）
- CliProvider 回退的配置切换与异常监控
- 标签多选筛选、重命名
- 日历升级：周视图、拖拽改期（FullCalendar 评估）

## M3 — 打包发布（sidecar）

- Node server 打包为单文件 + better-sqlite3 原生模块随包
- Tauri `externalBin` sidecar：启动/退出生命周期、动态端口（stdout 上报）
- DB 落 Tauri app data 目录；首启迁移
- 产出 macOS `.app` / dmg

**已产出（aarch64，首启引导改动前的版本）体积实测**：

| 产物 | 体积 |
|---|---|
| `TaskDeck_0.1.0_aarch64.dmg` | **148.7 MB**（压缩后） |
| `TaskDeck.app`（解包） | ~500 MB |

`.app` 解包后由两块大头构成（dmg 压缩到 149 MB 是因为这两块原生二进制压缩率高）：

| 组成 | 体积 | 说明 |
|---|---|---|
| `Contents/MacOS/taskdeck-node` | **229 MB** | sidecar 的 Node 运行时——直接 `cp $(which node)`（本机 node 二进制本身就 229 MB，偏大） |
| `Contents/Resources/.../node_modules` | **259 MB** | 随包生产依赖，其中 **`@anthropic-ai` 占 219 MB** |
| `Contents/MacOS/app` | 10 MB | Tauri Rust 壳 |

**Claude Agent SDK 实际占用**：`@anthropic-ai` 合计 **219 MB**，细分——`claude-agent-sdk-darwin-arm64` 原生预编译二进制 **206 MB**（SDK 内置的 Claude Code 可执行体，绝对大头）、`@anthropic-ai/sdk` 9.6 MB、`claude-agent-sdk` JS 本体仅 3.5 MB。即**包体的一半以上是 Agent SDK 的那个 206 MB 原生二进制**。

### 瘦身：发布版剔除 Claude Agent SDK（✅ 已落地并实测）

**重新打包实测（aarch64）**：DMG **148.7 MB → 86.3 MB（−62.4 MB / −42%）**；`.app` 解包 **~500 MB → 281 MB**，`Resources/server/node_modules` 259 MB → 40 MB（@anthropic-ai 219 MB 全消失），包内已确认无 Claude SDK。打包版 node + 随包 server 已冒烟验证可正常启动（懒加载，不因缺 SDK 崩）、`/health` 与 `/settings` 正常、全新库 `setupDone:false` 触发首启引导。剩余 229 MB 为 `taskdeck-node` 运行时（见下）。


发布版定位为**只走 DeepSeek**（纯 `fetch`，零 `@anthropic-ai` 依赖），故打包时整段剔除 `@anthropic-ai`：

- **打包脚本**（`scripts/build-sidecar.sh`）：`npm install --omit=dev` 后 `rm -rf sidecar-server/node_modules/@anthropic-ai`（**约 -219 MB**）。**仅作用于随包拷贝**，本机开发用的 `server/node_modules` 不动，本地 `npm run dev` 仍可用 Claude。
- **运行安全**：仅 `sdkProvider.ts` 引用该包，且 `getProvider()` 为动态 `import()`；发布版强制 DeepSeek 不会触达该路径，万一触达也被 `routes/tasks.ts` 的 try/catch 降级，不致崩 server。
- **前端 UI**（`lib/env.ts` 的 `CLAUDE_PAUSED = import.meta.env.PROD`）：发布版首启引导**默认选中并展开 DeepSeek 配置**，「本机 Claude Code」选项保留但禁用、标注「（暂停配置）」；设置弹窗同样禁用该项。本地开发（PROD=false）一切照旧。

### 瘦身：sidecar 改用官方标准 node（✅ 已落地）

`taskdeck-node` 原先直接 `cp $(which node)`（本机那个 **229 MB**，偏大）。改为下载**官方发行版 node**（`scripts/build-sidecar.sh` 第 [4/4] 步），按本机 `node -v` **锁定同版本**（v24.14.0）——必须同 major 版本以保证与上一步编译的 better-sqlite3 原生模块 ABI（`NODE_MODULE_VERSION=137`）一致，否则运行时 `require` 原生模块会崩。结果：sidecar node **229 MB → 114 MB**。下载产物缓存于 `~/.cache/taskdeck-node`，二次打包走缓存。已用该 node 跑随包 server 验证 better-sqlite3 正常加载、`/health` 与 DB 读写 OK。

### DMG 三版体积对比（最终）

| 版本 | 构成 | DMG |
|---|---|---|
| v1 | 含 Claude SDK + 本机 node 229M | 148.7 MB |
| v2 | 剔除 SDK + 本机 node 229M | 86.3 MB |
| **v3（当前）** | **剔除 SDK + 官方 node 114M** | **48.7 MB** |

较初版 **−100 MB（−67%）**。已挂载 dmg 核验：内部 node 为官方 v24.14.0（114M）、无 `@anthropic-ai`、欢迎页图标 `/favicon.png` 已嵌入 app 二进制。

### 打包目标 & 首启视觉（✅ 已落地）

- **只产 dmg**：`tauri.conf.json` 的 `bundle.targets` 由 `["app","dmg"]` 改为 `["dmg"]`。实测打完 dmg 后 `bundle/macos/` 下不再保留独立 `TaskDeck.app`，交付物只有 dmg（dmg 内部仍内嵌 `.app` 供安装，这是 macOS dmg 的必然结构）。
- **欢迎页用图标**：首启引导 `Onboarding.tsx` 顶部的「万事」文字占位块换成真正的 App 图标（`/favicon.png`，任务卡叠加 + 蓝勾），与 App/窗口图标一致。

## M4 — 迭代（需求外）

- 大任务拆解为子任务并排期
- 分钟级精细排期、重复任务
- **通知常驻**：关闭 App 也能提醒（托盘 / 后台常驻进程，甚至开机自启）——补齐 M2 提醒的 MVP 限制
- 提醒联动 Mochi 表情
- 对话式追问改单（「把这个改到下周」）

## M5 — 悬浮窗（桌面悬浮球）✅ 0.2.2

桌面常驻的任务悬浮球，独立于主窗口随时瞄一眼今明后天 / 全部任务。

交付物：
- **第二窗口**：独立 Vite 入口 `widget.html` + `Widget.tsx`，与主窗口共享同一 sidecar 后端（任意窗口复用 `api` 客户端，无需另起后端）。`tauri.conf.json` 加 `label:"widget"` 窗口（无边框 / 透明 / 置顶 / 跨工作区 / `skipTaskbar`），`capabilities/widget.json` 单独授权窗口操作。
- **两姿态（位置驱动，纯点击）**：不在边缘 = 展开卡片可随意拖；拖到左 / 右边缘 = 吸附收成圆球；球**点击展开**、**拖动换位**；卡片「–」最小化就近吸边、保持高度收球；失焦时贴边卡片收回。
- **拖动**：弃用原生 `startDragging()`（它把拖动交给 OS、吞掉松手事件，只能靠位移暂停猜），改为手动 `setPosition()` + rAF 节流 + `setPointerCapture`，**整条 pointer 生命周期留在 webview**，展开/吸附判定落在**真实 `pointerup`**。
- **卡片内容**：「近期」（今 / 明 / 后三天，表头带日期）/「全部」（按日期升序分组、未排期垫底）两视图；行内勾选完成（复用 `useUpdateTask`），20s 轮询保鲜；⤢ 唤起主窗口。
- **开关**：设置弹窗内「悬浮窗」开关（**默认开**），即时显隐，状态存 localStorage、启动自恢复。
- **设置弹窗精简**：去掉「取消 / 完成」按钮，右上角叉号即「保存并关闭」（点弹窗外亦保存）。
- **已完成弹窗**：底部「清理所有已完成任务」一键归档全部（二次确认）。
- **交互机制复用文档**：`~/Projects/Doc/floating-window-interaction.md`（点击vs拖动、手动拖窗、透明坑、状态机等完整沉淀）。

> **已知遗留（挂起）**：macOS Sequoia（Darwin 24.6）下透明窗**四角偶现黑底**——属系统对透明窗的重绘 bug（tauri #8255 / #10306），`macos-private-api` feature 已确认编入、配置三件套齐全，`visible:true` 出生即可见与 show 后强制重绘均无法根治。**（更新：已于 M6 / 0.3.0 解决，见下。）**

## M6 — 迫近提醒 · 优先级自动升级 · 体验打磨 ✅ 0.3.0

围绕「时间紧迫度」做实时提示，并补齐一批体验细节。

交付物：
- **迫近高亮**：DDL 前 2 小时内（含已过期未完成）任务标题实时变红——覆盖悬浮窗近期 / 全部、主窗口全部 / 日历 / 标签、对话页 DDL 时间轴。共享 `isImminent(task, now)`（`lib/deadline.ts`）+ 共享 30s 心跳 `useNow()`（`lib/useNow.ts`，模块级单一定时器、多组件订阅）。**重要度（静态 priority）与紧急度（实时派生）分离、互不污染**。
- **悬浮球告警**：有迫近任务时白光晕脉动 + 透明度闪烁 + 浮动；无迫近任务时同款白光晕 + 半幅浮动的静止态，两态统一大小。
- **透明窗黑底了结（M5 遗留）**：靠常驻 `filter` 动画持续重绘，修掉静止态四角黑底——M5 的已知遗留至此解决。
- **优先级随 DDL 自动升级**：后端 `escalatePriorities()`（`taskRepo.ts`）按距截止远近自动提升开放任务优先级（≤2h→急、≤24h→高、≤72h→中），**只升不降、幂等**；启动 + 每 5 分钟一轮（`setInterval(...).unref()`）。前端各视图 60s 轮询刷新。
- **相对时间解析**：给 AI prompt 注入当前精确时刻（含星期），支持「十分钟后 / 半小时后 / 2 小时后」换算为绝对截止时刻、跨零点进位次日（`schema.ts` / `routes/tasks.ts`，provider 参数 today→now）。
- **日历年月下拉**：修掉受控数字输入框中间态导致的「年月切不动」bug，改为下拉选择（年份今年 ±10），选即切。
- **全局复制**：框选复制只取文字本身，不带入布局空白 / 换行（`.app` user-select 策略 + 文字载体白名单含纯文本 `div`）。
- **降级文案**：去掉历史 Claude Code 措辞，改为「请在设置中配置模型」。

> 本轮经独立 code review：无 Critical / High 阻断级落地缺陷；High 级「全局复制误伤 `div` 文案」、Medium 级「`due_time` 畸形→`NaN` 静默失效」「跨显示器屏幕缓存失准」均已修复。

## v1.0.0 — 首个正式版 ✅ 2026-06-23

> M1→M6 全部完成后的首个正式版。核心能力完整闭环，已产出 48.7 MB DMG。

### 本版新增（相对于 0.3.0）

- **多任务拆解**：一句话含多件事、或日期范围/重复（「X 号到 Y 号每天/每周」），AI 逐一拆成多条入库。Schema 从单对象升级为 `{ tasks: [...] }` 数组，provider→路由→前端全链路适配。历史单任务数据（`ChatMsg.task`）保留兼容。
- **日历「完成日」图片**：某天所有任务完成时数字变为随机覆盖图（`import.meta.glob` 自动扫描 `src/assets/calendar-overlays/`）；hover 淡出露数字，点击显示选中圈；图片名持久化到 `localStorage`。往目录加图即自动纳入随机池。
- **输入草稿持久化**：对话输入框未发送的文字存入 `localStorage`（`taskdeck.chat.draft`），切窗口 / 重挂载不丢。
- **截止时刻口径统一**：`reminders.ts` 删除重复的 `dueAtOf` 函数，改为复用 `deadline.ts` 的 `dueAtMs`——迫近高亮、优先级升级、DDL 提醒三项能力共享同一时间计算源，消除多份日期/时刻解析实现的漂移风险。
- **导航图标**：侧栏四图标从 emoji 换为自绘 PNG（`/nav-icons/`），视觉更统一。
- **设置优化**：齿轮放大、去"设置"文字、模型名左对齐；副标题改为「所有配置仅保存于本机」；悬浮窗说明补充迫近呼吸预警描述。
- **「清除所有本地数据」**：设置弹窗底部新增「数据管理」分组，一键清除所有任务、对话记录与各项设置（含二次确认）；后端 `DELETE /tasks/clear-all` 清空三表并重建默认数据，前端同步清空 localStorage。README 新增数据位置表格标注所有持久化路径。
- **版本号统一升为 1.0.0**：`package.json`、`Cargo.toml`、`tauri.conf.json` 三处同步。

### 三大重点能力回顾

| 重点 | 涉及模块 | 说明 |
|---|---|---|
| **多任务安排** | `schema.ts` / `openaiCompatProvider.ts` / `routes/tasks.ts` / `chatStore.ts` / `ChatPanel.tsx` | 一句话→N 条任务，日期范围/重复自动展开；前端「已登记 N 项 ✓」 |
| **时间检测 & 优先级实时变更** | `deadline.ts`（`dueAtMs`、`isImminent`）/ `taskRepo.ts`（`escalatePriorities`）/ `useNow.ts`（30s 心跳） | 截止时刻单源计算 → 迫近判定 + 优先级自动升级（≤2h→急/≤24h→高/≤72h→中，只升不降） |
| **DDL 提醒** | `reminders.ts`（复用 `dueAtMs`）/ Web Notification + `localStorage` 去重 | 截止前 24h/6h 各弹一次；过期 24h 不再补；纯日期锚定 23:59 |

### 遗留 & 后续（M4+）

M2 剩余待办（仍开放）：
- 任务编辑 UI（`PATCH /tasks/:id` 已就绪，缺 UI）
- 标签多选筛选、重命名
- 日历周视图、拖拽改期

M4 规划（需求外，待排期）：
- 大任务拆解为子任务并排期
- 分钟级精细排期、重复任务
- **通知常驻**：关闭 App 也能提醒（托盘 / 后台常驻进程，开机自启）——补齐当前「仅 App 运行时生效」的 MVP 限制
- 提醒联动 Mochi 表情
- 对话式追问改单（「把这个改到下周」）
