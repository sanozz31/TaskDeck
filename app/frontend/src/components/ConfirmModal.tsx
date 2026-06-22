import { useEffect } from "react";

/** 通用确认弹窗：复用 modal 视觉，破坏性操作可标 danger（红色确认按钮）。 */
export function ConfirmModal({
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-card--sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="confirm-msg">{message}</p>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>
            {cancelText}
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
