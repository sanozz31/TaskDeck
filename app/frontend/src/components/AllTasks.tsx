import { TaskList } from "./TaskList";
import { EmptyCTA } from "./EmptyCTA";
import { useAllTasks } from "../store/useTasks";
import { useSessionCompleted } from "../lib/sessionCompleted";
import { deadlineSortKey } from "../lib/format";

/**
 * 「全部任务」视图。主列表只显示未完成任务，外加「本次会话内刚划掉」的项
 * （仍带划线、可反悔）；已完成任务统一收进顶栏「已完成任务」按钮打开的弹窗（在 App 顶栏触发）。
 */
export function AllTasks({ onGoChat }: { onGoChat: () => void }) {
  const { data } = useAllTasks();
  const sessionDone = useSessionCompleted();

  const visible = data
    ?.filter((t) => t.status !== "done" || sessionDone.has(t.id))
    .sort((a, b) => deadlineSortKey(a).localeCompare(deadlineSortKey(b)));

  // 完全没有任务时的引导空态
  if (data && data.length === 0) {
    return <EmptyCTA title="还没有任务" action="去记录任务" onAction={onGoChat} />;
  }

  return <TaskList tasks={visible} empty="都完成啦，去对话里记一条新的吧" />;
}
