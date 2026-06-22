# 里程碑

## M1 — 闭环 MVP ✅ 已完成

输入 → AI 分析 → 入库 → 四视图呈现，端到端跑通。

交付物：
- 脚手架（Tauri + React/TS + Node + SQLite）+ 一键 `npm run dev`
- Node 后端：SQLite schema/repo、provider 抽象、SdkProvider 结构化输出、CliProvider 回退、REST 全套
- 前端：ChatPanel（ChatGPT 式）、Sidebar 四视图、CalendarView（react-day-picker）、TagView、TaskList
- Apple + ChatGPT 设计 token 落地
- Tauri 壳编译通过（修复 `time 0.3.50` yank 问题）

验收（已通过）：输入「下周三前交季度报告」「周五前交报销单」「周日陪家人散步」→ 标题/标签/优先级/日期均正确推断，四视图可见，数据持久化。模型实测 `claude-opus-4-8[1m]`，复用本机 CC 登录、零 API key。

## M2 — 可用性增强（进行中）

已交付：
- **优先级**：四档命名 急 / 高 / 中 / 低（`urgent/high/medium/low`）+ 点缀色。
- **已完成任务浮窗**：全部任务页右下角「已完成」入口；任务划掉当次仍留主列表（可反悔），下次打开归入浮窗；完成满 **7 天物理删除**（`completed_at` + 启动/打开时清理）。
- **日历**：左上角年 / 月支持点击微调与直接输入数字切换；圆点按**当天最高优先级**着色；当天任务按具体时间（`due_time`，24h）升序排列。
- **标签库**：标签升级为字典表 `tag_defs`（预设 学习/工作/生活/娱乐/健康/财务/家庭/社交/旅行）；标签页支持新增 / 删除；AI 打标签优先复用标签库，新标签自动并入。
- **具体时间维度**：`due_time`（HH:MM，24h），AI 从「下午3点」等解析。
- **DDL 通知提醒**（App 运行时）：有具体时间提前 30 分钟、纯日期当天 8:00；Web Notification + localStorage 去重；**关闭 App 不提醒**为当前 MVP 限制。
- **对话历史持久化**（localStorage，刷新不丢）。
- 删除对话页示例气泡；全部任务 / 标签页空态引导 CTA。
- **设置与多模型接入**：侧栏齿轮进设置弹窗，AI provider 可在「本机 Claude Code（默认，零配置）」与「DeepSeek（OpenAI 兼容，需 API Key）」间切换；语言偏好（本轮仅 UI）。DeepSeek 模型从手填文本框升级为下拉，选项为当前生产版 `deepseek-v4-flash` / `deepseek-v4-pro`（旧别名 `deepseek-chat` / `deepseek-reasoner` 官方 2026/07/24 停用，已下线）；服务端默认模型同步改为 `deepseek-v4-flash`。侧栏底部常显当前接入模型名。
- **文案精简**：空态主标题「万事皆有安排」、副标题「你说一句，剩下的交给我」、输入框 placeholder「有任务，立即安排」。
- **应用图标与品牌**：替换为自绘 App 图标（任务卡叠加 + 蓝色对勾，呼应「任务卡」主题），经 `tauri icon` 生成 macOS/iOS/Android 全套（icns/ico/png）；Web 端 favicon 与窗口 `<title>`（万事 TaskDeck）同步更新。
- **任务模型精简**：下线「分类」维度，只保留更灵活的标签；删除标签加确认弹窗（复用通用 `ConfirmModal`，红色危险按钮）防误删。

待办：
- 任务编辑 UI：标题/日期/优先级/标签可改（PATCH 已就绪，补 UI）
- CliProvider 回退的配置切换与异常监控
- 标签多选筛选、重命名
- 日历升级：周视图、拖拽改期（FullCalendar 评估）

## M3 — 打包发布（sidecar）

- Node server 打包为单文件 + better-sqlite3 原生模块随包
- Tauri `externalBin` sidecar：启动/退出生命周期、动态端口（stdout 上报）
- DB 落 Tauri app data 目录；首启迁移
- 产出 macOS `.app` / dmg

## M4 — 迭代（需求外）

- 大任务拆解为子任务并排期
- 分钟级精细排期、重复任务
- **通知常驻**：关闭 App 也能提醒（托盘 / 后台常驻进程，甚至开机自启）——补齐 M2 提醒的 MVP 限制
- 提醒联动 Mochi 表情
- 对话式追问改单（「把这个改到下周」）
