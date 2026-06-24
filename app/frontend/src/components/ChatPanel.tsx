import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { TaskItem } from "./TaskItem";
import {
  useChatMessages,
  submitTask,
  reconcileChatTasks,
  removeChatMessage,
  abortSubmit,
} from "../store/chatStore";
import { useAllTasks } from "../store/useTasks";
import { DeadlineTimeline } from "./DeadlineTimeline";
import { notifyTasksChanged } from "../lib/channel";
import type { Task } from "../types";

const DRAFT_KEY = "taskdeck.chat.draft";

// 切视图时 ChatPanel 会卸载，滚动位置随 DOM 丢失。存到模块级，切回时恢复；
// null 表示本会话还没滚动过 → 首次进入落到底看最新。
let savedScrollTop: number | null = null;

export function ChatPanel() {
  const [input, setInput] = useState(() => localStorage.getItem(DRAFT_KEY) ?? "");
  // 用户气泡右键 / 长按菜单：{屏幕坐标, 消息 id, 文本}
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; text: string } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout>>(undefined);
  const messages = useChatMessages();

  const openMenu = (x: number, y: number, id: string, text: string) =>
    setMenu({ x, y, id, text });
  const copyText = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setMenu(null);
  };
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 用实时任务数据按 id 覆盖对话快照：任何来源（时间轴/悬浮窗/列表页）改了任务，
  // 都会失效 ["tasks"] 触发刷新，对话卡随之更新；已归档/不在列表的任务回退到快照。
  const { data: liveTasks } = useAllTasks();
  const liveById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of liveTasks ?? []) m.set(t.id, t);
    return m;
  }, [liveTasks]);

  // 持续把实时改动落进对话快照：任务归档脱离列表后，快照即定格在最后一次状态。
  useEffect(() => {
    reconcileChatTasks(liveById);
  }, [liveById]);

  // 挂载（含切回对话页）：恢复离开前的滚动位置；本会话首次进入则落到底看最新。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = savedScrollTop ?? el.scrollHeight;
  }, []);

  // 仅在「有新消息追加」或「AI 回复刚生成完」时滚到底；
  // 编辑卡片只会改动已有消息内容（reconcile/实时覆盖），不该把视图拽到底。
  const prevLenRef = useRef(messages.length);
  const prevPendingRef = useRef(messages.some((m) => m.pending));
  useEffect(() => {
    const grew = messages.length > prevLenRef.current;
    const hasPending = messages.some((m) => m.pending);
    const aiSettled = prevPendingRef.current && !hasPending;
    if (grew || aiSettled) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevLenRef.current = messages.length;
    prevPendingRef.current = hasPending;
  }, [messages]);

  // 输入框随内容自适应高度，最多四行（超出后内部滚动）。四行上限由 CSS max-height 兜住。
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // 草稿持久化：切窗口/重挂载也不丢未发送的输入（发送后 setInput("") 会清掉草稿）
  useEffect(() => {
    if (input) localStorage.setItem(DRAFT_KEY, input);
    else localStorage.removeItem(DRAFT_KEY);
  }, [input]);

  const submit = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    setInput("");
    void submitTask(text, () => {
      qc.invalidateQueries({ queryKey: ["tasks"], exact: false });
      qc.invalidateQueries({ queryKey: ["tags"], exact: false });
      qc.invalidateQueries({ queryKey: ["calendar"], exact: false });
      notifyTasksChanged();
    });
  };

  const hasPending = messages.some((m) => m.pending);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 分析进行中：ESC 中断
    if (e.key === "Escape" && hasPending) {
      e.preventDefault();
      abortSubmit();
      return;
    }
    // 输入法选字 / 组合输入中按回车：只确认候选，不发送（isComposing 守卫）
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="chat">
      <DeadlineTimeline />

      <div
        className="chat-stream"
        ref={scrollRef}
        onMouseDown={(e) => {
          // 双击/三击会选词/选段：整条对话流统一拦掉（编辑输入框除外，那里要保留选词）。
          // 单击拖拽（detail===1）不受影响，正常框选。
          if (e.detail > 1 && !(e.target as HTMLElement).closest("input, textarea")) {
            e.preventDefault();
          }
        }}
        onScroll={(e) => {
          savedScrollTop = e.currentTarget.scrollTop;
        }}
      >
        {empty ? (
          <div className="chat-empty">
            <div className="chat-empty-title">万事皆有安排</div>
            <div className="chat-empty-sub">
              你说一句，剩下的交给我
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="msg msg--user">
                <div
                  className="bubble bubble--user"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, m.id, m.text ?? "");
                  }}
                  onMouseDown={(e) => {
                    // 双击/三击会选词/选段：拦掉这一下；单击拖拽（detail===1）不受影响，正常框选
                    if (e.detail > 1) e.preventDefault();
                  }}
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    const { clientX, clientY } = t;
                    longPress.current = setTimeout(
                      () => openMenu(clientX, clientY, m.id, m.text ?? ""),
                      450,
                    );
                  }}
                  onTouchEnd={() => clearTimeout(longPress.current)}
                  onTouchMove={() => clearTimeout(longPress.current)}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="msg msg--ai">
                {m.pending ? (
                  <div className="bubble bubble--ai typing">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                ) : (m.tasks?.length ?? 0) > 0 || m.task ? (
                  <div className="bubble bubble--ai">
                    <div className="ai-lead">
                      {m.degraded
                        ? "AI 暂时不可用，已先记下，请在设置中配置模型。"
                        : (m.tasks?.length ?? 1) > 1
                          ? `已登记 ${m.tasks!.length} 项 ✓`
                          : "已登记 ✓"}
                    </div>
                    {(m.tasks ?? (m.task ? [m.task] : [])).map((t) => (
                      <TaskItem key={t.id} task={liveById.get(t.id) ?? t} />
                    ))}
                  </div>
                ) : (
                  <div className="bubble bubble--ai">{m.text}</div>
                )}
              </div>
            ),
          )
        )}
      </div>

      <div className="chat-input-bar">
        <div className="chat-input-wrap">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={
              hasPending ? "正在分析…按 ESC 或点击右侧暂停按钮中断" : "有任务，立即安排"
            }
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
          <button
            className={`chat-send${hasPending ? " chat-send--stop" : ""}`}
            onClick={() => (hasPending ? abortSubmit() : submit())}
            disabled={hasPending ? false : !input.trim()}
            aria-label={hasPending ? "暂停（中断分析）" : "发送"}
            title={hasPending ? "暂停（中断分析）" : "发送"}
          >
            {hasPending ? <span className="chat-send-pause" /> : "↑"}
          </button>
        </div>
      </div>

      {menu &&
        createPortal(
          <>
            <div
              className="ctx-backdrop"
              onMouseDown={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div className="ctx-menu" style={{ top: menu.y, left: menu.x }}>
              <button className="ctx-item" onClick={() => copyText(menu.text)}>
                复制
              </button>
              <button
                className="ctx-item ctx-item--danger"
                onClick={() => {
                  removeChatMessage(menu.id);
                  setMenu(null);
                }}
              >
                删除
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
