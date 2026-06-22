import { Router } from "express";
import { getProvider } from "../ai/provider.js";
import type { Analysis } from "../ai/schema.js";
import {
  archiveTask,
  createTask,
  listCompleted,
  listTags,
  listTasks,
  purgeExpiredDone,
  updateTask,
} from "../repo/taskRepo.js";
import {
  addTagDef,
  deleteTagDef,
  ensureTagDefs,
  listTagDefs,
  reorderTagDefs,
} from "../repo/tagDefRepo.js";
import { getSettings, setSettings } from "../repo/settingsRepo.js";

export const tasksRouter = Router();

/** 本地日期 YYYY-MM-DD（用于给 AI 推断相对日期）。 */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** AI 失败时的降级分析：原样入库为"待整理"，不阻塞闭环。 */
function fallbackAnalysis(input: string): Analysis {
  return {
    title: input.slice(0, 40),
    tags: ["待整理"],
    priority: "medium",
    due_date: null,
    due_time: null,
    scheduled_date: null,
  };
}

/** POST /tasks —— AI 分析 + 入库，返回完整任务。 */
tasksRouter.post("/tasks", async (req, res) => {
  const input = String(req.body?.input ?? "").trim();
  if (!input) return res.status(400).json({ error: "input 不能为空" });

  let analysis: Analysis;
  let model: string | null = null;
  let degraded = false;
  try {
    const provider = await getProvider();
    const knownTags = listTagDefs().map((t) => t.name);
    const result = await provider.analyze(input, todayStr(), knownTags);
    analysis = result.analysis;
    model = result.model;
  } catch (err) {
    console.error("[tasks] AI 分析失败，降级入库：", err);
    analysis = fallbackAnalysis(input);
    degraded = true;
  }

  const task = createTask({ rawInput: input, analysis, aiModel: model });
  // 把 AI 实际用到的标签并入标签库（降级时的「待分类」不入库）
  if (!degraded) ensureTagDefs(task.tags);
  res.status(201).json({ task, degraded });
});

/** GET /tasks —— 列任务，支持 status/tag/from/to 过滤。 */
tasksRouter.get("/tasks", (req, res) => {
  const { status, tag, from, to } = req.query;
  const tasks = listTasks({
    status: status ? String(status) : undefined,
    tag: tag ? String(tag) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
  });
  res.json({ tasks });
});

/** GET /tasks/completed —— 已完成任务（先清理满 7 天的，再按完成时间倒序返回）。 */
tasksRouter.get("/tasks/completed", (_req, res) => {
  purgeExpiredDone();
  res.json({ tasks: listCompleted() });
});

/** GET /tasks/calendar?from=&to= —— 日历范围查（命中 due 或 scheduled）。 */
tasksRouter.get("/tasks/calendar", (req, res) => {
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  if (!from || !to) return res.status(400).json({ error: "需要 from 和 to" });
  res.json({ tasks: listTasks({ from, to }) });
});

/** GET /tasks/by-tag/:tag */
tasksRouter.get("/tasks/by-tag/:tag", (req, res) => {
  res.json({ tasks: listTasks({ tag: req.params.tag }) });
});

/** GET /tags —— 标签 + 计数（来自任务聚合）。 */
tasksRouter.get("/tags", (_req, res) => {
  res.json({ tags: listTags() });
});

/** GET /tag-defs —— 标签库（字典表，含预设与新增）。 */
tasksRouter.get("/tag-defs", (_req, res) => {
  res.json({ tagDefs: listTagDefs() });
});

/** POST /tag-defs —— 新增标签。 */
tasksRouter.post("/tag-defs", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "标签名不能为空" });
  addTagDef(name);
  res.status(201).json({ tagDefs: listTagDefs() });
});

/** PUT /tag-defs/order —— 拖拽重排标签库次序。 */
tasksRouter.put("/tag-defs/order", (req, res) => {
  const names = req.body?.names;
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
    return res.status(400).json({ error: "names 必须为字符串数组" });
  }
  reorderTagDefs(names);
  res.json({ tagDefs: listTagDefs() });
});

/** DELETE /tag-defs/:name —— 删除标签（不影响已有任务上的标签）。 */
tasksRouter.delete("/tag-defs/:name", (req, res) => {
  deleteTagDef(req.params.name);
  res.json({ tagDefs: listTagDefs() });
});

/** PATCH /tasks/:id —— 部分更新。 */
tasksRouter.patch("/tasks/:id", (req, res) => {
  const updated = updateTask(req.params.id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: "任务不存在" });
  res.json({ task: updated });
});

/** 对外设置形态：不回传 API Key 明文，只给 hasDeepseekKey 标记。 */
function publicSettings() {
  const s = getSettings();
  return {
    aiProvider: s.ai_provider,
    deepseekBaseUrl: s.deepseek_base_url,
    deepseekModel: s.deepseek_model,
    hasDeepseekKey: !!s.deepseek_api_key,
    language: s.language,
    setupDone: s.setup_done === "1",
  };
}

/** GET /settings —— 当前设置（模型 / 语言）。 */
tasksRouter.get("/settings", (_req, res) => {
  res.json({ settings: publicSettings() });
});

/** PATCH /settings —— 更新设置。 */
tasksRouter.patch("/settings", (req, res) => {
  const b = req.body ?? {};
  const map: Record<string, string> = {};
  if (b.aiProvider !== undefined) map.ai_provider = String(b.aiProvider);
  if (b.deepseekApiKey !== undefined) map.deepseek_api_key = String(b.deepseekApiKey);
  if (b.deepseekBaseUrl !== undefined) map.deepseek_base_url = String(b.deepseekBaseUrl);
  if (b.deepseekModel !== undefined) map.deepseek_model = String(b.deepseekModel);
  if (b.language !== undefined) map.language = String(b.language);
  if (b.setupDone !== undefined) map.setup_done = b.setupDone ? "1" : "0";
  setSettings(map);
  res.json({ settings: publicSettings() });
});

/** DELETE /tasks/:id —— 软删（归档）。 */
tasksRouter.delete("/tasks/:id", (req, res) => {
  const ok = archiveTask(req.params.id);
  if (!ok) return res.status(404).json({ error: "任务不存在" });
  res.json({ ok: true });
});
