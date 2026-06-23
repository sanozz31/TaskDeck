import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TaskList } from "./TaskList";
import { ConfirmModal } from "./ConfirmModal";
import { useCompletedTasks } from "../store/useTasks";
import { api } from "../api/client";

/** 「已完成」弹窗：列出所有已完成任务，顶部注明 7 天自动清除，底部可一键清理全部。 */
export function CompletedModal({ onClose }: { onClose: () => void }) {
  const { data } = useCompletedTasks();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const clearAll = useMutation({
    mutationFn: async () => {
      const tasks = data ?? [];
      await Promise.all(tasks.map((t) => api.deleteTask(t.id)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasDone = (data?.length ?? 0) > 0;

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

        {hasDone && (
          <div className="completed-clearbar">
            <button
              className="clear-completed-btn"
              onClick={() => setConfirming(true)}
              disabled={clearAll.isPending}
            >
              {clearAll.isPending ? "清理中…" : "清理所有已完成任务"}
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          title="清理所有已完成任务"
          message={`将清理 ${data?.length ?? 0} 条已完成任务，操作不可撤销。`}
          confirmText="清理"
          danger
          onConfirm={() => clearAll.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
