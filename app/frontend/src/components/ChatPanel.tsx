import { useRef, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TaskItem } from "./TaskItem";
import { useChatMessages, submitTask } from "../store/chatStore";
import { DeadlineTimeline } from "./DeadlineTimeline";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const messages = useChatMessages();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    setInput("");
    void submitTask(text, () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="chat">
      <DeadlineTimeline />

      <div className="chat-stream" ref={scrollRef}>
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
                <div className="bubble bubble--user">{m.text}</div>
              </div>
            ) : (
              <div key={m.id} className="msg msg--ai">
                {m.pending ? (
                  <div className="bubble bubble--ai typing">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                ) : m.task ? (
                  <div className="bubble bubble--ai">
                    <div className="ai-lead">
                      {m.degraded
                        ? "AI 暂时不可用，已先记下。若未安装 Claude Code，可在设置切换为 DeepSeek 并填写 API Key："
                        : "已登记 ✓"}
                    </div>
                    <TaskItem task={m.task} hideArchive />
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
            className="chat-input"
            placeholder="有任务，立即安排"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
          <button
            className="chat-send"
            onClick={() => submit()}
            disabled={!input.trim()}
            aria-label="发送"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
