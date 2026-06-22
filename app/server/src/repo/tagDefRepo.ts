import { getDb } from "../db.js";

export interface TagDef {
  name: string;
  created_at: string;
}

/** 标签库全部标签，按用户排序(sort_order)正序，其次加入时间。 */
export function listTagDefs(): TagDef[] {
  return getDb()
    .prepare(
      `SELECT name, created_at FROM tag_defs ORDER BY sort_order ASC, created_at ASC, name ASC`,
    )
    .all() as TagDef[];
}

/** 新增标签（已存在则忽略），返回是否实际插入。新标签排到末尾。 */
export function addTagDef(name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  const db = getDb();
  const next =
    (db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM tag_defs`).get() as { m: number })
      .m + 1;
  const info = db
    .prepare(`INSERT OR IGNORE INTO tag_defs (name, created_at, sort_order) VALUES (?, ?, ?)`)
    .run(clean, new Date().toISOString(), next);
  return info.changes > 0;
}

/** 按给定名称顺序重排标签库（拖拽排序）；未列出的标签保持在其后。 */
export function reorderTagDefs(names: string[]): void {
  const db = getDb();
  const upd = db.prepare(`UPDATE tag_defs SET sort_order = ? WHERE name = ?`);
  db.transaction((arr: string[]) => arr.forEach((n, i) => upd.run(i, n)))(names);
}

/** 删除标签（不影响已打在任务上的标签）。 */
export function deleteTagDef(name: string): boolean {
  const info = getDb().prepare(`DELETE FROM tag_defs WHERE name = ?`).run(name);
  return info.changes > 0;
}

/** 批量并入标签库（用于自动吸收 AI 新建的标签），已存在的忽略。 */
export function ensureTagDefs(names: string[]): void {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (!clean.length) return;
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT OR IGNORE INTO tag_defs (name, created_at) VALUES (?, ?)`);
  db.transaction((arr: string[]) => arr.forEach((n) => stmt.run(n, now)))(clean);
}
