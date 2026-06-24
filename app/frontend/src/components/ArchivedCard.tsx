import { useState } from "react";
import type { Task } from "../types";
import { PRIORITY_LABEL, PRIORITY_VAR, prettyDate, dueTone } from "../lib/format";
import { ConfirmModal } from "./ConfirmModal";

/**
 * 「已归档」任务卡片：沿用普通任务卡的视觉（标题 / 优先级 / 标签 / 截止），
 * 但右上角 × 为**永久删除**（硬删，二次确认、不可恢复），右下角为**恢复**按钮（截止时间向左让位）。
 * 归档态无完成勾选与编辑。
 */
export function ArchivedCard({
  task,
  onRestore,
  onPurge,
}: {
  task: Task;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const [confirmPurge, setConfirmPurge] = useState(false);
  const tags = [...new Set(task.tags)];

  return (
    <div className="task-card task-card--archived">
      {/* 完成状态圆圈（仅显示：✓=已完成，空=归档/未完成） */}
      <span
        className={`task-check${task.status === "done" ? " task-check--on" : ""}`}
        aria-label={task.status === "done" ? "已完成" : "未完成"}
      >
        {task.status === "done" ? "✓" : ""}
      </span>
      <div className="task-body">
        <div className="task-title-row">
          <span className="task-title-main">
            <span className="task-title">{task.title}</span>
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
          {/* 右侧成组：截止时间右对齐，紧贴恢复按钮 */}
          <span className="task-tail">
            {task.due_date && (
              <span className={`task-due task-due--${dueTone(task.due_date)}`}>
                截止 {prettyDate(task.due_date)}
                {task.due_time && ` ${task.due_time}`}
              </span>
            )}
            <button className="task-restore" onClick={onRestore}>
              恢复
            </button>
          </span>
        </div>
      </div>

      <button
        className="task-del"
        onClick={() => setConfirmPurge(true)}
        aria-label="永久删除"
        title="永久删除（不可恢复）"
      >
        ×
      </button>

      {confirmPurge && (
        <ConfirmModal
          title="永久删除任务"
          message={`将永久删除「${task.title}」，不可恢复，确定继续？`}
          confirmText="永久删除"
          danger
          onConfirm={onPurge}
          onClose={() => setConfirmPurge(false)}
        />
      )}
    </div>
  );
}
