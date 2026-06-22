import express from "express";
import { ALLOWED_ORIGIN, HOST, PORT, PROVIDER } from "./config.js";
import { getDb } from "./db.js";
import { purgeExpiredDone } from "./repo/taskRepo.js";
import { tasksRouter } from "./routes/tasks.js";

const app = express();
app.use(express.json());

// 本地自用：放行 Vite 开发来源的跨域请求
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
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

app.listen(PORT, HOST, () => {
  console.log(`[TaskDeck] server on http://${HOST}:${PORT}  provider=${PROVIDER}`);
});
