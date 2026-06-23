import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 服务监听端口，仅绑定 loopback，前端与（M3）Tauri 共用此契约。 */
export const PORT = Number(process.env.TASKDECK_PORT ?? 8787);
export const HOST = "127.0.0.1";

/** 开发期允许的前端来源（Vite 默认 5173）。可用 TASKDECK_ORIGIN 覆盖。 */
export const ALLOWED_ORIGIN = process.env.TASKDECK_ORIGIN ?? "http://localhost:5173";

/**
 * 判断请求来源是否放行（CORS allowlist）。
 * 本地自用 App：仅放行开发期 Vite 来源与 Tauri 打包后的 webview 来源，
 * 不反射任意 Origin——否则用户浏览器里的任意恶意网页都能读写本机任务库。
 * - 无 Origin：非浏览器请求（curl / 同源），放行。
 * - Tauri webview：macOS `tauri://localhost`、Windows `http(s)://tauri.localhost`。
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === ALLOWED_ORIGIN) return true;
  if (/^tauri:\/\//.test(origin)) return true;
  if (/^https?:\/\/tauri\.localhost$/.test(origin)) return true;
  return false;
}

/** SQLite 文件路径。开发期落 server/data/，M3 改为 Tauri app data 目录。 */
export const DB_PATH =
  process.env.TASKDECK_DB ?? resolve(__dirname, "..", "data", "taskdeck.db");
