import { useEffect } from "react";
import { TaskList } from "./TaskList";
import { useCompletedTasks } from "../store/useTasks";

/** 「已完成」弹窗：列出所有已完成任务，顶部注明 7 天自动清除。 */
export function CompletedModal({ onClose }: { onClose: () => void }) {
  const { data } = useCompletedTasks();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">已完成</div>
            <div className="modal-sub">完成满 7 天将自动清除</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">
          <TaskList tasks={data} empty="还没有已完成的任务" />
        </div>
      </div>
    </div>
  );
}
