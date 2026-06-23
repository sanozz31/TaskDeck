import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, waitForHealth } from "../api/client";
import { isImminent } from "../lib/deadline";
import { useNow } from "../lib/useNow";
import { usePosture } from "./usePosture";
import { AgendaView, AllView } from "./WidgetCard";

type Segment = "agenda" | "all";

export function Widget() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [seg, setSeg] = useState<Segment>("agenda");
  const posture = usePosture();

  useEffect(() => {
    waitForHealth().then(setReady);
  }, []);

  // 组件数据:全部任务,每 20s 轮询保鲜;键与 useUpdateTask 失效对齐。
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => api.listTasks(),
    refetchInterval: 20_000,
    enabled: ready === true,
  });

  // 有任务进入「迫近」(DDL 前 2h) → 悬浮球告警(红光呼吸 + 浮动)。
  const now = useNow();
  const hasImminent = tasks.some((t) => isImminent(t, now));

  // 收起态:圆形悬浮球。点击展开;拖动换位(手动 setPosition,松手 pointerup 判定)。
  if (!posture.expanded) {
    return (
      <button
        className={`wg-ball wg-ball--${posture.edge}${hasImminent ? " wg-ball--alert" : ""}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          posture.onDragStart(e.screenX, e.screenY);
        }}
        onPointerMove={(e) => posture.onDragMove(e.screenX, e.screenY)}
        onPointerUp={(e) => {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          posture.onDragEnd(e.screenX, e.screenY, true);
        }}
        title="点击展开 / 拖动换位"
        aria-label="任务悬浮窗"
      >
        <img src="/widget-ball.png" alt="" draggable={false} />
      </button>
    );
  }

  return (
    <div className={`wg-shell${posture.docked ? " wg-shell--docked" : ""}`}>
      <header
        className="wg-head"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          // 点在按钮上 → 不拖动,交给按钮处理点击
          if ((e.target as HTMLElement).closest("button")) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          posture.onDragStart(e.screenX, e.screenY);
        }}
        onPointerMove={(e) => posture.onDragMove(e.screenX, e.screenY)}
        onPointerUp={(e) => {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          posture.onDragEnd(e.screenX, e.screenY, false);
        }}
      >
        <div className="wg-seg">
          <button
            className={`wg-seg-btn${seg === "agenda" ? " is-on" : ""}`}
            onClick={() => setSeg("agenda")}
          >
            近期
          </button>
          <button
            className={`wg-seg-btn${seg === "all" ? " is-on" : ""}`}
            onClick={() => setSeg("all")}
          >
            全部
          </button>
        </div>
        <div className="wg-head-actions">
          <button
            className="wg-open"
            onClick={posture.focusMain}
            title="打开主窗口"
            aria-label="打开主窗口"
          >
            ⤢
          </button>
          <button
            className="wg-open"
            onClick={posture.minimize}
            title="最小化为悬浮球"
            aria-label="最小化为悬浮球"
          >
            –
          </button>
        </div>
      </header>

      <div className="wg-body">
        {ready === null || isLoading ? (
          <div className="wg-empty">加载中…</div>
        ) : ready === false ? (
          <div className="wg-empty">后台未就绪</div>
        ) : seg === "agenda" ? (
          <AgendaView tasks={tasks} />
        ) : (
          <AllView tasks={tasks} />
        )}
      </div>
    </div>
  );
}
