# 数据模型

SQLite，WAL 模式，`foreign_keys=ON`。文件：`app/server/data/taskdeck.db`（开发期）；打包后落 Tauri app data 目录。三张表：`tasks`、`tag_defs`、`settings`。

## tasks 表

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `raw_input` | TEXT | 用户原始一句话 |
| `title` | TEXT | AI 归纳的简短标题 |
| `notes` | TEXT? | AI 补充说明（如日期推理依据） |
| `tags` | TEXT | **JSON 数组文本**，如 `["报销","财务"]`（入库时去重） |
| `category` | TEXT? | **deprecated**：分类维度已下线，列保留以兼容旧库，应用层不再读写（`rowToTask` 会从对外对象剔除） |
| `priority` | TEXT | `low` / `medium` / `high` / `urgent`，默认 `medium` |
| `due_date` | TEXT? | 截止日 `YYYY-MM-DD`，可空 |
| `due_time` | TEXT? | 截止具体时刻 `HH:MM`（24h），可空。用于提前提醒、当天按时刻排序、迫近判定 |
| `scheduled_date` | TEXT? | 执行日 `YYYY-MM-DD`，可空 |
| `status` | TEXT | `todo` / `doing` / `done` / `archived`，默认 `todo` |
| `ai_meta` | TEXT? | 原始 structured_output（审计用，对外对象不返回） |
| `ai_model` | TEXT? | 实际使用的模型，如 `deepseek-v4-flash` |
| `completed_at` | TEXT? | 标记完成的时刻（ISO）；用于完成满 7 天物理清理。状态离开 `done` 时清空 |
| `created_at` / `updated_at` | TEXT | ISO 时间戳 |

索引：`due_date`、`scheduled_date`、`status`。

> 历史漂移说明：早期文档曾列 `category` 为有效列并建 `category` 索引——现 `category` 已 deprecated、该索引已不再创建。旧库中若残留该列/索引不影响运行。

## tag_defs 表（标签库 / 字典表）

用户可增删的标签字典，AI 打标签时优先复用其中标签，新标签自动并入。

| 列 | 类型 | 说明 |
|---|---|---|
| `name` | TEXT PK | 标签名 |
| `created_at` | TEXT | 加入时间（ISO） |
| `sort_order` | INTEGER | 用户拖拽手动排序后的次序（越小越靠前），默认 0 |

- 空库首启种入预设：`学习/工作/生活/娱乐/健康/财务/家庭/社交/旅行`，按列表顺序赋初始 `sort_order`。
- 排序读取：`ORDER BY sort_order ASC, created_at ASC, name ASC`。当前前端标签页采用「按任务量降序」自动展示，`sort_order` / `PUT /tag-defs/order` 为手动拖拽排序预留的基础设施。

## settings 表（键值表）

| key | 默认 | 说明 |
|---|---|---|
| `ai_provider` | `deepseek` | 当前 AI 通路（现仅 DeepSeek，OpenAI 兼容） |
| `deepseek_api_key` | `""` | API Key（`/settings` 对外只回 `hasDeepseekKey` 标记，不回明文） |
| `deepseek_base_url` | `https://api.deepseek.com` | 接口地址 |
| `deepseek_model` | `deepseek-v4-flash` | 模型 |
| `language` | `zh` | 语言偏好 |
| `setup_done` | `0` | 首启引导是否完成（`"1"` 表示已显式配置模型） |

> 默认值在两处兜底：`db.ts` 建表时 `INSERT OR IGNORE` 写入部分默认，`settingsRepo.DEFAULTS` 在读取时补全全部默认。以 `settingsRepo.DEFAULTS` 为准。

## 设计取舍

- **tags 用 JSON 列而非关联表**：MVP 标签查询用 `json_each` 足够。标签库本身则规范化为独立的 `tag_defs` 字典表（支持增删、排序、AI 复用）。任务上的 tags 与字典表解耦——删字典标签不影响已打在任务上的标签。
- **纯日期 + 可选时刻**：规划到「天」为主，`due_time` 补充到「分」用于提醒与排序；无 `due_time` 的任务在时间计算中锚定当天 `23:59`。
- **软删而非物理删**：`DELETE /tasks/:id` 实为置 `status='archived'`，列表默认排除归档。`done` 满 7 天才物理删除。

## 查询要点

```sql
-- 按标签
SELECT DISTINCT t.* FROM tasks t, json_each(t.tags) j
WHERE j.value = ? AND t.status != 'archived';

-- 日历范围（命中截止或执行日）
SELECT DISTINCT t.* FROM tasks t
WHERE (t.due_date BETWEEN ? AND ?) OR (t.scheduled_date BETWEEN ? AND ?);

-- 标签计数（排除归档）
SELECT j.value AS tag, COUNT(*) AS count
FROM tasks t, json_each(t.tags) j
WHERE t.status != 'archived' GROUP BY j.value
ORDER BY count DESC, tag ASC;

-- 完成满 7 天物理清理
DELETE FROM tasks
WHERE status = 'done' AND completed_at IS NOT NULL AND completed_at < ?;
```
