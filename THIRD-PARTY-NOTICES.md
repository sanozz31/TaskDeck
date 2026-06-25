# 第三方声明与致谢（Third-Party Notices）

> 适用版本：v1.2.0
> 发布者：sanozz31
> 最后更新：2026 年 6 月 25 日

「万事（TaskDeck）」在开发过程中使用了下列优秀的开源项目与第三方服务。
其著作权归各自的著作权人所有，相关使用均遵循其各自的开源许可证或服务条款。
在此一并致谢。

---

## 一、主要开源组件

下列为本软件构建所依赖的主要开源项目（具体版本以发布时实际打包为准）。
各项目的完整许可证文本请参见其官方仓库。

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| [Tauri](https://github.com/tauri-apps/tauri) | 桌面应用框架（Rust） | Apache-2.0 / MIT |
| [Rust 标准库及相关 crates](https://www.rust-lang.org/) | 系统层与构建 | Apache-2.0 / MIT |
| [React](https://github.com/facebook/react) | 前端 UI 框架 | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 类型化的 JavaScript | Apache-2.0 |
| [Vite](https://github.com/vitejs/vite) | 前端构建工具 | MIT |
| [TanStack Query](https://github.com/TanStack/query) | 数据获取与缓存 | MIT |
| [react-day-picker](https://github.com/gpbl/react-day-picker) | 日历组件 | MIT |
| [date-fns](https://github.com/date-fns/date-fns) | 日期处理 | MIT |
| [Node.js](https://github.com/nodejs/node) | 后端运行时（sidecar） | MIT 等（详见其许可） |
| [Express](https://github.com/expressjs/express) | 后端 Web 框架 | MIT |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite 驱动 | MIT |
| [SQLite](https://www.sqlite.org/) | 本地数据库引擎 | Public Domain（公有领域） |

> 说明：上表列出的是主要直接依赖；其各自所依赖的间接组件，亦遵循其
> 相应的开源许可证。如需完整依赖清单，可参见本软件源工程中的
> `package.json` 与 `Cargo.lock`（随开发版本提供）。如发现遗漏或
> 标注有误，欢迎通过文末邮箱告知，我们将及时更正。

---

## 二、第三方服务

本软件可与下列第三方 AI 服务交互（需由用户自行配置接口密钥）：

- **DeepSeek**（深度求索）—— 用于自然语言任务解析。
- **OpenAI 兼容接口** —— 用户可在设置中配置兼容的接口地址与模型。

本软件**不是**上述任何服务商的官方客户端，与其不存在隶属、代理或
合作关系。用户与上述服务的交互，受各服务商自身的服务条款与隐私政策
约束。详见 [PRIVACY.md](./PRIVACY.md)。

---

## 三、原创声明

除上述第三方组件与服务外，本软件的名称「万事 / TaskDeck」、应用图标、
交互方案（含悬浮窗呼吸预警、两层优先级体系、对话式任务
录入等）均为 sanozz31 的原创设计，著作权归 sanozz31 所有。
详见 [LICENSE](./LICENSE)。

---

如对第三方声明有任何疑问，请联系：sanozz31 · sanozz@163.com

Copyright (C) 2026 sanozz31. 保留所有权利。
