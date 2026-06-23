import type { Task } from "../types";
import { PRIORITY_WEIGHT } from "./format";

/** 本地今天 YYYY-MM-DD。 */
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 本地某天偏移后的 YYYY-MM-DD（offset 天）。 */
export function dayStr(offset: number): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/**
 * 任务截止时刻（ms）；无 due_time 或 due_time 畸形视为当天 23:59；无 due_date 返回 Infinity。
 * 前端唯一真源：迫近高亮(isImminent) 与 DDL 提醒(reminders.ts) 都复用本函数。
 * @see app/server/src/repo/taskRepo.ts 的 dueAtMs —— 后端独立一份（前后端分包），口径必须与此一致。
 */
export function dueAtMs(t: Task): number {
  if (!t.due_date) return Infinity;
  const [y, m, d] = t.due_date.split("-").map(Number);
  if (t.due_time) {
    const [hh, mm] = t.due_time.split(":").map(Number);
    // due_time 畸形（NaN）时回退当天 23:59，避免 NaN 让迫近判定/升级静默失效
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return new Date(y, m - 1, d, hh, mm).getTime();
    }
  }
  return new Date(y, m - 1, d, 23, 59).getTime();
}

function isOpen(t: Task): boolean {
  return t.status !== "done" && t.status !== "archived";
}

/** 「迫近」窗口：截止前 2 小时。 */
export const IMMINENT_MS = 2 * 60 * 60 * 1000;

/**
 * 任务是否「迫近」：未完成、有截止日期，且距截止还剩 ≤ 2 小时（含已过期）。
 * - 用 `dueAtMs`（无 due_time 视当天 23:59），故全天任务在当天最后 2 小时（21:59 起）算迫近。
 * - **已过截止时刻仍算迫近**（持续标红，直到任务完成），不只是「最后 2h」窗口。
 * - 这是实时派生的时间紧迫度，与静态的 priority 字段互不影响。
 */
export function isImminent(t: Task, now: number): boolean {
  if (!isOpen(t) || !t.due_date) return false;
  return dueAtMs(t) - now <= IMMINENT_MS;
}

/**
 * 时间轴任务：今天起 days 天内、未完成、有 due_date 的任务。
 * 排序：先按截止时刻升序，同一时刻按优先级（urgent→low）。
 */
export function pickTimelineTasks(tasks: Task[], days = 3): Task[] {
  const today = todayStr();
  const last = dayStr(days - 1);
  return tasks
    .filter((t) => isOpen(t) && t.due_date && t.due_date >= today && t.due_date <= last)
    .sort((a, b) => {
      const diff = dueAtMs(a) - dueAtMs(b);
      return diff !== 0 ? diff : PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    });
}
