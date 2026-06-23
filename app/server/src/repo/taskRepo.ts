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
  "due_time",
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

// ---- 优先级随 DDL 临近自动升级（仅向上，不降级）----

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const RANK_TO_PRIORITY = ["low", "medium", "high", "urgent"] as const;

/**
 * 任务截止时刻（ms，本地时区）；无 due_time 或 due_time 畸形视当天 23:59；无 due_date 返回 Infinity。
 * @see app/frontend/src/lib/deadline.ts 的 dueAtMs —— 两端必须保持一致。
 */
function dueAtMs(t: Task): number {
  if (!t.due_date) return Infinity;
  const [y, m, d] = t.due_date.split("-").map(Number);
  if (t.due_time) {
    const [hh, mm] = t.due_time.split(":").map(Number);
    // due_time 畸形（NaN）时回退当天 23:59，避免 NaN 让升级阶梯静默失效
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return new Date(y, m - 1, d, hh, mm).getTime();
    }
  }
  return new Date(y, m - 1, d, 23, 59).getTime();
}

/**
 * 按「距截止还剩多久」给开放任务自动提升优先级（阶梯）：
 *   剩 ≤ 24h（含已过期）→ 急(urgent)；≤ 48h → 高(high)；≤ 72h → 中(medium)。
 * **只升不降**：仅当目标档高于当前档才改写，已经更高的不动；done/archived/无截止日不动。
 * 由后端定时器周期性调用（单一数据源，避免多窗口各写一遍）。返回改动条数。
 */
export function escalatePriorities(): number {
  const db = getDb();
  const now = Date.now();
  const H = 3600_000;
  const rows = db
    .prepare(`SELECT * FROM tasks WHERE status IN ('todo','doing') AND due_date IS NOT NULL`)
    .all() as TaskRow[];
  const stmt = db.prepare(`UPDATE tasks SET priority = @priority, updated_at = @updated_at WHERE id = @id`);
  let changed = 0;
  const txn = db.transaction(() => {
    for (const row of rows) {
      const t = rowToTask(row);
      const left = dueAtMs(t) - now;
      let floor: number | null = null;
      if (left <= 24 * H) floor = 3;
      else if (left <= 48 * H) floor = 2;
      else if (left <= 72 * H) floor = 1;
      if (floor == null) continue;
      const cur = PRIORITY_RANK[t.priority] ?? 1;
      if (floor > cur) {
        stmt.run({ id: t.id, priority: RANK_TO_PRIORITY[floor], updated_at: nowIso() });
        changed++;
      }
    }
  });
  txn();
  return changed;
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
