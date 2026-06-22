# 架构说明

## 整体结构

```
┌─────────────────────────── Tauri 窗口 ───────────────────────────┐
│  React 前端 (Vite, :5173)                                        │
│   ├─ Sidebar  对话/日历/标签/全部任务 切换                          │
│   ├─ ChatPanel  ChatGPT 式消息流 + 底部输入                        │
│   ├─ CalendarView / TagView / TaskList                          │
│   └─ react-query 管服务端数据缓存与失效                            │
└───────────────────────────────┬─────────────────────────────────┘
                                 │ HTTP (fetch)
                                 ▼
        Node 后端 Express (:127.0.0.1:8787, 仅 loopback)
   ┌──────────────┬───────────────────┬──────────────────────────┐
   │ routes/tasks │ ai/ (provider)    │ repo/ + db (SQLite)      │
   │  REST 端点    │  DeepSeek 抽象层   │  better-sqlite3, WAL     │
   └──────────────┴─────────┬─────────┴──────────────────────────┘
                            │ fetch（OpenAI 兼容）
                            ▼
            DeepSeek API（用户自填 Key，默认 https://api.deepseek.com）
```

## 关键决策

1. **为什么需要常驻 Node 服务**：数据层用 `better-sqlite3`（Node 原生模块）、AI 走 DeepSeek（Node `fetch`），而 Tauri 默认是 Rust 后端不跑 Node。因此 AI/数据逻辑放在独立 Node 进程，前端通过 HTTP 调用。
2. **开发期 vs 发布期**：
   - 开发期（当前）：`concurrently` 同起 server + vite + tauri dev，前端 fetch `127.0.0.1:8787`。
   - 发布期（M3）：Node 服务打包为 Tauri sidecar，由 Tauri 启动/管理；**REST 契约不变**，故无重复工作。
3. **provider 抽象**：把"调用 AI"封装为接口，当前唯一实现是 DeepSeek（OpenAI 兼容，`fetch`，json schema 约束输出）。早期曾默认本机 Claude Code（Agent SDK），已整体下线。详见 `ai/provider.ts`。
4. **AI 解析可预期**：prompt 完全由服务端构造（注入「今天」与标签库），不掺入任何外部人设/上下文，保证任务解析纯函数式、可预期。

## 数据流（创建一个任务）

1. 用户在 ChatPanel 输入 → `POST /tasks {input}`。
2. `routes/tasks` 取「今天」→ `provider.analyze(input, today)`。
3. OpenAiCompatProvider 调 DeepSeek（OpenAI 兼容 `chat/completions`），约束返回 `Analysis` JSON。
4. `taskRepo.createTask` 落库（tags 序列化为 JSON，生成 UUID/时间戳）。
5. 返回完整 Task；前端 react-query `invalidate` → 各视图刷新。
6. 若 AI 失败 → `fallbackAnalysis` 降级为「待分类」，仍入库。
