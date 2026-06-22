# 设计 token

风格基调：**Apple 视觉基底 + ChatGPT 式对话**。冷静、克制、大留白、单一强调色、hairline 分隔。
唯一实现来源：`app/frontend/src/styles/tokens.css`（本文档是说明，改值改 CSS）。

## 配色

| 角色 | 变量 | 值 |
|---|---|---|
| 画布 | `--canvas` | `#ffffff` |
| 次级面 / 侧栏 | `--surface` | `#f5f5f7` |
| 主文字 | `--ink` | `#1d1d1f` |
| 次级文字 | `--ink-secondary` | `#6e6e73` |
| 三级文字 | `--ink-tertiary` | `#8e8e93` |
| 细线 | `--hairline` / `--hairline-strong` | `#e5e5e7` / `#d2d2d7` |
| **强调色（唯一）** | `--accent` / `--accent-hover` | `#0071e3` / `#0066cc` |
| 强调浅底 | `--accent-soft` | `#e8f1fd` |
| 用户气泡 | `--bubble-user` | `#0071e3` |
| AI 气泡 | `--bubble-ai` | `#f5f5f7` |

优先级（低饱和点缀）：`--pri-low #8e8e93` / `--pri-medium #0071e3` / `--pri-high #f5a623` / `--pri-urgent #ff3b30`。

## 字体

```
--font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
        "Helvetica Neue", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
```
大标题负字距 `-0.02em`，字重 400–600（克制，不用 700+）。

## 形状与质感

- 圆角：`--radius-sm 8px` / `--radius 12px` / `--radius-lg 16px`
- 阴影克制：卡片仅 `--shadow-card`（极淡），chrome 不投影
- 间距尺度：`--sp-1..6` = 4 / 8 / 12 / 16 / 24 / 32 px

## 原则

1. **组件不写死颜色**，一律 `var(--...)`。
2. **强调色只用一个**（Action Blue）；多彩仅限优先级点缀。
3. 对话区为 ChatGPT 式：居中单列（max 760px）、用户右/AI 左气泡、底部圆角输入、打字态。
4. 响应式：`clamp/min/max/svh`、grid 轨道、`env(safe-area-inset-*)`；窄窗（≤720px）侧栏收为顶部横条。
