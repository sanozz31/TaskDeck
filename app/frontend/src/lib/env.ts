/**
 * 运行环境标志。
 *
 * CLAUDE_PAUSED：「本机 Claude Code」接入已下线——后端只保留 DeepSeek（OpenAI 兼容）一条
 * AI 通路，Claude Agent SDK 已从依赖中移除。本地与发布版行为一致。
 *
 * UI 据此：默认选 DeepSeek，Claude 选项保留但禁用并标注「（暂停配置）」。
 */
export const CLAUDE_PAUSED = true;
