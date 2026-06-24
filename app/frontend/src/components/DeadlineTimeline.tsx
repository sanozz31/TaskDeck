import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAllTasks, useUpdateTask } from "../store/useTasks";
import { pickTimelineTasks, dayStr, dueAtMs, isImminent } from "../lib/deadline";
import { useNow } from "../lib/useNow";
import { dueTone, PRIORITY_VAR, PRIORITY_LABEL } from "../lib/format";

/** 固定展示的三天刻度（空态与跨天分隔都用它）。 */
const DAYS = [
  { offset: 0, label: "今天" },
  { offset: 1, label: "明天" },
  { offset: 2, label: "后天" },
];
const SPAN_DAYS = DAYS.length;

type Task = NonNullable<ReturnType<typeof useAllTasks>["data"]>[number];

/** 时间轴上的单个任务块：双击标题行内编辑（仅标题），勾选完成。 */
function DlTask({
  task,
  now,
  update,
}: {
  task: Task;
  now: number;
  update: ReturnType<typeof useUpdateTask>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  // ref 守卫：Enter 保存后输入框卸载会再触发一次 blur，避免重复 mutate
  const editingRef = useRef(false);

  const startEdit = () => {
    setTitle(task.title);
    editingRef.current = true;
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };
  const saveEdit = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    const next = title.trim();
    if (next && next !== task.title) update.mutate({ id: task.id, patch: { title: next } });
    setEditing(false);
  };
  const cancelEdit = () => {
    editingRef.current = false;
    setTitle(task.title);
    setEditing(false);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <div className="dl-task" data-id={task.id}>
      <div className="dl-time">{task.due_time || "全天"}</div>
      <div
        className={`dl-pill${dueTone(task.due_date) === "overdue" ? " dl-pill--overdue" : ""}`}
      >
        <span
          className="dl-dot"
          style={{ background: PRIORITY_VAR[task.priority] }}
          title={`优先级 ${PRIORITY_LABEL[task.priority]}`}
        />
        {editing ? (
          <input
            ref={inputRef}
            className="dl-title-edit"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onKey}
            onBlur={saveEdit}
          />
        ) : (
          <span
            className={`dl-title${isImminent(task, now) ? " dl-title--imminent" : ""}`}
            onDoubleClick={startEdit}
            title="双击编辑标题"
          >
            {task.title}
          </span>
        )}
        <button
          className="dl-check"
          onClick={() => update.mutate({ id: task.id, patch: { status: "done" } })}
          title="标记完成"
          aria-label="标记完成"
          disabled={editing}
        />
      </div>
    </div>
  );
}

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
  const now = useNow();
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
      rows.push(<DlTask key={t.id} task={t} now={now} update={update} />);
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
