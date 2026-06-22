import { getDb } from "../db.js";

export interface TagDef {
  name: string;
  created_at: string;
}

/** 标签库全部标签，按加入时间正序（预设在前，新增在后）。 */
export function listTagDefs(): TagDef[] {
  return getDb()
    .prepare(`SELECT name, created_at FROM tag_defs ORDER BY created_at ASC, name ASC`)
    .all() as TagDef[];
}

/** 新增标签（已存在则忽略），返回是否实际插入。 */
export function addTagDef(name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  const info = getDb()
    .prepare(`INSERT OR IGNORE INTO tag_defs (name, created_at) VALUES (?, ?)`)
    .run(clean, new Date().toISOString());
  return info.changes > 0;
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
