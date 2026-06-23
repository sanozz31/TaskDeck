import { useEffect, useState } from "react";
import "./App.css";
import type { ViewKey } from "./types";
import { waitForHealth } from "./api/client";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { CalendarView } from "./components/CalendarView";
import { TagView } from "./components/TagView";
import { AllTasks } from "./components/AllTasks";
import { Reminders } from "./components/Reminders";
import { SettingsModal } from "./components/SettingsModal";
import { Onboarding } from "./components/Onboarding";
import { useSettings } from "./store/useTasks";
import { clearChat, useChatMessages } from "./store/chatStore";
import { isWidgetEnabled, showWidget } from "./lib/widgetWindow";

const VIEW_TITLE: Record<ViewKey, string> = {
  chat: "对话",
  calendar: "日历日程",
  tags: "按标签",
  all: "全部任务",
};

export default function App() {
  const [view, setView] = useState<ViewKey>("chat");
  const [ready, setReady] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    waitForHealth().then(setReady);
  }, []);

  // 启动自恢复:上次开着悬浮窗则自动显示。
  useEffect(() => {
    if (isWidgetEnabled()) void showWidget();
  }, []);

  // 后端就绪后才拉设置，用于判断是否需要首启引导。
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const messages = useChatMessages();

  if (ready === null) {
    return (
      <div className="boot">
        <div className="boot-spin" />
        <div>正在连接后台…</div>
      </div>
    );
  }
  if (ready === false) {
    return (
      <div className="boot">
        <div className="boot-title">后台未启动</div>
        <div className="boot-sub">
          请在 <code>app/</code> 目录运行 <code>npm run dev</code> 启动服务后刷新。
        </div>
      </div>
    );
  }

  // 设置尚未拉到：短暂占位，避免主界面闪一下又被引导覆盖。
  if (settingsLoading || !settings) {
    return (
      <div className="boot">
        <div className="boot-spin" />
        <div>正在准备…</div>
      </div>
    );
  }

  // 首次启动（未完成引导）：强制先配置模型。
  if (!settings.setupDone) {
    return <Onboarding onDone={() => { /* setupDone 写入后 useSettings 失效自动重渲染 */ }} />;
  }

  return (
    <div className="app">
      <Reminders />
      <Sidebar view={view} onChange={setView} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="main">
        <header className="topbar" data-tauri-drag-region>
          <span className="topbar-title" data-tauri-drag-region>{VIEW_TITLE[view]}</span>
          {view === "chat" && messages.length > 0 && (
            <button className="topbar-clear" onClick={() => clearChat()}>
              清空对话
            </button>
          )}
          <button
            className="topbar-settings"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
            title="设置"
          >
            ⚙
          </button>
        </header>
        <section className="content">
          {view === "chat" && <ChatPanel />}
          {view === "calendar" && <CalendarView />}
          {view === "tags" && <TagView />}
          {view === "all" && (
            <div className="scroll-pad">
              <AllTasks onGoChat={() => setView("chat")} />
            </div>
          )}
        </section>
      </main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
