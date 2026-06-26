# REST API

Base：`http://127.0.0.1:8787`（开发期固定端口；打包后为 sidecar 动态端口，前端经 Tauri `server_port` 获取）。全部 JSON，仅绑定 loopback。

## 端点一览

### 任务

| 方法 | 路径 | 说明 | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/health` | 健康检查（前端启动先轮询） | — | `{ok:true, provider:"deepseek"}` |
| POST | `/tasks` | AI 分析 + 入库（一句话可拆多条） | `{input: string}` | `{tasks: Task[], degraded: boolean}` |
| GET | `/tasks` | 列任务（过滤） | query: `status,tag,from,to` | `{tasks: Task[]}` |
| GET | `/tasks/completed` | 已完成任务（先清满 7 天再倒序返回） | — | `{tasks: Task[]}` |
| GET | `/tasks/calendar` | 日历范围查（命中 due_date） | query: `from,to`（YYYY-MM-DD，必填） | `{tasks: Task[]}` |
| GET | `/tasks/by-tag/:tag` | 按标签查 | path | `{tasks: Task[]}` |
| PATCH | `/tasks/:id` | 部分更新 | 白名单字段（见下） | `{task: Task}` |
| DELETE | `/tasks/:id` | 软删（归档） | — | `{ok: true}` |
| DELETE | `/tasks/clear-all` | 清除所有本地数据（任务/标签库/设置）并重置 | — | `{ok: true}` |

### 标签

| 方法 | 路径 | 说明 | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/tags` | 标签 + 计数（由任务聚合，排除归档） | — | `{tags: {tag,count}[]}` |
| GET | `/tag-defs` | 标签库（字典表，含预设与新增） | — | `{tagDefs: {name,created_at}[]}` |
| POST | `/tag-defs` | 新增标签 | `{name: string}` | `{tagDefs: TagDef[]}` |
| PUT | `/tag-defs/order` | 拖拽重排标签库次序 | `{names: string[]}` | `{tagDefs: TagDef[]}` |
| DELETE | `/tag-defs/:name` | 删除标签（不影响已打在任务上的标签） | — | `{tagDefs: TagDef[]}` |

### 设置

| 方法 | 路径 | 说明 | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/settings` | 当前设置（不回传 Key 明文） | — | `{settings: PublicSettings}` |
| PATCH | `/settings` | 更新设置 | 任意可改字段（见下） | `{settings: PublicSettings}` |

## 说明

- **`POST /tasks` 的 `degraded=true`**：AI 当时不可用，已降级登记为「待整理」（tag `待整理`，priority `medium`，无日期）。降级任务不并入标签库。
- **一句话拆多条**：`POST /tasks` 始终返回 `tasks` 数组；含多件事、或「X 号到 Y 号每天/每周」会被 AI 逐一拆开入库（各自独立 Task）。
- **`PATCH /tasks/:id` 白名单**：`title, notes, priority, due_date, due_time, status, tags`（`tags` 传字符串数组）。其余字段忽略（`scheduled_date` 已下线，不再接受）。`status` 改为 `done` 时自动记 `completed_at`，改回其它状态则清空（供 7 天清理）。传 `tags` 时，新出现的标签会并入标签库（`ensureTagDefs`，与 `POST /tasks` 一致）。
- **`PublicSettings` 形态**：`{aiProvider, deepseekBaseUrl, deepseekModel, hasDeepseekKey, language, setupDone}`——**不含 API Key 明文**，只给 `hasDeepseekKey` 布尔标记。
- **`PATCH /settings` 可改字段**：`aiProvider, deepseekApiKey, deepseekBaseUrl, deepseekModel, language, setupDone`（`setupDone` 传布尔，落库为 `"1"/"0"`）。
- **CORS**：allowlist，仅放行开发期来源 `TASKDECK_ORIGIN`（默认 `http://localhost:5173`）与 Tauri webview（`tauri://*`、`http(s)://tauri.localhost`）。其它来源不回 `Access-Control-Allow-Origin`，预检直接 403——挡掉浏览器恶意网页对本机任务库的跨源写操作。

## 环境变量

| 变量 | 默认 | 作用 |
|---|---|---|
| `TASKDECK_PORT` | `8787`（打包时 Tauri 传 `0`，系统分配空闲端口） | 服务端口 |
| `TASKDECK_DB` | `server/data/taskdeck.db` | SQLite 路径（打包后为 Tauri app data 目录） |
| `TASKDECK_ORIGIN` | `http://localhost:5173` | CORS 放行的开发期来源 |

> AI provider 配置（模型、API Key、base URL）不走环境变量，而是存在 SQLite `settings` 表，经 `/settings` 端点读写。

## Task 结构

见 `app/frontend/src/types.ts` 与 `app/server/src/repo/taskRepo.ts`。要点：`tags` 为字符串数组；日期为 `YYYY-MM-DD | null`；`due_time` 为 `HH:MM | null`（24h）；`status` ∈ `todo/doing/done/archived`。
