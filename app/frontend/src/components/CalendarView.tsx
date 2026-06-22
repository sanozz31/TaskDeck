import { useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import "react-day-picker/style.css";
import { useCalendar } from "../store/useTasks";
import { TaskList } from "./TaskList";
import { prettyDate } from "../lib/format";
import type { Priority, Task } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const PRI_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const RANK_NAME = ["low", "medium", "high", "urgent"] as const;

// 隐藏 DayPicker 自带的「年月」标题，改用下方自定义可编辑头部
const HiddenCaption = () => <></>;

export function CalendarView() {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());

  const from = ymd(new Date(month.getFullYear(), month.getMonth(), 1));
  const to = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const { data: tasks } = useCalendar(from, to);

  // 按「当天最高优先级」给有任务的日期分桶，圆点据此着色
  const { allDays, byPri } = useMemo(() => {
    const maxRank = new Map<string, number>();
    (tasks ?? []).forEach((t) => {
      const r = PRI_RANK[t.priority] ?? 1;
      for (const key of [t.due_date, t.scheduled_date]) {
        if (!key) continue;
        maxRank.set(key, Math.max(maxRank.get(key) ?? -1, r));
      }
    });
    const toDate = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const buckets: Record<(typeof RANK_NAME)[number], Date[]> = {
      low: [],
      medium: [],
      high: [],
      urgent: [],
    };
    const all: Date[] = [];
    for (const [key, rank] of maxRank) {
      const dt = toDate(key);
      all.push(dt);
      buckets[RANK_NAME[rank]].push(dt);
    }
    return { allDays: all, byPri: buckets };
  }, [tasks]);

  const selKey = ymd(selected);
  // 当天任务按具体时间(due_time, 24h)升序；无时间的排在最后
  const dayTasks: Task[] = (tasks ?? [])
    .filter((t) => t.due_date === selKey || t.scheduled_date === selKey)
    .sort((a, b) => (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99"));

  const shiftMonth = (delta: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const setYear = (y: number) => {
    if (Number.isFinite(y) && y >= 1970 && y <= 9999)
      setMonth(new Date(y, month.getMonth(), 1));
  };
  const setMon = (m: number) => {
    if (Number.isFinite(m) && m >= 1 && m <= 12)
      setMonth(new Date(month.getFullYear(), m - 1, 1));
  };

  return (
    <div className="cal-view">
      <div className="cal-pane">
        <div className="cal-head">
          <div className="cal-head-mid">
            <input
              type="number"
              className="cal-num cal-num--year"
              value={month.getFullYear()}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              aria-label="年"
            />
            <span className="cal-num-unit">年</span>
            <input
              type="number"
              className="cal-num"
              min={1}
              max={12}
              value={month.getMonth() + 1}
              onChange={(e) => setMon(parseInt(e.target.value, 10))}
              aria-label="月"
            />
            <span className="cal-num-unit">月</span>
          </div>
          <div className="cal-nav-group">
            <button className="cal-nav" onClick={() => shiftMonth(-1)} aria-label="上个月">
              ‹
            </button>
            <button className="cal-nav" onClick={() => shiftMonth(1)} aria-label="下个月">
              ›
            </button>
          </div>
        </div>

        <DayPicker
          mode="single"
          locale={zhCN}
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={(d) => d && setSelected(d)}
          hideNavigation
          components={{ MonthCaption: HiddenCaption }}
          modifiers={{
            hasTask: allDays,
            taskUrgent: byPri.urgent,
            taskHigh: byPri.high,
            taskMedium: byPri.medium,
            taskLow: byPri.low,
          }}
          modifiersClassNames={{
            hasTask: "rdp-hasTask",
            taskUrgent: "rdp-task-urgent",
            taskHigh: "rdp-task-high",
            taskMedium: "rdp-task-medium",
            taskLow: "rdp-task-low",
          }}
          showOutsideDays
        />
      </div>
      <div className="cal-day">
        <h3 className="cal-day-title">{prettyDate(selKey)}</h3>
        <TaskList tasks={dayTasks} empty="这一天还没有安排" />
      </div>
    </div>
  );
}
