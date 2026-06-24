import { useRef, useState } from "react";
import type { Task } from "../types";
import { PRIORITY_LABEL, PRIORITY_VAR, prettyDate, dueTone } from "../lib/format";
import { pickTimelineTasks, todayStr, dayStr, isImminent } from "../lib/deadline";
import { useNow } from "../lib/useNow";
import { useUpdateTask } from "../store/useTasks";

function isOpen(t: Task): boolean {
  return t.status !== "done" && t.status !== "archived";
}

/** 单行任务:勾选完成 + 标题 + 优先级点 + 截止时间(仅有具体 due_time 时显示)。 */
function WidgetRow({ task }: { task: Task }) {
  const update = useUpdateTask();
  const now = useNow();
  const imminent = isImminent(task, now);

  // 双击标题行内编辑(仅标题)
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
    <div className="wg-row">
      <button
        className="wg-check"
        onClick={() => update.mutate({ id: task.id, patch: { status: "done" } })}
        aria-label="标记完成"
        title="标记完成"
        disabled={editing}
      />
      {editing ? (
        <input
          ref={inputRef}
          className="wg-row-edit"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onKey}
          onBlur={saveEdit}
        />
      ) : (
        <span
          className={`wg-row-title${imminent ? " wg-row-title--imminent" : ""}`}
          onDoubleClick={startEdit}
          title="双击编辑标题"
        >
          {task.title}
        </span>
      )}
      <span
        className="wg-row-pri"
        style={{ background: PRIORITY_VAR[task.priority] }}
        title={`优先级:${PRIORITY_LABEL[task.priority]}`}
      />
      {task.due_time && (
        <span className={`wg-row-due wg-row-due--${dueTone(task.due_date)}`}>
          {task.due_time}
        </span>
      )}
    </div>
  );
}

/** 分组:表头左侧主标签(今天/明天/后天 或日期),右侧具体日期 + 计数。 */
function Group({
  label,
  date,
  tasks,
  showEmpty = false,
}: {
  label: string;
  date?: string | null;
  tasks: Task[];
  showEmpty?: boolean;
}) {
  if (tasks.length === 0 && !showEmpty) return null;
  return (
    <section className="wg-group">
      <div className="wg-group-head">
        <span className="wg-group-label">
          {label}
          {date && <span className="wg-group-date">{prettyDate(date)}</span>}
        </span>
        <span className="wg-group-n">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="wg-group-empty">暂无</div>
      ) : (
        tasks.map((t) => <WidgetRow key={t.id} task={t} />)
      )}
    </section>
  );
}

/** 近期:今 / 明 / 后三天,表头带具体日期(复用 pickTimelineTasks 过滤+排序)。 */
export function AgendaView({ tasks }: { tasks: Task[] }) {
  const timeline = pickTimelineTasks(tasks, 3);
  const today = todayStr();
  const d1 = dayStr(1);
  const d2 = dayStr(2);
  const byDay = (d: string) => timeline.filter((t) => t.due_date === d);

  return (
    <div className="wg-scroll">
      <Group label="今天" date={today} tasks={byDay(today)} showEmpty />
      <Group label="明天" date={d1} tasks={byDay(d1)} showEmpty />
      <Group label="后天" date={d2} tasks={byDay(d2)} showEmpty />
    </div>
  );
}

/** 全部:所有未完成任务,按日期分组,每组表头放日期;无日期归「未排期」垫底。 */
export function AllView({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter(isOpen);
  if (open.length === 0) {
    return (
      <div className="wg-scroll">
        <div className="wg-empty">没有待办,清爽~</div>
      </div>
    );
  }

  // 按 due_date 聚合(无日期单列),日期升序、无日期最后。
  const dated = new Map<string, Task[]>();
  const undated: Task[] = [];
  for (const t of open) {
    if (t.due_date) {
      (dated.get(t.due_date) ?? dated.set(t.due_date, []).get(t.due_date)!).push(t);
    } else {
      undated.push(t);
    }
  }
  const days = [...dated.keys()].sort();

  return (
    <div className="wg-scroll">
      {days.map((d) => (
        <Group key={d} label={prettyDate(d)} tasks={dated.get(d)!} />
      ))}
      {undated.length > 0 && <Group label="未排期" tasks={undated} />}
    </div>
  );
}
