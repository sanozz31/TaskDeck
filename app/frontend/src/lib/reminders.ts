import { prettyDate } from "./format";
import { dueAtMs } from "./deadline";
import type { Task } from "../types";

/**
 * DDL 提醒（仅在 App 运行时生效）：
 * - 截止前 24 小时、前 6 小时各弹一次系统通知；
 * - 纯日期任务（无 due_time）锚定当天 23:59 作为截止时刻。
 * 通过 Web Notification 弹系统通知，已提醒过的「任务:阶段」记到 localStorage 去重。
 */
const NOTIFIED_KEY = "taskdeck.notified.v2"; // v2：升级为 taskId:stage 去重
const H = 60 * 60 * 1000;
/** 提醒阶段，按截止前时长从长到短排列。 */
const STAGES = [
  { key: "24h", before: 24 * H, label: "约 24 小时" },
  { key: "6h", before: 6 * H, label: "约 6 小时" },
] as const;
const GRACE_MS = 24 * H; // 超过截止 24h 后不再补提醒，避免刷屏

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
    const dueAt = dueAtMs(task); // 复用 deadline.ts 的统一「截止时刻」口径（无 due_time→当天 23:59）
    if (!Number.isFinite(dueAt)) continue; // 无 due_date：dueAtMs 返回 Infinity
    if (now > dueAt + GRACE_MS) continue; // 过期太久不再补提醒

    const due = `${prettyDate(task.due_date)}${task.due_time ? " " + task.due_time : ""}`;

    // 从最紧（6h）到最松（24h）判断：发最紧的一个未发阶段，
    // 并把更早（更松）阶段一并标记已发，避免启动补发时一次连弹两条。
    for (let i = STAGES.length - 1; i >= 0; i--) {
      const st = STAGES[i];
      if (now < dueAt - st.before) continue; // 还没到这个提醒点
      const mark = `${task.id}:${st.key}`;
      if (notified.has(mark)) break; // 最紧的已发过，本任务本轮结束

      new Notification("⏰ 任务截止提醒", {
        body: `距截止${st.label} · ${task.title}\n截止 ${due}`,
        tag: mark,
      });
      notified.add(mark);
      for (let j = 0; j < i; j++) notified.add(`${task.id}:${STAGES[j].key}`);
      break; // 本任务本轮只发一条
    }
  }

  // 清掉已不存在任务的记录，避免无限增长
  for (const mark of notified) {
    if (!liveIds.has(mark.split(":")[0])) notified.delete(mark);
  }
  saveNotified(notified);
}

/** 首次进入时申请通知权限（default 状态才弹）。 */
export function ensureNotificationPermission(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
