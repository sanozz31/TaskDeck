import express from "express";
import type { AddressInfo } from "node:net";
import { HOST, PORT, isAllowedOrigin } from "./config.js";
import { getDb } from "./db.js";
import { purgeExpiredDone, escalatePriorities } from "./repo/taskRepo.js";
import { tasksRouter } from "./routes/tasks.js";

const app = express();
app.use(express.json());

// 本地自用：仅监听 loopback；CORS 走 allowlist（开发期 Vite + 打包后 tauri webview），
// 不反射任意 Origin——否则浏览器里的任意网页都能跨源读写本机任务库。
// 不放行的来源：不回 ACAO（响应不可读），且预检直接 403（挡掉 PATCH/DELETE/JSON-POST 等写操作）。
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = isAllowedOrigin(origin);
  if (allowed) {
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(allowed ? 204 : 403);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: "deepseek" });
});

app.use(tasksRouter);

// 启动前确保 DB 就绪（建表），并清理已完成满 7 天的任务
getDb();
purgeExpiredDone();

// 优先级随 DDL 临近自动升级：启动跑一次 + 每 5 分钟一轮（仅升不降，单一数据源）
escalatePriorities();
setInterval(escalatePriorities, 5 * 60 * 1000).unref();

const server = app.listen(PORT, HOST, () => {
  const actual = (server.address() as AddressInfo)?.port ?? PORT;
  console.log(`[TaskDeck] server on http://${HOST}:${actual}  provider=deepseek`);
  // 机器可读端口行：打包后 Tauri 读此行获知实际端口（PORT=0 时由系统分配，避免端口冲突）
  console.log(`TASKDECK_PORT=${actual}`);
});
