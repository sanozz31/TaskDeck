import type { Priority, Task } from "../types";

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "急",
};

export const PRIORITY_VAR: Record<Priority, string> = {
  low: "var(--pri-low)",
  medium: "var(--pri-medium)",
  high: "var(--pri-high)",
  urgent: "var(--pri-urgent)",
};

/** 'YYYY-MM-DD' → '6月26日 周五'，无则返回空串。 */
export function prettyDate(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  const date = new Date(y, m - 1, day);
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${m}月${day}日 ${week}`;
}

/**
 * 任务排序键：有「具体时间」(due_date + due_time) 的排在前、按日期时间升序；
 * 没有具体时间的统一沉到最后（组内仍按日期，无日期的垫底）。
 */
export function deadlineSortKey(t: Task): string {
  if (t.due_date && t.due_time) return `0_${t.due_date} ${t.due_time}`;
  return `1_${t.due_date ?? t.scheduled_date ?? "9999-99-99"}`;
}

/** 相对今天的紧迫度，用于 due 文案着色。 */
export function dueTone(d: string | null): "overdue" | "soon" | "normal" | "" {
  if (!d) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(y, m - 1, day);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= 2) return "soon";
  return "normal";
}
