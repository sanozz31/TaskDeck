import { getDb } from "../db.js";

export interface AiConfig {
  aiProvider: string; // 'sdk' | 'deepseek'
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
}

const DEFAULTS: Record<string, string> = {
  ai_provider: "sdk",
  deepseek_api_key: "",
  deepseek_base_url: "https://api.deepseek.com",
  deepseek_model: "deepseek-v4-flash",
  language: "zh",
};

/** 读取全部设置（带默认值兜底）。 */
export function getSettings(): Record<string, string> {
  const rows = getDb().prepare(`SELECT key, value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/** 逐键 upsert 设置。 */
export function setSettings(patch: Record<string, string>): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = @value`,
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null) continue;
      stmt.run({ key, value: String(value) });
    }
  })();
}

/** provider 取用的 AI 配置。 */
export function getAiConfig(): AiConfig {
  const s = getSettings();
  return {
    aiProvider: s.ai_provider,
    deepseekApiKey: s.deepseek_api_key,
    deepseekBaseUrl: s.deepseek_base_url,
    deepseekModel: s.deepseek_model,
  };
}
