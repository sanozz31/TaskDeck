/**
 * 主窗口 ↔ Widget 跨窗口通信通道。
 * 同源下使用 BroadcastChannel；不可用时静默降级（Widget 仍靠轮询兜底）。
 */
const CHANNEL_NAME = "taskdeck";

function createChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

const channel = createChannel();

/** 主窗口：通知 Widget 任务列表已变更。 */
export function notifyTasksChanged(): void {
  channel?.postMessage({ type: "tasks-changed" });
}

/** Widget 侧：注册任务变更监听。返回取消函数。 */
export function onTasksChanged(cb: () => void): () => void {
  if (!channel) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data?.type === "tasks-changed") cb();
  };
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}
