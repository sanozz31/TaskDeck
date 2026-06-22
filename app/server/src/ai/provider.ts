import type { Analysis } from "./schema.js";
import { getAiConfig } from "../repo/settingsRepo.js";

export interface AnalyzeResult {
  analysis: Analysis;
  model: string | null;
}

/** 调用 AI 分析任务的统一抽象。 */
export interface ClaudeProvider {
  readonly name: string;
  /** knownTags：当前标签库，注入 prompt 引导模型优先复用已有标签。 */
  analyze(input: string, today: string, knownTags?: string[]): Promise<AnalyzeResult>;
}

/**
 * 唯一 provider：OpenAI 兼容（DeepSeek，自填 API Key + 接口地址）。
 * 未配置 Key 时其 analyze 会抛错，路由层 fallbackAnalysis 兜底降级入库。
 */
export async function getProvider(): Promise<ClaudeProvider> {
  const cfg = getAiConfig();
  const { OpenAiCompatProvider } = await import("./openaiCompatProvider.js");
  return new OpenAiCompatProvider(cfg);
}
