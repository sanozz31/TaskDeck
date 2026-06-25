import type { Task } from "../types";
import { TaskItem } from "./TaskItem";

export function TaskList({
  tasks,
  empty = "还没有任务",
  visibleDate,
}: {
  tasks: Task[] | undefined;
  empty?: string;
  visibleDate?: string;
}) {
  if (!tasks) return <div className="hint">加载中…</div>;
  if (tasks.length === 0) return <div className="hint">{empty}</div>;
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} visibleDate={visibleDate} />
      ))}
    </div>
  );
}
