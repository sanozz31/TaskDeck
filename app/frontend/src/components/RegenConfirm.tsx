import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * 重新生成前的三选确认：旧版后台任务一律转入「已归档」，
 * 仅在「是否保留这一版的对话卡片以便切换查看」上让用户选择。
 * - 保留此版：版本切换器出现「‹ n/n ›」，可回看旧版。
 * - 删除此版：只留新版，旧版卡片不保留。
 */
export function RegenConfirm({
  onKeep,
  onDrop,
  onClose,
}: {
  onKeep: () => void;
  onDrop: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay modal-overlay--confirm" onClick={onClose}>
      <div className="modal-card modal-card--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">重新生成</div>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="confirm-msg">
            当前任务会归档至「已完成任务」，是否在对话页面保留此版任务卡片？
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-ghost btn-ghost--danger" onClick={() => { onDrop(); onClose(); }}>
            删除此版
          </button>
          <button className="btn-primary" onClick={() => { onKeep(); onClose(); }} autoFocus>
            保留此版
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
