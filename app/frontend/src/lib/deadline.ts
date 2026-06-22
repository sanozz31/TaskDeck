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

/** 任务截止时刻（ms）；无 due_time 视为当天 23:59；无 due_date 返回 Infinity。 */
export function dueAtMs(t: Task): number {
  if (!t.due_date) return Infinity;
  const [y, m, d] = t.due_date.split("-").map(Number);
  if (t.due_time) {
    const [hh, mm] = t.due_time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm).getTime();
  }
  return new Date(y, m - 1, d, 23, 59).getTime();
}

function isOpen(t: Task): boolean {
  return t.status !== "done" && t.status !== "archived";
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
