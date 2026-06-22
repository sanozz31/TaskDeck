import { useEffect, useRef } from "react";
import { useAllTasks } from "../store/useTasks";
import { checkReminders, ensureNotificationPermission } from "../lib/reminders";
import type { Task } from "../types";

/**
 * 无界面的提醒调度器：App 运行期间每 30s 扫描一次任务，
 * 对到点的 DDL 弹系统通知（关闭 App 后不再提醒，属 MVP 限制）。
 */
export function Reminders() {
  const { data } = useAllTasks();
  const ref = useRef<Task[]>([]);
  ref.current = data ?? [];

  useEffect(() => {
    ensureNotificationPermission();
    const id = setInterval(() => checkReminders(ref.current), 30_000);
    return () => clearInterval(id);
  }, []);

  // 任务数据就绪/变化时也查一次（启动补弹、新建任务后尽快纳入）
  useEffect(() => {
    if (data) checkReminders(data);
  }, [data]);

  return null;
}
