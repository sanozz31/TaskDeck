import type { Task, TagCount, TagDef, Settings } from "../types";

/** 后端基址。开发期固定 loopback；M3 sidecar 阶段可由 Tauri 注入端口。 */
const BASE = "http://127.0.0.1:8787";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `请求失败 ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** 轮询 /health，直到后端就绪（处理冷启动）。 */
export async function waitForHealth(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {
      // 后端未起，稍后重试
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export const api = {
  createTask: (input: string) =>
    req<{ task: Task; degraded: boolean }>("/tasks", {
      method: "POST",
      body: JSON.stringify({ input }),
    }),

  listTasks: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req<{ tasks: Task[] }>(`/tasks${qs ? `?${qs}` : ""}`).then((r) => r.tasks);
  },

  completed: () =>
    req<{ tasks: Task[] }>("/tasks/completed").then((r) => r.tasks),

  calendar: (from: string, to: string) =>
    req<{ tasks: Task[] }>(`/tasks/calendar?from=${from}&to=${to}`).then((r) => r.tasks),

  byTag: (tag: string) =>
    req<{ tasks: Task[] }>(`/tasks/by-tag/${encodeURIComponent(tag)}`).then((r) => r.tasks),

  tags: () => req<{ tags: TagCount[] }>("/tags").then((r) => r.tags),

  tagDefs: () => req<{ tagDefs: TagDef[] }>("/tag-defs").then((r) => r.tagDefs),

  addTagDef: (name: string) =>
    req<{ tagDefs: TagDef[] }>("/tag-defs", {
      method: "POST",
      body: JSON.stringify({ name }),
    }).then((r) => r.tagDefs),

  deleteTagDef: (name: string) =>
    req<{ tagDefs: TagDef[] }>(`/tag-defs/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }).then((r) => r.tagDefs),

  settings: () => req<{ settings: Settings }>("/settings").then((r) => r.settings),

  updateSettings: (patch: Record<string, string>) =>
    req<{ settings: Settings }>("/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((r) => r.settings),

  updateTask: (id: string, patch: Partial<Task>) =>
    req<{ task: Task }>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((r) => r.task),

  deleteTask: (id: string) =>
    req<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
};
