import { useSyncExternalStore } from "react";
import { api } from "../api/client";
import type { Task } from "../types";

/** AI 对一次输入的一次生成结果（一句话可拆出的多个任务）。 */
export interface ChatVersion {
  tasks: Task[];
  degraded?: boolean;
}

/** 一条对话消息。pending 表示该 AI 回复正在生成。 */
export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text?: string;
  input?: string; // assistant：该回复所用的原始输入（供重试/编辑重生成）
  versions?: ChatVersion[]; // assistant：历次生成，按时间先后
  activeVersion?: number; // assistant：当前查看的版本下标
  pending?: boolean;
  // 兼容历史 localStorage 的旧字段（loadInit 时迁移进 versions，运行期不再使用）
  task?: Task;
  tasks?: Task[];
  degraded?: boolean;
}

const KEY = "taskdeck.chat.v1";
let msgs: ChatMsg[] = loadInit();
const listeners = new Set<() => void>();
let seq = 0;
const nid = () => `m${Date.now()}_${seq++}`;

/** 把历史单/多任务字段迁移为 versions 模型（幂等）。 */
function migrate(m: ChatMsg): ChatMsg {
  if (m.role !== "assistant" || m.versions) return m;
  if (m.task || m.tasks) {
    const tasks = m.tasks ?? (m.task ? [m.task] : []);
    const next: ChatMsg = { ...m, versions: [{ tasks, degraded: m.degraded }], activeVersion: 0 };
    delete next.task;
    delete next.tasks;
    delete next.degraded;
    return next;
  }
  return m;
}

/** 取消息当前激活版本（无则 undefined）。 */
export function activeVersionOf(m: ChatMsg): ChatVersion | undefined {
  return m.versions?.[m.activeVersion ?? 0];
}

function loadInit(): ChatMsg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as ChatMsg[];
    // 丢弃刷新前残留的"进行中"消息，避免永久转圈；并迁移旧任务字段
    return raw.filter((m) => !m.pending).map(migrate);
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

/** 删除一条对话消息（按 id）。仅删对话记录，不影响已登记的后台任务。 */
export function removeChatMessage(id: string) {
  setMsgs(msgs.filter((m) => m.id !== id));
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
  const next = msgs.map((m) =>
    m.versions
      ? { ...m, versions: m.versions.map((v) => ({ ...v, tasks: v.tasks.map(sync) })) }
      : m,
  );
  if (changed) setMsgs(next);
}

// 当前在途请求的中断器（供 ESC 中断分析）。
let currentAbort: AbortController | null = null;

/** 中断正在进行的 AI 分析（若有）。移除转圈气泡，保留用户那条输入。 */
export function abortSubmit() {
  currentAbort?.abort();
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

  const ac = new AbortController();
  currentAbort = ac;
  try {
    const res = await api.createTask(text, ac.signal);
    setMsgs(
      msgs.map((m) =>
        m.id === pendingId
          ? {
              ...m,
              pending: false,
              input: text,
              versions: [{ tasks: res.tasks, degraded: res.degraded }],
              activeVersion: 0,
            }
          : m,
      ),
    );
  } catch (e) {
    // 用户中断：去掉转圈气泡，不留报错
    if (ac.signal.aborted || (e as Error).name === "AbortError") {
      setMsgs(msgs.filter((m) => m.id !== pendingId));
      return;
    }
    setMsgs(
      msgs.map((m) =>
        m.id === pendingId
          ? { ...m, pending: false, text: `出错了：${(e as Error).message}` }
          : m,
      ),
    );
  } finally {
    if (currentAbort === ac) currentAbort = null;
    onSettled?.();
  }
}

/**
 * 在某条 assistant 消息原地重新生成：
 * 先把「当前激活版本」已登记的后台任务软归档（转入已归档，不在主视图重复出现），
 * 再用 input 重跑，回来后**追加为新版本**并设为激活。
 * keepOld=true 则保留旧版本于版本切换器供回看；false 则丢弃旧版本卡片。
 * 两种都归档旧版后台任务（决策③：旧版任务统一进已归档）。
 */
async function regenerate(
  assistantId: string,
  input: string,
  opts: { keepOld: boolean },
  onSettled?: () => void,
): Promise<void> {
  const text = input.trim();
  if (!text) return;
  const target = msgs.find((m) => m.id === assistantId);
  if (!target) return;
  const cur = activeVersionOf(target);

  // 立即转入 pending：UI 即时显示「正在分析」，旧卡隐藏
  setMsgs(msgs.map((m) => (m.id === assistantId ? { ...m, pending: true } : m)));

  // 归档当前版本的后台任务（容错：单条失败不阻断整体）
  if (cur && cur.tasks.length) {
    await Promise.all(cur.tasks.map((t) => api.deleteTask(t.id).catch(() => {})));
  }

  const ac = new AbortController();
  currentAbort = ac;
  try {
    const res = await api.createTask(text, ac.signal);
    setMsgs(
      msgs.map((m) => {
        if (m.id !== assistantId) return m;
        const prev = m.versions ?? [];
        const kept = opts.keepOld ? prev : [];
        const versions = [...kept, { tasks: res.tasks, degraded: res.degraded }];
        return { ...m, pending: false, input: text, versions, activeVersion: versions.length - 1 };
      }),
    );
  } catch {
    // 中断或出错：退出 pending，版本不变（旧任务已归档，可在已完成弹窗恢复）
    setMsgs(msgs.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
  } finally {
    if (currentAbort === ac) currentAbort = null;
    onSettled?.();
  }
}

/**
 * 编辑某条用户气泡的文本并让其后的 AI 回复重新生成。
 * userId 为用户消息 id；更新其文本后，对紧随的 assistant 消息执行 regenerate。
 */
export async function editAndRegenerate(
  userId: string,
  newInput: string,
  opts: { keepOld: boolean },
  onSettled?: () => void,
): Promise<void> {
  const text = newInput.trim();
  if (!text) return;
  const idx = msgs.findIndex((m) => m.id === userId);
  if (idx < 0) return;
  setMsgs(msgs.map((m, i) => (i === idx ? { ...m, text } : m)));
  const next = msgs[idx + 1];
  if (next && next.role === "assistant") {
    await regenerate(next.id, text, opts, onSettled);
  } else {
    // 该用户气泡后无 AI 回复（异常情形）：插入一条并生成
    const aId = nid();
    const arr = [...msgs];
    arr.splice(idx + 1, 0, { id: aId, role: "assistant", pending: true });
    setMsgs(arr);
    await regenerate(aId, text, { keepOld: false }, onSettled);
  }
}

/** 对某条 assistant 回复用其原始输入重试重生成。 */
export async function retry(
  assistantId: string,
  opts: { keepOld: boolean },
  onSettled?: () => void,
): Promise<void> {
  const i = msgs.findIndex((m) => m.id === assistantId);
  if (i < 0) return;
  const input =
    msgs[i].input ?? (i > 0 && msgs[i - 1].role === "user" ? msgs[i - 1].text : undefined);
  if (!input) return;
  await regenerate(assistantId, input, opts, onSettled);
}

/**
 * 删除整条 AI 回复气泡，并把其当前版本已登记的后台任务一并软归档
 * （转入已归档，可在「已完成」弹窗恢复/永久删除）。
 */
export async function removeAssistantWithTasks(
  assistantId: string,
  onSettled?: () => void,
): Promise<void> {
  const target = msgs.find((m) => m.id === assistantId);
  const cur = target ? activeVersionOf(target) : undefined;
  if (cur && cur.tasks.length) {
    await Promise.all(cur.tasks.map((t) => api.deleteTask(t.id).catch(() => {})));
  }
  removeChatMessage(assistantId);
  onSettled?.();
}

/** 切换某条 assistant 回复查看的版本。 */
export function setVersion(assistantId: string, idx: number) {
  setMsgs(
    msgs.map((m) =>
      m.id === assistantId && m.versions && idx >= 0 && idx < m.versions.length
        ? { ...m, activeVersion: idx }
        : m,
    ),
  );
}
