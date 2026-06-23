import { useEffect, useState } from "react";
import { useSettings, useUpdateSettings } from "../store/useTasks";
import { CLAUDE_PAUSED } from "../lib/env";
import { isWidgetEnabled, showWidget, hideWidget } from "../lib/widgetWindow";

/** DeepSeek 当前生产模型（V4 系列，1M 上下文，OpenAI 兼容）。
 *  旧别名 deepseek-chat / deepseek-reasoner 官方将于 2026/07/24 停用，故不再列出。 */
const DEEPSEEK_MODELS: { id: string; label: string }[] = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
];

/** 设置弹窗：模型切换（真接入 DeepSeek）+ 语言（本轮仅 UI）。 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data } = useSettings();
  const save = useUpdateSettings();

  const [provider, setProvider] = useState("sdk");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");
  const [language, setLanguage] = useState("zh");
  // 悬浮窗开关:本地窗口偏好,即时生效(不随「保存」按钮)。
  const [widgetOn, setWidgetOn] = useState(isWidgetEnabled());
  const toggleWidget = () => {
    const next = !widgetOn;
    setWidgetOn(next);
    void (next ? showWidget() : hideWidget());
  };

  // 拉到设置后回填（apiKey 不回显，仅用 hasDeepseekKey 提示）
  useEffect(() => {
    if (!data) return;
    setProvider(data.aiProvider);
    setBaseUrl(data.deepseekBaseUrl);
    setModel(data.deepseekModel);
    setLanguage(data.language);
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const patch: Record<string, string> = {
      aiProvider: provider,
      deepseekBaseUrl: baseUrl,
      deepseekModel: model,
      language,
    };
    if (apiKey.trim()) patch.deepseekApiKey = apiKey.trim();
    save.mutate(patch, { onSuccess: () => onClose() });
  };

  return (
    <div className="modal-overlay" onClick={submit}>
      <div className="modal-card modal-card--lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">设置</div>
            <div className="modal-sub">所有配置仅保存于本机</div>
          </div>
          <button className="modal-close" onClick={submit} aria-label="完成" title="保存并关闭">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* 模型 */}
          <div className="set-group">
            <div className="set-label">AI 模型</div>
            <select
              className="set-control"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="sdk" disabled={CLAUDE_PAUSED}>
                {CLAUDE_PAUSED
                  ? "本机 Claude Code（暂停配置）"
                  : "本机 Claude Code（默认，零配置）"}
              </option>
              <option value="deepseek">DeepSeek（OpenAI 兼容，需 API Key）</option>
            </select>

            {provider === "deepseek" && (
              <div className="set-sub">
                <label className="set-field">
                  <span>API Key</span>
                  <input
                    type="password"
                    className="set-control"
                    placeholder={data?.hasDeepseekKey ? "已保存，留空则不变" : "sk-..."}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </label>
                <label className="set-field">
                  <span>接口地址</span>
                  <input
                    className="set-control"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                  />
                </label>
                <label className="set-field">
                  <span>模型</span>
                  <select
                    className="set-control"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {DEEPSEEK_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                    {/* 兜底：已保存的旧模型名不在预置列表里时仍可显示/保留 */}
                    {!DEEPSEEK_MODELS.some((m) => m.id === model) && (
                      <option value={model}>{model}</option>
                    )}
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* 悬浮窗 */}
          <div className="set-group">
            <div className="set-row">
              <div>
                <div className="set-label">悬浮窗</div>
                <div className="set-hint">
                  屏幕常驻的悬浮球，点击或拖出即可展开，拖到屏幕边缘吸附；有临近deadline的任务时，悬浮球会呼吸预警
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={widgetOn}
                className={`switch${widgetOn ? " switch--on" : ""}`}
                onClick={toggleWidget}
              >
                <span className="switch-knob" />
              </button>
            </div>
          </div>

          {/* 语言 */}
          <div className="set-group">
            <div className="set-label">语言</div>
            <select
              className="set-control"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="zh">中文</option>
              <option value="en">English（即将支持）</option>
            </select>
          </div>
        </div>

      </div>
    </div>
  );
}
