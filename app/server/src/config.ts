import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 服务监听端口，仅绑定 loopback，前端与（M3）Tauri 共用此契约。 */
export const PORT = Number(process.env.TASKDECK_PORT ?? 8787);
export const HOST = "127.0.0.1";

/** 开发期允许的前端来源（Vite 默认 5173）。本地自用，CORS 仅放行 localhost。 */
export const ALLOWED_ORIGIN = process.env.TASKDECK_ORIGIN ?? "http://localhost:5173";

/** SQLite 文件路径。开发期落 server/data/，M3 改为 Tauri app data 目录。 */
export const DB_PATH =
  process.env.TASKDECK_DB ?? resolve(__dirname, "..", "data", "taskdeck.db");
