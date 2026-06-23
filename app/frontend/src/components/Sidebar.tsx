import type { ViewKey } from "../types";
import { useSettings } from "../store/useTasks";
import navChat from "../assets/nav-icons/nav-chat-36.png";
import navCalendar from "../assets/nav-icons/nav-calendar-36.png";
import navTags from "../assets/nav-icons/nav-tags-36.png";
import navAll from "../assets/nav-icons/nav-all-36.png";

const NAV: { key: ViewKey; label: string; icon: string }[] = [
  { key: "chat", label: "对话", icon: navChat },
  { key: "calendar", label: "日历", icon: navCalendar },
  { key: "tags", label: "标签", icon: navTags },
  { key: "all", label: "全部任务", icon: navAll },
];

export function Sidebar({
  view,
  onChange,
  onOpenSettings,
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
  onOpenSettings: () => void;
}) {
  const { data: settings } = useSettings();
  const modelLabel =
    settings?.aiProvider === "deepseek"
      ? settings.deepseekModel || "DeepSeek"
      : "Claude Code";

  return (
    <aside className="sidebar">
      <div className="brand" data-tauri-drag-region>
        <div className="brand-mark" data-tauri-drag-region>
          <img
            className="brand-logo"
            src="/favicon.png"
            alt="万事 TaskDeck"
            draggable={false}
            data-tauri-drag-region
          />
        </div>
        <div className="brand-text" data-tauri-drag-region>
          <div className="brand-name">万事</div>
          <div className="brand-sub">TaskDeck</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-item${view === n.key ? " nav-item--on" : ""}`}
            onClick={() => onChange(n.key)}
          >
            <span className="nav-icon">
              <img src={n.icon} alt="" draggable={false} />
            </span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button className="settings-btn" onClick={onOpenSettings} title="设置">
          <span className="settings-gear">⚙</span>
        </button>
        <span className="model-tag" title="当前接入模型">
          {modelLabel}
        </span>
      </div>
    </aside>
  );
}
