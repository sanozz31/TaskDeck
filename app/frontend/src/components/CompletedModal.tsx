import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfirmModal } from "./ConfirmModal";
import { ArchivedCard } from "./ArchivedCard";
import { useCompletedTasks, useArchivedTasks, useUpdateTask } from "../store/useTasks";
import { api } from "../api/client";
import { notifyTasksChanged } from "../lib/channel";

/**
 * 「已完成」弹窗：不区分已完成 / 已归档，合并为一列——已完成在上、已归档在下。
 * 每张卡片统一可**恢复**（→待办）或**永久删除**（硬删不可恢复）；底部可一键清理所有已完成。
 */
export function CompletedModal({ onClose }: { onClose: () => void }) {
  const { data: done } = useCompletedTasks();
  const { data: archived } = useArchivedTasks();
  // 合并为一列：已完成在上，已归档在下
  const items = [...(done ?? []), ...(archived ?? [])];
  const update = useUpdateTask();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false); // 清理所有已完成

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"], exact: false });
    qc.invalidateQueries({ queryKey: ["calendar"], exact: false });
    qc.invalidateQueries({ queryKey: ["tags"], exact: false });
    notifyTasksChanged();
  };

  const clearAll = useMutation({
    mutationFn: async () => {
      const tasks = done ?? [];
      await Promise.all(tasks.map((t) => api.deleteTask(t.id)));
    },
    onSuccess: invalidate,
  });

  const purge = useMutation({
    mutationFn: (id: string) => api.purgeTask(id),
    onSuccess: invalidate,
  });

  // 拿回来：归档 → 待办（非破坏性，无需二次确认）
  const restore = (id: string) => update.mutate({ id, patch: { status: "todo" } });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasDone = (done?.length ?? 0) > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">已完成</div>
            <div className="modal-sub">每条可恢复或永久删除；已完成满 7 天自动清除</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">
          {items.length === 0 ? (
            <div className="hint">还没有已完成或归档的任务</div>
          ) : (
            <div className="archived-section">
              {items.map((t) => (
                <ArchivedCard
                  key={t.id}
                  task={t}
                  onRestore={() => restore(t.id)}
                  onPurge={() => purge.mutate(t.id)}
                />
              ))}
            </div>
          )}
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
          message={`将归档 ${done?.length ?? 0} 条已完成任务（之后可在「已归档」里恢复或永久删除）。`}
          confirmText="清理"
          danger
          onConfirm={() => clearAll.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
