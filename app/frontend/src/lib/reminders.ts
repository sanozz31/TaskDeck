import { prettyDate } from "./format";
import type { Task } from "../types";

/**
 * DDL 提醒（仅在 App 运行时生效）：
 * - 有具体时间(due_time)：截止前 30 分钟提醒；
 * - 只有日期：当天上午 8:00 提醒。
 * 通过 Web Notification 弹系统通知，已提醒过的任务记到 localStorage 去重。
 */
const NOTIFIED_KEY = "taskdeck.notified.v1";
const REMIND_BEFORE_MS = 30 * 60 * 1000; // 提前 30 分钟
const DATE_ONLY_HOUR = 8; // 纯日期 DDL 的提醒时刻（上午 8 点）
const GRACE_MS = 24 * 60 * 60 * 1000; // 超过截止 24h 后不再补提醒，避免刷屏

function parseYmd(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** 返回该任务的提醒时刻与截止边界（毫秒）；无 due_date 则 null。 */
function windowOf(task: Task): { remindAt: number; dueBoundary: number } | null {
  if (!task.due_date) return null;
  const [y, m, d] = parseYmd(task.due_date);
  if (task.due_time) {
    const [hh, mm] = task.due_time.split(":").map(Number);
    const dueAt = new Date(y, m - 1, d, hh, mm).getTime();
    return { remindAt: dueAt - REMIND_BEFORE_MS, dueBoundary: dueAt };
  }
  return {
    remindAt: new Date(y, m - 1, d, DATE_ONLY_HOUR, 0).getTime(),
    dueBoundary: new Date(y, m - 1, d, 23, 59).getTime(),
  };
}

function loadNotified(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveNotified(s: Set<string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...s]));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/** 扫描任务，对到点且未提醒过的待办弹系统通知。 */
export function checkReminders(tasks: Task[]): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const now = Date.now();
  const notified = loadNotified();
  const liveIds = new Set(tasks.map((t) => t.id));

  for (const task of tasks) {
    if (task.status === "done" || task.status === "archived") continue;
    if (notified.has(task.id)) continue;
    const w = windowOf(task);
    if (!w) continue;
    if (now < w.remindAt || now > w.dueBoundary + GRACE_MS) continue;

    const when = `${prettyDate(task.due_date)}${task.due_time ? " " + task.due_time : ""}`;
    new Notification("⏰ 任务截止提醒", { body: `${task.title}\n截止 ${when}`, tag: task.id });
    notified.add(task.id);
  }

  // 清掉已不存在任务的记录，避免无限增长
  for (const id of notified) if (!liveIds.has(id)) notified.delete(id);
  saveNotified(notified);
}

/** 首次进入时申请通知权限（default 状态才弹）。 */
export function ensureNotificationPermission(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
