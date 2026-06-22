import { useSyncExternalStore } from "react";

/**
 * 「本次会话内刚划掉的任务」集合——刻意只存内存、不持久化。
 * 用途：任务刚标记完成时仍留在「全部任务」主列表（划线，可反悔），
 * 刷新 / 重开应用后内存清空，已完成项便自动从主列表挪进「已完成」弹窗。
 */
let ids = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  // 重建引用，保证 useSyncExternalStore 能识别变化
  ids = new Set(ids);
  for (const l of listeners) l();
}

export function markCompleted(id: string) {
  ids.add(id);
  emit();
}

export function unmarkCompleted(id: string) {
  ids.delete(id);
  emit();
}

export function useSessionCompleted(): Set<string> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => ids,
    () => ids,
  );
}
