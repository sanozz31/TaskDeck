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

  return (
    <div className="app">
      <Reminders />
      <Sidebar view={view} onChange={setView} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="main">
        <header className="topbar" data-tauri-drag-region>
          {VIEW_TITLE[view]}
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
