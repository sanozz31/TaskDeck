import { randomUUID } from "node:crypto";
import { getDb } from "../db.js";
import type { Analysis } from "../ai/schema.js";

export type TaskStatus = "todo" | "doing" | "done" | "archived";

/** 对外的任务对象：tags 已解析为数组，日期为字符串或 null。 */
export interface Task {
  id: string;
  raw_input: string;
  title: string;
  notes: string | null;
  tags: string[];
  priority: string;
  due_date: string | null;
  due_time: string | null;
  scheduled_date: string | null;
  status: TaskStatus;
  ai_model: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** DB 行的原始形态（tags 为 JSON 文本）。 */
interface TaskRow extends Omit<Task, "tags"> {
  tags: string;
  ai_meta: string | null;
}

function rowToTask(row: TaskRow): Task {
  const { ai_meta, ...rest } = row;
  // DB 仍保留 deprecated 的 category 列（兼容旧库），从对外对象中剔除
  delete (rest as Record<string, unknown>).category;
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }
  return { ...rest, tags };
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 由 AI 分析结果创建任务并入库，返回完整 Task。 */
export function createTask(args: {
  rawInput: string;
  analysis: Analysis;
  aiModel: string | null;
}): Task {
  const db = getDb();
  const { rawInput, analysis, aiModel } = args;
  const now = nowIso();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO tasks
      (id, raw_input, title, notes, tags, priority,
       due_date, due_time, scheduled_date, status, ai_meta, ai_model, completed_at, created_at, updated_at)
     VALUES
      (@id, @raw_input, @title, @notes, @tags, @priority,
       @due_date, @due_time, @scheduled_date, @status, @ai_meta, @ai_model, @completed_at, @created_at, @updated_at)`,
  ).run({
    id,
    raw_input: rawInput,
    title: analysis.title || rawInput.slice(0, 40),
    notes: analysis.notes ?? null,
    tags: JSON.stringify([...new Set(analysis.tags ?? [])]),
    priority: analysis.priority ?? "medium",
    due_date: analysis.due_date ?? null,
    due_time: analysis.due_time ?? null,
    scheduled_date: analysis.scheduled_date ?? null,
    status: "todo",
    ai_meta: JSON.stringify(analysis),
    ai_model: aiModel,
    completed_at: null,
    created_at: now,
    updated_at: now,
  });

  return getTask(id)!;
}

export function getTask(id: string): Task | null {
  const row = getDb().prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

/** 列任务，支持按状态/标签/日期范围过滤。默认排除归档。 */
export function listTasks(filter: {
  status?: string;
  tag?: string;
  from?: string;
  to?: string;
} = {}): Task[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.status) {
    where.push("t.status = @status");
    params.status = filter.status;
  } else {
    where.push("t.status != 'archived'");
  }
  if (filter.from && filter.to) {
    where.push(
      "((t.due_date BETWEEN @from AND @to) OR (t.scheduled_date BETWEEN @from AND @to))",
    );
    params.from = filter.from;
    params.to = filter.to;
  }

  // 标签过滤需 join json_each
  const tagJoin = filter.tag ? ", json_each(t.tags) j" : "";
  if (filter.tag) {
    where.push("j.value = @tag");
    params.tag = filter.tag;
  }

  const sql = `SELECT DISTINCT t.* FROM tasks t${tagJoin}
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY COALESCE(t.due_date, t.scheduled_date, t.created_at) ASC, t.created_at DESC`;

  const rows = getDb().prepare(sql).all(params) as TaskRow[];
  return rows.map(rowToTask);
}

/** 标签聚合计数（排除归档）。 */
export function listTags(): { tag: string; count: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT j.value AS tag, COUNT(*) AS count
       FROM tasks t, json_each(t.tags) j
       WHERE t.status != 'archived'
       GROUP BY j.value
       ORDER BY count DESC, tag ASC`,
    )
    .all() as { tag: string; count: number }[];
  return rows;
}

const PATCHABLE = new Set([
  "title",
  "notes",
  "priority",
  "due_date",
  "scheduled_date",
  "status",
]);

/** 部分更新任务字段（仅允许白名单字段；tags 单独处理）。 */
export function updateTask(
  id: string,
  patch: Partial<Record<string, unknown>> & { tags?: string[] },
): Task | null {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: nowIso() };

  for (const [k, v] of Object.entries(patch)) {
    if (k === "tags" && Array.isArray(v)) {
      sets.push("tags = @tags");
      params.tags = JSON.stringify(v);
    } else if (PATCHABLE.has(k)) {
      sets.push(`${k} = @${k}`);
      params[k] = v;
    }
  }

  // 状态变更联动完成时刻：done 记录当前时间，其它状态清空（用于 7 天清理）
  if ("status" in patch) {
    sets.push("completed_at = @completed_at");
    params.completed_at = patch.status === "done" ? nowIso() : null;
  }

  if (!sets.length) return getTask(id);

  sets.push("updated_at = @updated_at");
  const info = db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return info.changes ? getTask(id) : null;
}

/** 软删：标记 archived。 */
export function archiveTask(id: string): boolean {
  const info = getDb()
    .prepare(`UPDATE tasks SET status = 'archived', updated_at = ? WHERE id = ?`)
    .run(nowIso(), id);
  return info.changes > 0;
}

/** 已完成任务列表，按完成时间倒序（最近完成在前），供「已完成」弹窗使用。 */
export function listCompleted(): Task[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM tasks WHERE status = 'done'
       ORDER BY COALESCE(completed_at, updated_at) DESC`,
    )
    .all() as TaskRow[];
  return rows.map(rowToTask);
}

/** 物理删除完成已满 days 天的任务，返回删除条数。 */
export function purgeExpiredDone(days = 7): number {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const info = getDb()
    .prepare(
      `DELETE FROM tasks
       WHERE status = 'done' AND completed_at IS NOT NULL AND completed_at < ?`,
    )
    .run(cutoff);
  return info.changes;
}
