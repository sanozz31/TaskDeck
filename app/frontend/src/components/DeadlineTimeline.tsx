import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAllTasks, useUpdateTask } from "../store/useTasks";
import { pickTimelineTasks, dayStr, dueAtMs } from "../lib/deadline";
import { dueTone, PRIORITY_VAR, PRIORITY_LABEL } from "../lib/format";

/** 固定展示的三天刻度（空态与跨天分隔都用它）。 */
const DAYS = [
  { offset: 0, label: "今天" },
  { offset: 1, label: "明天" },
  { offset: 2, label: "后天" },
];
const SPAN_DAYS = DAYS.length;

/**
 * 对话页顶部 DDL 时间轴：任务按截止时刻横排成一行。
 * - 有任务处按任务块内容宽度自然撑开，块间固定最小间距；空白时间段不按比例占像素。
 * - 跨天处插入「今天/明天/后天」日期刻度；每个任务块上方标自己的精确时刻。
 * - 无任务时退化为三个日期刻度（默认最小间距），整条可横向滑动。
 * - 右上角裸三角收放按钮（无圆环背景）：正三角=可收起 / 倒三角=可展开。
 * - 无任务默认收起、有任务默认展开（仅在有/无翻转时自动切换，手动收放期间保留）。
 */
export function DeadlineTimeline() {
  const { data } = useAllTasks();
  const update = useUpdateTask();
  const scrollRef = useRef<HTMLDivElement>(null);

  const tasks = pickTimelineTasks(data ?? [], SPAN_DAYS);
  const has = tasks.length > 0;

  // 收放状态：无任务默认收起、有任务默认展开（沿用旧卡片逻辑）。
  const [collapsed, setCollapsed] = useState(!has);
  const prevHas = useRef(has);
  useEffect(() => {
    if (prevHas.current !== has) {
      setCollapsed(!has);
      prevHas.current = has;
    }
  }, [has]);

  // 展开时把视窗对齐到最近的未来任务（已过去的留在左侧，可左滑回看）。
  useEffect(() => {
    if (collapsed) return;
    const align = () => {
      const el = scrollRef.current;
      if (!el) return;
      const now = Date.now();
      const future = tasks.find((t) => dueAtMs(t) >= now);
      const target = future
        ? el.querySelector<HTMLElement>(`.dl-task[data-id="${future.id}"]`)
        : null;
      el.scrollLeft = target ? Math.max(0, target.offsetLeft - 56) : 0;
    };
    align();
    const id = setInterval(align, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [tasks, collapsed]);

  // 日期 → 刻度标签（今天/明天/后天）。
  const labelOf = (date: string) =>
    DAYS.find((d) => dayStr(d.offset) === date)?.label ?? date;

  // 构造一行流：遇到日期变化插入日期刻度，其余为任务块。
  const rows: ReactNode[] = [];
  if (has) {
    let lastDate: string | null = null;
    for (const t of tasks) {
      if (t.due_date !== lastDate) {
        lastDate = t.due_date;
        rows.push(
          <div className="dl-mark" key={`mark-${t.due_date}`}>
            {labelOf(t.due_date!)}
          </div>,
        );
      }
      rows.push(
        <div className="dl-task" data-id={t.id} key={t.id}>
          <div className="dl-time">{t.due_time || "全天"}</div>
          <div
            className={`dl-pill${
              dueTone(t.due_date) === "overdue" ? " dl-pill--overdue" : ""
            }`}
          >
            <span
              className="dl-dot"
              style={{ background: PRIORITY_VAR[t.priority] }}
              title={`优先级 ${PRIORITY_LABEL[t.priority]}`}
            />
            <span className="dl-title">{t.title}</span>
            <button
              className="dl-check"
              onClick={() => update.mutate({ id: t.id, patch: { status: "done" } })}
              title="标记完成"
              aria-label="标记完成"
            />
          </div>
        </div>,
      );
    }
  } else {
    for (const d of DAYS) {
      rows.push(
        <div className="dl-mark dl-mark--empty" key={d.offset}>
          {d.label}
        </div>,
      );
    }
  }

  return (
    <>
      <button
        className={`dl-toggle${collapsed ? " dl-toggle--collapsed" : ""}`}
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "展开时间轴" : "收起时间轴"}
        title={collapsed ? "展开时间轴" : "收起时间轴"}
      >
        <span className="dl-caret" />
      </button>

      <div className={`dl-card${collapsed ? " dl-card--collapsed" : ""}`}>
        <div className="dl-track" ref={scrollRef}>
          {rows}
        </div>
      </div>
    </>
  );
}
