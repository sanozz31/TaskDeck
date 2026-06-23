import { useEffect, useMemo, useState } from "react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import "react-day-picker/style.css";
import { useCalendar } from "../store/useTasks";
import { TaskList } from "./TaskList";
import { prettyDate } from "../lib/format";
import type { Priority, Task } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// 「完成日」覆盖图片：自动扫描 src/assets/calendar-overlays 下所有 png。
// 往该目录加图即自动纳入随机池（dev 下新增图需重启一次 dev 让 Vite 重新扫描）。
const OVERLAY_MODULES = import.meta.glob<string>("../assets/calendar-overlays/*.png", {
  eager: true,
  import: "default",
});
const OVERLAY_URLS: Record<string, string> = {}; // 文件名 → 打包后 URL
for (const [path, url] of Object.entries(OVERLAY_MODULES)) {
  OVERLAY_URLS[path.split("/").pop()!] = url;
}
const OVERLAY_NAMES = Object.keys(OVERLAY_URLS); // 稳定文件名，用于持久化（不存带 hash 的 URL）
const DONES_KEY = "taskdeck.calendar.dones"; // { "YYYY-MM-DD": 图片文件名 }

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

  // 年份下拉范围：今年 ±10 年（若已切到范围外，动态包含当前年份，避免下拉值落空）
  const thisYear = new Date().getFullYear();
  const curYear = month.getFullYear();
  const yearLo = Math.min(thisYear - 10, curYear);
  const yearHi = Math.max(thisYear + 10, curYear);
  const yearOptions: number[] = [];
  for (let y = yearLo; y <= yearHi; y++) yearOptions.push(y);

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

  // ===== 「完成日」覆盖图片 =====
  // 某天命中任务（due 或 scheduled）≥1 且全部 done → 达成（每个任务同一天只计一次）
  const doneDays = useMemo(() => {
    const hit = new Map<string, { total: number; done: number }>();
    (tasks ?? []).forEach((t) => {
      const keys = new Set([t.due_date, t.scheduled_date].filter(Boolean) as string[]);
      keys.forEach((k) => {
        const e = hit.get(k) ?? { total: 0, done: 0 };
        e.total += 1;
        if (t.status === "done") e.done += 1;
        hit.set(k, e);
      });
    });
    const set = new Set<string>();
    for (const [k, e] of hit) if (e.total > 0 && e.done === e.total) set.add(k);
    return set;
  }, [tasks]);

  // 达成日 → 图片名映射，持久化；首次达成随机选一张、之后不改名
  const [overlayMap, setOverlayMap] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(DONES_KEY) || "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    let changed = false;
    const next = { ...overlayMap };
    if (OVERLAY_NAMES.length > 0) {
      for (const day of doneDays) {
        if (!next[day]) {
          next[day] = OVERLAY_NAMES[Math.floor(Math.random() * OVERLAY_NAMES.length)];
          changed = true;
        }
      }
    }
    if (changed) {
      setOverlayMap(next);
      try {
        localStorage.setItem(DONES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  }, [doneDays, overlayMap]);

  // 自定义日期按钮：达成日且未选中 → 叠加图片层（CSS 控制 hover 淡出）
  const components = useMemo(
    () => ({
      MonthCaption: HiddenCaption,
      DayButton: ({ day, modifiers, children, className, ...btn }: DayButtonProps) => {
        const key = ymd(day.date);
        const overlay = doneDays.has(key) ? overlayMap[key] : undefined;
        const overlayUrl = overlay ? OVERLAY_URLS[overlay] : undefined;
        const showOverlay = !!overlayUrl && !modifiers.selected;
        return (
          <button
            className={showOverlay ? `${className ?? ""} cal-has-overlay` : className}
            {...btn}
          >
            <span className="cal-day-num">{children}</span>
            {showOverlay && (
              <img
                className="cal-overlay-img"
                src={overlayUrl}
                alt=""
                draggable={false}
              />
            )}
          </button>
        );
      },
    }),
    [doneDays, overlayMap],
  );

  return (
    <div className="cal-view">
      <div className="cal-pane">
        <div className="cal-head">
          <div className="cal-head-mid">
            <select
              className="cal-sel cal-sel--year"
              value={month.getFullYear()}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              aria-label="年"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="cal-num-unit">年</span>
            <select
              className="cal-sel"
              value={month.getMonth() + 1}
              onChange={(e) => setMon(parseInt(e.target.value, 10))}
              aria-label="月"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
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
          components={components}
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
