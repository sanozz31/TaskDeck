import { query } from "@anthropic-ai/claude-agent-sdk";
import { analysisJsonSchema, buildAnalysisPrompt, type Analysis } from "./schema.js";
import type { AnalyzeResult, ClaudeProvider } from "./provider.js";

const SYSTEM_PROMPT =
  "你是一个严谨的任务解析助手，只负责把用户的一句话任务转成结构化数据，" +
  "不闲聊、不追问、不执行任何操作。始终按要求的 JSON 结构输出。";

/**
 * 默认 provider：通过 Agent SDK 调本机 Claude Code。
 * - 复用本机 ~/.claude 登录凭证与默认模型（不传 model，可用 TASKDECK_MODEL 覆盖）。
 * - 故意不加载 settingSources：避免用户全局 CLAUDE.md 人设污染任务分析。
 * - outputFormat=json_schema 由 SDK 强制校验结构化输出。
 */
export class SdkProvider implements ClaudeProvider {
  readonly name = "sdk";

  async analyze(input: string, today: string, knownTags: string[] = []): Promise<AnalyzeResult> {
    const model = process.env.TASKDECK_MODEL?.trim() || undefined;
    const response = query({
      prompt: buildAnalysisPrompt(input, today, knownTags),
      options: {
        ...(model ? { model } : {}),
        systemPrompt: SYSTEM_PROMPT,
        allowedTools: [],
        maxTurns: 5,
        outputFormat: {
          type: "json_schema",
          schema: analysisJsonSchema as unknown as Record<string, unknown>,
        },
      },
    });

    for await (const message of response) {
      if (message.type !== "result") continue;
      if (message.subtype === "success" && message.structured_output) {
        const usedModel = Object.keys(message.modelUsage ?? {})[0] ?? model ?? null;
        return { analysis: message.structured_output as Analysis, model: usedModel };
      }
      throw new Error(`Agent SDK 分析失败：${message.subtype}`);
    }
    throw new Error("Agent SDK 未返回 result 消息");
  }
}
