import type { Analysis } from "./schema.js";
import { PROVIDER } from "../config.js";
import { getAiConfig } from "../repo/settingsRepo.js";

export interface AnalyzeResult {
  analysis: Analysis;
  model: string | null;
}

/** 调用 Claude 分析任务的统一抽象。两种实现返回同一形态，调用方无感。 */
export interface ClaudeProvider {
  readonly name: string;
  /** knownTags：当前标签库，注入 prompt 引导模型优先复用已有标签。 */
  analyze(input: string, today: string, knownTags?: string[]): Promise<AnalyzeResult>;
}

/**
 * 按设置 + 环境选 provider（不缓存，保证设置切换即时生效）：
 * - 设置选了 deepseek 且填了 key → OpenAI 兼容 provider；
 * - 否则默认 Agent SDK（复用本机 CC），TASKDECK_PROVIDER=cli 时走命令行回退。
 */
export async function getProvider(): Promise<ClaudeProvider> {
  const cfg = getAiConfig();
  if (cfg.aiProvider === "deepseek" && cfg.deepseekApiKey) {
    const { OpenAiCompatProvider } = await import("./openaiCompatProvider.js");
    return new OpenAiCompatProvider(cfg);
  }
  if (PROVIDER === "cli") {
    const { CliProvider } = await import("./cliProvider.js");
    return new CliProvider();
  }
  const { SdkProvider } = await import("./sdkProvider.js");
  return new SdkProvider();
}
