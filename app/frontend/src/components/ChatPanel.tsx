import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TaskItem } from "./TaskItem";
import { ConfirmModal } from "./ConfirmModal";
import { RegenConfirm } from "./RegenConfirm";
import {
  useChatMessages,
  submitTask,
  reconcileChatTasks,
  removeChatMessage,
  abortSubmit,
  editAndRegenerate,
  retry,
  setVersion,
  activeVersionOf,
  removeAssistantWithTasks,
} from "../store/chatStore";
import { useAllTasks } from "../store/useTasks";
import { DeadlineTimeline } from "./DeadlineTimeline";
import { notifyTasksChanged } from "../lib/channel";
import type { Task } from "../types";

const DRAFT_KEY = "taskdeck.chat.draft";

// 操作栏线性小图标（继承 currentColor，随按钮态变色）
const svgProps = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const IconCopy = () => (
  <svg {...svgProps}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const IconEdit = () => (
  <svg {...svgProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);
const IconTrash = () => (
  <svg {...svgProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IconRetry = () => (
  <svg {...svgProps}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

// 切视图时 ChatPanel 会卸载，滚动位置随 DOM 丢失。存到模块级，切回时恢复；
// null 表示本会话还没滚动过 → 首次进入落到底看最新。
let savedScrollTop: number | null = null;

// 待执行的重新生成动作（等用户在确认弹窗里选「保留 / 删除此版」）
type RegenAction =
  | { kind: "edit"; userId: string; text: string }
  | { kind: "retry"; assistantId: string };

export function ChatPanel() {
  const [input, setInput] = useState(() => localStorage.getItem(DRAFT_KEY) ?? "");
  const messages = useChatMessages();
  // 行内编辑中的用户气泡 id 与草稿
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  // 删除用户气泡的二次确认
  const [delId, setDelId] = useState<string | null>(null);
  // 删除整条 AI 回复（连同框内任务）的二次确认
  const [delAiId, setDelAiId] = useState<string | null>(null);
  // 待确认的重新生成
  const [regen, setRegen] = useState<RegenAction | null>(null);

  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 任务变更后统一刷新各视图 + 通知悬浮窗。
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tasks"], exact: false });
    qc.invalidateQueries({ queryKey: ["tags"], exact: false });
    qc.invalidateQueries({ queryKey: ["calendar"], exact: false });
    notifyTasksChanged();
  };

  const copy = (text?: string) => void navigator.clipboard?.writeText(text ?? "").catch(() => {});

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
    void submitTask(text, refresh);
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

  const startEdit = (id: string, text?: string) => {
    setEditingId(id);
    setEditText(text ?? "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  // 执行待确认的重新生成（keepOld 决定旧版本卡片是否留在版本切换器）。
  const runRegen = (keepOld: boolean) => {
    if (!regen) return;
    if (regen.kind === "edit") {
      void editAndRegenerate(regen.userId, regen.text, { keepOld }, refresh);
      cancelEdit();
    } else {
      void retry(regen.assistantId, { keepOld }, refresh);
    }
    setRegen(null);
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
            <div className="chat-empty-sub">你说一句，剩下的交给我</div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="msg msg--user">
                <div className="msg-col">
                  {editingId === m.id ? (
                    <>
                      <div className="bubble bubble--user bubble--editing autosize">
                        <div className="autosize-mirror" aria-hidden="true">
                          {editText + "​"}
                        </div>
                        <textarea
                          className="bubble-edit-input"
                          value={editText}
                          autoFocus
                          rows={1}
                          cols={1}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            } else if (
                              e.key === "Enter" &&
                              !e.shiftKey &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              if (editText.trim())
                                setRegen({ kind: "edit", userId: m.id, text: editText });
                            }
                          }}
                        />
                      </div>
                      <div className="msg-actions msg-actions--edit">
                        <button className="msg-edit-cancel" onClick={cancelEdit}>
                          取消
                        </button>
                        <button
                          className="msg-edit-send"
                          disabled={!editText.trim()}
                          onClick={() =>
                            setRegen({ kind: "edit", userId: m.id, text: editText })
                          }
                        >
                          发送
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="bubble bubble--user"
                        onMouseDown={(e) => {
                          if (e.detail > 1) e.preventDefault();
                        }}
                      >
                        {m.text}
                      </div>
                      <div className="msg-actions">
                        <button
                          className="msg-act"
                          title="复制"
                          aria-label="复制"
                          onClick={() => copy(m.text)}
                        >
                          <IconCopy />
                        </button>
                        <button
                          className="msg-act"
                          title="编辑"
                          aria-label="编辑"
                          onClick={() => startEdit(m.id, m.text)}
                        >
                          <IconEdit />
                        </button>
                        <button
                          className="msg-act"
                          title="删除"
                          aria-label="删除"
                          onClick={() => setDelId(m.id)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <AiMessage
                key={m.id}
                m={m}
                liveById={liveById}
                onRetry={() => setRegen({ kind: "retry", assistantId: m.id })}
                onDelete={() => setDelAiId(m.id)}
              />
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

      {delId && (
        <ConfirmModal
          title="删除这条对话"
          message="仅从对话记录中删除这条消息，已登记的后台任务不受影响。确定删除？"
          confirmText="删除"
          danger
          onConfirm={() => removeChatMessage(delId)}
          onClose={() => setDelId(null)}
        />
      )}

      {delAiId && (
        <ConfirmModal
          title="删除这条回复"
          message="将删除整条 AI 回复，并把其中已登记的任务归档至「已完成任务」。确定删除？"
          confirmText="删除"
          danger
          onConfirm={() => void removeAssistantWithTasks(delAiId, refresh)}
          onClose={() => setDelAiId(null)}
        />
      )}

      {regen && (
        <RegenConfirm
          onKeep={() => runRegen(true)}
          onDrop={() => runRegen(false)}
          onClose={() => setRegen(null)}
        />
      )}
    </div>
  );
}

/** 单条 AI 回复：转圈 / 任务卡 + 操作栏（重试 + 版本切换）/ 纯文本（出错）。 */
function AiMessage({
  m,
  liveById,
  onRetry,
  onDelete,
}: {
  m: import("../store/chatStore").ChatMsg;
  liveById: Map<string, Task>;
  onRetry: () => void;
  onDelete: () => void;
}) {
  if (m.pending) {
    return (
      <div className="msg msg--ai">
        <div className="bubble bubble--ai typing">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
    );
  }

  const av = activeVersionOf(m);
  if (av) {
    const tasks = av.tasks;
    const versions = m.versions ?? [];
    const active = m.activeVersion ?? 0;
    const lead = av.degraded
      ? "AI 暂时不可用，已先记下，请在设置中配置模型。"
      : tasks.length > 1
        ? `已登记 ${tasks.length} 项 ✓`
        : "已登记 ✓";
    return (
      <div className="msg msg--ai">
        <div className="msg-col">
          <div className="bubble bubble--ai">
            <div className="ai-lead">{lead}</div>
            {tasks.map((t) => (
              <TaskItem key={t.id} task={liveById.get(t.id) ?? t} />
            ))}
          </div>
          <div className="msg-actions">
            {versions.length > 1 && (
              <span className="ver-switch">
                <button
                  className="ver-arrow"
                  disabled={active <= 0}
                  onClick={() => setVersion(m.id, active - 1)}
                  aria-label="上一版"
                >
                  ‹
                </button>
                <span className="ver-idx">
                  {active + 1}/{versions.length}
                </span>
                <button
                  className="ver-arrow"
                  disabled={active >= versions.length - 1}
                  onClick={() => setVersion(m.id, active + 1)}
                  aria-label="下一版"
                >
                  ›
                </button>
              </span>
            )}
            <button className="msg-act" title="重试" aria-label="重试" onClick={onRetry}>
              <IconRetry />
            </button>
            <button className="msg-act" title="删除" aria-label="删除" onClick={onDelete}>
              <IconTrash />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 无版本（仅出错文本）
  return (
    <div className="msg msg--ai">
      <div className="bubble bubble--ai">{m.text}</div>
    </div>
  );
}
