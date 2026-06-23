import type { Task } from "../types";
import { PRIORITY_LABEL, PRIORITY_VAR, prettyDate, dueTone } from "../lib/format";
import { isImminent } from "../lib/deadline";
import { useNow } from "../lib/useNow";
import { useUpdateTask, useDeleteTask } from "../store/useTasks";
import { markCompleted, unmarkCompleted } from "../lib/sessionCompleted";

export function TaskItem({ task, hideArchive = false }: { task: Task; hideArchive?: boolean }) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const done = task.status === "done";
  const tags = [...new Set(task.tags)];
  const now = useNow();
  const imminent = !done && isImminent(task, now);

  const toggle = () => {
    const next = done ? "todo" : "done";
    update.mutate({ id: task.id, patch: { status: next } });
    // 记录/取消「本次会话刚完成」，使其当次仍留在主列表
    if (next === "done") markCompleted(task.id);
    else unmarkCompleted(task.id);
  };

  return (
    <div className={`task-card${done ? " task-card--done" : ""}`}>
      <button
        className={`task-check${done ? " task-check--on" : ""}`}
        onClick={toggle}
        aria-label={done ? "标记未完成" : "标记完成"}
      >
        {done ? "✓" : ""}
      </button>

      <div className="task-body">
        <div className="task-title-row">
          <span className={`task-title${imminent ? " task-title--imminent" : ""}`}>
            {task.title}
          </span>
          <span
            className="task-pri"
            style={{ color: PRIORITY_VAR[task.priority] }}
            title={`优先级：${PRIORITY_LABEL[task.priority]}`}
          >
            ● {PRIORITY_LABEL[task.priority]}
          </span>
        </div>

        {task.notes && <div className="task-notes">{task.notes}</div>}

        <div className="task-meta">
          {tags.map((t) => (
            <span key={t} className="task-tag">
              #{t}
            </span>
          ))}
          {task.due_date && (
            <span className={`task-due task-due--${dueTone(task.due_date)}`}>
              截止 {prettyDate(task.due_date)}
              {task.due_time && ` ${task.due_time}`}
            </span>
          )}
        </div>
      </div>

      {!hideArchive && (
        <button
          className="task-del"
          onClick={() => del.mutate(task.id)}
          aria-label="归档"
          title="归档"
        >
          ×
        </button>
      )}
    </div>
  );
}
