import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "./config.js";

let _db: Database.Database | null = null;

/** 单例数据库连接，首次调用建表。 */
export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  _db = db;
  return db;
}

/** 建表 + 索引。tags 以 JSON 数组文本存储，用 json_each 查询。 */
function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id             TEXT PRIMARY KEY,
      raw_input      TEXT NOT NULL,
      title          TEXT NOT NULL,
      notes          TEXT,
      tags           TEXT NOT NULL DEFAULT '[]',
      category       TEXT, -- deprecated: 分类维度已下线，列保留以兼容旧库，应用层不再读写
      priority       TEXT NOT NULL DEFAULT 'medium',
      due_date       TEXT,
      due_time       TEXT,
      scheduled_date TEXT,
      status         TEXT NOT NULL DEFAULT 'todo',
      ai_meta        TEXT,
      ai_model       TEXT,
      completed_at   TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
  `);

  // 旧库迁移：补 completed_at 列（记录任务被标记完成的时刻，用于 7 天清理）
  const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "completed_at")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN completed_at TEXT`);
  }
  // 截止具体时间 HH:MM（可选）：用于提前半小时提醒与当天按时间排序
  if (!cols.some((c) => c.name === "due_time")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN due_time TEXT`);
  }

  // 标签库（字典表）：用户可增删，AI 打标签时优先复用，新标签自动并入
  // sort_order：用户在标签页拖拽手动排序后的次序（越小越靠前）
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_defs (
      name       TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  // 旧库迁移：补 sort_order 列，并按原有 created_at 次序回填初始排序
  const tagCols = db.prepare(`PRAGMA table_info(tag_defs)`).all() as { name: string }[];
  if (!tagCols.some((c) => c.name === "sort_order")) {
    db.exec(`ALTER TABLE tag_defs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
    const ordered = db
      .prepare(`SELECT name FROM tag_defs ORDER BY created_at ASC, name ASC`)
      .all() as { name: string }[];
    const upd = db.prepare(`UPDATE tag_defs SET sort_order = ? WHERE name = ?`);
    db.transaction(() => ordered.forEach((r, i) => upd.run(i, r.name)))();
  }
  // 首次（空库）种入预设标签，按列表顺序赋初始 sort_order
  const tagCount = (db.prepare(`SELECT COUNT(*) AS c FROM tag_defs`).get() as { c: number }).c;
  if (tagCount === 0) {
    const now = new Date().toISOString();
    const presets = ["学习", "工作", "生活", "娱乐", "健康", "财务", "家庭", "社交", "旅行"];
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO tag_defs (name, created_at, sort_order) VALUES (?, ?, ?)`,
    );
    const seed = db.transaction((names: string[]) => {
      names.forEach((n, i) => stmt.run(n, now, i));
    });
    seed(presets);
  }

  // 设置（键值表）：AI 模型选择、第三方模型配置、语言
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const defaults: Record<string, string> = {
    ai_provider: "deepseek",
    deepseek_base_url: "https://api.deepseek.com",
    deepseek_model: "deepseek-v4-flash",
    language: "zh",
  };
  const putDefault = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) putDefault.run(k, v);
  })();
}
