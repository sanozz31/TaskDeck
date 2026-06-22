/**
 * 运行环境标志。
 *
 * CLAUDE_PAUSED：打包发布版（`vite build`，PROD=true）里「本机 Claude Code」接入暂停——
 * 为给安装包瘦身，打包时已从 sidecar 依赖中剔除 Claude Agent SDK（~219MB 原生二进制），
 * 故发布版只走 DeepSeek。本地开发（`npm run dev` / `dev:browser`，PROD=false）不受影响，
 * Claude 仍可正常使用。
 *
 * UI 据此：发布版默认选 DeepSeek，Claude 选项保留但禁用并标注「（暂停配置）」。
 */
export const CLAUDE_PAUSED = import.meta.env.PROD;
