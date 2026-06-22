import { useEffect, useRef } from "react";
import { useAllTasks, useUpdateTask } from "../store/useTasks";
import { pickTimelineTasks, todayStr, dayStr, dueAtMs } from "../lib/deadline";
import { prettyDate, dueTone, PRIORITY_VAR, PRIORITY_LABEL } from "../lib/format";
import type { Task } from "../types";

/** 刻度标签：今天/明天/后天 + 时间（无 due_time 仅日期）。 */
function timeLabel(t: Task): string {
  let day: string;
  if (t.due_date === todayStr()) day = "今天";
  else if (t.due_date === dayStr(1)) day = "明天";
  else if (t.due_date === dayStr(2)) day = "后天";
  else day = prettyDate(t.due_date);
  return t.due_time ? `${day} ${t.due_time}` : day;
}

/**
 * 对话页顶部 DDL 时间轴：今天起 3 天内的未完成任务横排，刻度标签在上、药丸在下。
 * 点药丸上的空白圆圈即标记完成。每 30 分钟检测当前时间，自动对齐到最近未来任务。
 */
export function DeadlineTimeline() {
  const { data } = useAllTasks();
  const update = useUpdateTask();
  const scrollRef = useRef<HTMLDivElement>(null);
  const tasks = pickTimelineTasks(data ?? []);

  useEffect(() => {
    const align = () => {
      const el = scrollRef.current;
      if (!el) return;
      const now = Date.now();
      const idx = tasks.findIndex((t) => dueAtMs(t) >= now);
      const cols = el.querySelectorAll<HTMLElement>(".dl-col");
      if (idx > 0 && cols[idx]) {
        el.scrollLeft = cols[idx].offsetLeft - (cols[0]?.offsetLeft ?? 0);
      } else {
        el.scrollLeft = 0;
      }
    };
    align();
    const id = setInterval(align, 30 * 60 * 1000); // 30 分钟一次，省电
    return () => clearInterval(id);
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <div className="deadline-timeline" ref={scrollRef}>
      {tasks.map((t) => (
        <div className="dl-col" key={t.id}>
          <div className="dl-time">{timeLabel(t)}</div>
          <div className={`dl-pill${dueTone(t.due_date) === "overdue" ? " dl-pill--overdue" : ""}`}>
            <span
              className="dl-dot"
              style={{ background: PRIORITY_VAR[t.priority] }}
              title={`优先级 ${PRIORITY_LABEL[t.priority]}`}
            />
            <span className="dl-title">{t.title}</span>
            <button
              className="dl-check"
              onClick={() => update.mutate({ id: t.id, patch: { status: "done" } })}
              title="标记完成"
              aria-label="标记完成"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
