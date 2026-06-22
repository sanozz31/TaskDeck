# 数据模型

SQLite，单表 `tasks`，WAL 模式。文件：`app/server/data/taskdeck.db`（开发期）。

## tasks 表

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `raw_input` | TEXT | 用户原始一句话 |
| `title` | TEXT | AI 归纳的简短标题 |
| `notes` | TEXT? | AI 补充说明（如日期推理依据） |
| `tags` | TEXT | **JSON 数组文本**，如 `["报销","财务"]` |
| `category` | TEXT? | 单一分类（工作/生活/学习/健康/财务/社交/其他） |
| `priority` | TEXT | `low` / `medium` / `high` / `urgent` |
| `due_date` | TEXT? | 截止日 `YYYY-MM-DD`，可空 |
| `scheduled_date` | TEXT? | 执行日 `YYYY-MM-DD`，可空 |
| `status` | TEXT | `todo` / `doing` / `done` / `archived` |
| `ai_meta` | TEXT? | 原始 structured_output（审计用） |
| `ai_model` | TEXT? | 实际使用的模型，如 `deepseek-v4-pro` |
| `created_at` / `updated_at` | TEXT | ISO 时间戳 |

索引：`due_date`、`scheduled_date`、`status`、`category`。

## 设计取舍

- **tags 用 JSON 列而非关联表**：MVP 标签查询用 `json_each` 足够，避免过度设计。当出现标签重命名、跨标签统计等需求时，再规范化为 `tags` + `task_tags` 关联表（M2 视情况）。
- **纯日期不带时分**：MVP 规划到「天」。分钟级排期是 M4。
- **软删而非物理删**：DELETE 实为置 `status='archived'`，列表默认排除归档。

## 查询要点

```sql
-- 按标签
SELECT DISTINCT t.* FROM tasks t, json_each(t.tags) j
WHERE j.value = ? AND t.status != 'archived';

-- 日历范围（命中截止或执行日）
SELECT * FROM tasks
WHERE (due_date BETWEEN ? AND ?) OR (scheduled_date BETWEEN ? AND ?);

-- 标签计数
SELECT j.value AS tag, COUNT(*) AS count
FROM tasks t, json_each(t.tags) j
WHERE t.status != 'archived' GROUP BY j.value;
```
