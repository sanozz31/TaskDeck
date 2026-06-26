import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { requestNotificationPermission } from "../lib/reminders";

const GUIDE_KEY = "taskdeck.notificationGuide.v3";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function hasSettled(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === "done";
  } catch {
    return true;
  }
}

function settle(): void {
  try {
    localStorage.setItem(GUIDE_KEY, "done");
  } catch {
  }
}

export function NotificationGuide() {
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!isTauri() || hasSettled()) return;
    setOpen(true);
  }, []);

  if (!open) return null;

  const close = () => {
    settle();
    setOpen(false);
  };

  return createPortal(
    <div className="modal-overlay modal-overlay--confirm" onClick={close}>
      <div className="modal-card modal-card--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">开启任务提醒</div>
            <div className="modal-sub">万事只会在截止前提醒你，不会打扰。</div>
          </div>
          <button className="modal-close" onClick={close} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="confirm-msg">
            开启通知后，任务将在截止前 24 小时和 6 小时提醒你。下一步会出现 macOS 的系统授权弹窗。
          </p>
          <p className="confirm-msg confirm-msg--muted">
            暂不开启也没关系，之后可以随时在「设置 → 通知提醒」里打开。
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={close} disabled={requesting}>
            暂不开启
          </button>
          <button
            className="btn-primary"
            disabled={requesting}
            onClick={async () => {
              // 无论授权成功与否都关闭弹窗，不再纠缠：
              // 没开成的用户可在「设置 → 通知提醒」里再开。
              setRequesting(true);
              await requestNotificationPermission();
              setRequesting(false);
              close();
            }}
            autoFocus
          >
            {requesting ? "正在打开…" : "开启提醒"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
