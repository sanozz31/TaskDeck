# REST API

Base：`http://127.0.0.1:8787`，全部 JSON。仅绑定 loopback。

| 方法 | 路径 | 说明 | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/health` | 健康检查（前端启动先轮询） | — | `{ok:true, provider:"sdk"}` |
| POST | `/tasks` | AI 分析 + 入库 | `{input: string}` | `{task: Task, degraded: boolean}` |
| GET | `/tasks` | 列任务（过滤） | query: `status,category,tag,from,to` | `{tasks: Task[]}` |
| GET | `/tasks/calendar` | 日历范围查 | query: `from,to`（YYYY-MM-DD，必填） | `{tasks: Task[]}` |
| GET | `/tasks/by-tag/:tag` | 按标签查 | path | `{tasks: Task[]}` |
| GET | `/tags` | 标签 + 计数 | — | `{tags: {tag,count}[]}` |
| PATCH | `/tasks/:id` | 部分更新 | 任意可改字段 | `{task: Task}` |
| DELETE | `/tasks/:id` | 软删（归档） | — | `{ok: true}` |

## 说明

- `POST /tasks` 的 `degraded=true` 表示 AI 当时不可用，已降级登记为「待分类」。
- `PATCH` 白名单字段：`title, notes, category, priority, due_date, scheduled_date, status, tags`（`tags` 传数组）。
- CORS 开发期放行 `http://localhost:5173`（`TASKDECK_ORIGIN` 可改）。

## 环境变量

| 变量 | 默认 | 作用 |
|---|---|---|
| `TASKDECK_PORT` | `8787` | 服务端口 |
| `TASKDECK_PROVIDER` | `sdk` | `sdk`（Agent SDK）/ `cli`（claude -p 回退） |
| `TASKDECK_MODEL` | 空 | 指定模型；留空用本机 CC 默认模型 |
| `TASKDECK_DB` | `server/data/taskdeck.db` | SQLite 路径 |
| `TASKDECK_ORIGIN` | `http://localhost:5173` | CORS 放行来源 |

## Task 结构

见 `app/frontend/src/types.ts` 与 `app/server/src/repo/taskRepo.ts`。要点：`tags` 为字符串数组；日期为 `YYYY-MM-DD | null`。
