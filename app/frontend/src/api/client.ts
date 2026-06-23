import type { Task, TagCount, TagDef, Settings } from "../types";

/**
 * 解析后端基址。
 * - 开发 / 浏览器：固定 loopback 8787（与 `npm run dev` 起的 server 对齐）。
 * - 打包后的 Tauri：后端是动态端口的 sidecar，向 Rust invoke `server_port` 取实际端口。
 */
// 解析成功的后端基址，落定后复用；未落定前不缓存，避免把"端口尚未就绪"的坏地址焊死。
let _base: string | null = null;

/** 是否运行在打包后的 Tauri webview 内（PROD 且注入了内部 API）。 */
function isTauri(): boolean {
  return (
    import.meta.env.PROD &&
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

/**
 * 打包环境下向 Rust 取后端 sidecar 的动态端口。
 * 返回 null 表示端口尚未就绪（sidecar 还在冷启动）——调用方应稍后重试，切勿缓存。
 */
async function tauriPort(): Promise<number | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const port = await invoke<number | null>("server_port");
    return typeof port === "number" && port > 0 ? port : null;
  } catch {
    return null;
  }
}

/**
 * 解析后端基址（必要时即时解析，不缓存未就绪状态）。
 * - 开发 / 浏览器：固定 loopback 8787。
 * - 打包 Tauri：动态端口；端口未就绪时返回 null，由 waitForHealth 轮询重试。
 */
async function resolveBase(): Promise<string | null> {
  if (_base) return _base;
  if (isTauri()) {
    const port = await tauriPort();
    if (port == null) return null; // 端口未就绪：不缓存，触发重试
    return (_base = `http://127.0.0.1:${port}`);
  }
  return (_base = "http://127.0.0.1:8787");
}

/** 供请求层使用：基址必然已由 waitForHealth 落定，兜底再解析一次。 */
async function getBase(): Promise<string> {
  return _base ?? (await resolveBase()) ?? "http://127.0.0.1:8787";
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

/**
 * 轮询 /health，直到后端就绪（处理 sidecar 冷启动）。
 * 每轮都重新解析基址：打包环境下 sidecar 端口可能比 webview 晚就绪，
 * 端口未就绪时 resolveBase 返回 null（不缓存），下一轮再试，直到拿到真实端口。
 */
export async function waitForHealth(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const base = await resolveBase();
      if (base) {
        const r = await fetch(`${base}/health`);
        if (r.ok) return true;
      }
    } catch {
      // 后端/端口未就绪，稍后重试
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export const api = {
  createTask: (input: string) =>
    req<{ tasks: Task[]; degraded: boolean }>("/tasks", {
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

  clearAllData: () =>
    req<{ ok: boolean }>(`/tasks/clear-all`, { method: "DELETE" }),
};
