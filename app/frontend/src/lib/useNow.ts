import { useEffect, useState } from "react";

/**
 * 共享的「当前时刻」心跳：所有调用方共用同一个定时器，每 intervalMs 通知一次。
 * 用于让「距截止还剩多久」这类实时派生状态（如 isImminent 标红/闪烁）随时间自动刷新，
 * 而不依赖任务数据本身变化。默认 30s 一跳，足够 2 小时窗口的边界响应。
 */
const DEFAULT_INTERVAL = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function ensureTimer() {
  if (timer != null) return;
  timer = setInterval(() => {
    for (const l of listeners) l();
  }, DEFAULT_INTERVAL);
}

export function useNow(): number {
  // 初值用函数式，保证首帧就是当前时刻（不读模块级残留值）
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    listeners.add(tick);
    ensureTimer();
    tick(); // 订阅瞬间再对齐一次
    return () => {
      listeners.delete(tick);
      if (listeners.size === 0 && timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return now;
}
