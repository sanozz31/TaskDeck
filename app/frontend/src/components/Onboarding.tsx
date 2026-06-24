import { useState } from "react";
import { useUpdateSettings } from "../store/useTasks";
import { CLAUDE_PAUSED } from "../lib/env";

/** DeepSeek 当前生产模型（与 SettingsModal 保持一致）。 */
const DEEPSEEK_MODELS: { id: string; label: string }[] = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
];

/**
 * 首启引导：第一次打开应用必须显式选定并配置 AI 模型后才能进入主界面。
 * 完成后写入 setupDone=true，之后不再出现。
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const save = useUpdateSettings();

  // 打包发布版默认（且只能）选 DeepSeek；本地开发默认本机 Claude Code。
  const [provider, setProvider] = useState(CLAUDE_PAUSED ? "deepseek" : "sdk");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");

  // DeepSeek 必须填 Key 才能完成；本机 Claude Code 零配置可直接开始。
  const canFinish = provider === "sdk" || apiKey.trim().length > 0;

  const finish = () => {
    if (!canFinish) return;
    const patch: Record<string, string> = {
      aiProvider: provider,
      deepseekBaseUrl: baseUrl,
      deepseekModel: model,
      setupDone: "true",
    };
    if (provider === "deepseek" && apiKey.trim()) patch.deepseekApiKey = apiKey.trim();
    save.mutate(patch, { onSuccess: () => onDone() });
  };

  return (
    <div className="onboard">
      <div className="onboard-card">
        <div className="onboard-head">
          <img className="onboard-logo" src="/favicon.png" alt="万事" />
          <h1 className="onboard-title">欢迎使用万事</h1>
          <p className="onboard-sub">
            开始之前，先选一个负责解析任务的 AI 模型。之后可在设置里随时切换。
          </p>
        </div>

        <div className="onboard-body">
          {/* 选项一：本机 Claude Code（打包发布版暂停配置） */}
          <button
            type="button"
            className={`onboard-opt${provider === "sdk" ? " is-on" : ""}${CLAUDE_PAUSED ? " is-disabled" : ""}`}
            onClick={() => !CLAUDE_PAUSED && setProvider("sdk")}
            disabled={CLAUDE_PAUSED}
            aria-disabled={CLAUDE_PAUSED}
          >
            <span className="onboard-opt-dot" />
            <span className="onboard-opt-text">
              <span className="onboard-opt-name">
                本机 Claude Code{CLAUDE_PAUSED && "（暂停配置）"}
              </span>
              <span className="onboard-opt-desc">
                {CLAUDE_PAUSED
                  ? "为给安装包瘦身，发布版暂未内置 Claude，敬请期待。"
                  : "零配置，复用本机已登录的 Claude Code，无需 API Key。推荐。"}
              </span>
            </span>
          </button>

          {/* 选项二：DeepSeek */}
          <button
            type="button"
            className={`onboard-opt${provider === "deepseek" ? " is-on" : ""}`}
            onClick={() => setProvider("deepseek")}
          >
            <span className="onboard-opt-dot" />
            <span className="onboard-opt-text">
              <span className="onboard-opt-name">DeepSeek</span>
              <span className="onboard-opt-desc">
                OpenAI 兼容，需填入自己的 API Key。
              </span>
            </span>
          </button>

          {provider === "deepseek" && (
            <div className="set-sub">
              <label className="set-field">
                <span>API Key</span>
                <input
                  type="password"
                  className="set-control"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoFocus
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
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="onboard-foot">
          <button
            className="btn-primary onboard-go"
            onClick={finish}
            disabled={!canFinish || save.isPending}
          >
            {save.isPending ? "保存中…" : "开始使用"}
          </button>
        </div>
      </div>
    </div>
  );
}
