import type { Task, TagCount, TagDef, Settings } from "../types";

/**
 * 解析后端基址。
 * - 开发 / 浏览器：固定 loopback 8787（与 `npm run dev` 起的 server 对齐）。
 * - 打包后的 Tauri：后端是动态端口的 sidecar，向 Rust invoke `server_port` 取实际端口。
 */
let _basePromise: Promise<string> | null = null;

async function resolveBase(): Promise<string> {
  if (import.meta.env.PROD && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const port = await invoke<number>("server_port");
      return `http://127.0.0.1:${port}`;
    } catch {
      // 取不到则回退默认端口
    }
  }
  return "http://127.0.0.1:8787";
}

function getBase(): Promise<string> {
  return (_basePromise ??= resolveBase());
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getBase();
  const res = await fetch(`${base}${path}`, {
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
      const base = await getBase();
      const r = await fetch(`${base}/health`);
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

  reorderTagDefs: (names: string[]) =>
    req<{ tagDefs: TagDef[] }>("/tag-defs/order", {
      method: "PUT",
      body: JSON.stringify({ names }),
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
