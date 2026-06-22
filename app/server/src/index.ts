import express from "express";
import type { AddressInfo } from "node:net";
import { HOST, PORT, PROVIDER } from "./config.js";
import { getDb } from "./db.js";
import { purgeExpiredDone } from "./repo/taskRepo.js";
import { tasksRouter } from "./routes/tasks.js";

const app = express();
app.use(express.json());

// 本地自用：仅监听 loopback，CORS 反射请求来源（开发期 Vite，打包后 tauri:// webview）
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: PROVIDER });
});

app.use(tasksRouter);

// 启动前确保 DB 就绪（建表），并清理已完成满 7 天的任务
getDb();
purgeExpiredDone();

const server = app.listen(PORT, HOST, () => {
  const actual = (server.address() as AddressInfo)?.port ?? PORT;
  console.log(`[TaskDeck] server on http://${HOST}:${actual}  provider=${PROVIDER}`);
  // 机器可读端口行：打包后 Tauri 读此行获知实际端口（PORT=0 时由系统分配，避免端口冲突）
  console.log(`TASKDECK_PORT=${actual}`);
});
