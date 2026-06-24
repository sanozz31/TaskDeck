import { useSyncExternalStore } from "react";
import { api } from "../api/client";
import type { Task } from "../types";

/** 一条对话消息。pending 表示该 AI 回复正在生成。 */
export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text?: string;
  task?: Task; // 旧版单任务（兼容历史 localStorage）
  tasks?: Task[]; // 一句话可拆出的多个任务
  degraded?: boolean;
  pending?: boolean;
}

const KEY = "taskdeck.chat.v1";
let msgs: ChatMsg[] = loadInit();
const listeners = new Set<() => void>();
let seq = 0;
const nid = () => `m${Date.now()}_${seq++}`;

function loadInit(): ChatMsg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as ChatMsg[];
    // 丢弃刷新前残留的"进行中"消息，避免永久转圈
    return raw.filter((m) => !m.pending);
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(msgs.filter((m) => !m.pending)));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

function setMsgs(next: ChatMsg[]) {
  msgs = next;
  persist();
  for (const l of listeners) l();
}

/** 订阅对话消息。状态在模块级，切换视图/卸载组件都不丢，并持久化到 localStorage。 */
export function useChatMessages(): ChatMsg[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => msgs,
    () => msgs,
  );
}

export function clearChat() {
  setMsgs([]);
}

/**
 * 用实时任务数据持续刷新对话快照（按 updated_at 判定是否变化）。
 * 目的：任务一旦被归档而脱离实时列表，快照里已存着它最后一刻的完整状态，
 * 对话卡回退到快照时即「定格在最后一次状态」，而非退回创建时的旧值。
 * 仅在确有变化时写入，避免轮询触发死循环。
 */
export function reconcileChatTasks(byId: Map<string, Task>) {
  let changed = false;
  const sync = (t: Task): Task => {
    const live = byId.get(t.id);
    if (live && live.updated_at !== t.updated_at) {
      changed = true;
      return live;
    }
    return t;
  };
  const next = msgs.map((m) => {
    if (!m.task && !m.tasks) return m;
    return {
      ...m,
      task: m.task ? sync(m.task) : m.task,
      tasks: m.tasks ? m.tasks.map(sync) : m.tasks,
    };
  });
  if (changed) setMsgs(next);
}

/**
 * 提交一句任务。整个请求脱离 React 组件生命周期：
 * 即使用户切到别的视图、ChatPanel 被卸载，AI 结果回来后仍会写入 store。
 */
export async function submitTask(input: string, onSettled?: () => void): Promise<void> {
  const text = input.trim();
  if (!text) return;
  const pendingId = nid();
  setMsgs([
    ...msgs,
    { id: nid(), role: "user", text },
    { id: pendingId, role: "assistant", pending: true },
  ]);

  try {
    const res = await api.createTask(text);
    setMsgs(
      msgs.map((m) =>
        m.id === pendingId
          ? { ...m, pending: false, tasks: res.tasks, degraded: res.degraded }
          : m,
      ),
    );
  } catch (e) {
    setMsgs(
      msgs.map((m) =>
        m.id === pendingId
          ? { ...m, pending: false, text: `出错了：${(e as Error).message}` }
          : m,
      ),
    );
  } finally {
    onSettled?.();
  }
}
