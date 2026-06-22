import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { analysisJsonSchema, buildAnalysisPrompt, type Analysis } from "./schema.js";
import type { AnalyzeResult, ClaudeProvider } from "./provider.js";

const pexec = promisify(execFile);

/**
 * 回退 provider：直接 spawn `claude -p`，100% 复用本机 CC 登录与默认模型。
 * 仅在 Agent SDK 认证/运行异常时通过 TASKDECK_PROVIDER=cli 启用。
 * 结构化输出靠 prompt 约束 + 文本里截取 JSON，稳健性弱于 SDK 的 structured_output。
 */
export class CliProvider implements ClaudeProvider {
  readonly name = "cli";

  async analyze(input: string, today: string, knownTags: string[] = []): Promise<AnalyzeResult> {
    const prompt =
      buildAnalysisPrompt(input, today, knownTags) +
      `\n\n只输出一个符合下述 JSON Schema 的 JSON 对象，不要任何额外文字或代码块标记。\n` +
      `JSON Schema：${JSON.stringify(analysisJsonSchema)}`;

    const args = ["-p", prompt, "--output-format", "json"];
    const model = process.env.TASKDECK_MODEL?.trim();
    if (model) args.push("--model", model);

    const { stdout } = await pexec("claude", args, {
      encoding: "utf8",
      maxBuffer: 4 << 20,
    });

    // claude --output-format json 外层是 { result: "<文本>", ... }
    let resultText = stdout;
    let usedModel: string | null = model ?? null;
    try {
      const outer = JSON.parse(stdout) as { result?: string; modelUsage?: Record<string, unknown> };
      if (typeof outer.result === "string") resultText = outer.result;
      if (outer.modelUsage) usedModel = Object.keys(outer.modelUsage)[0] ?? usedModel;
    } catch {
      // stdout 非 JSON 时按纯文本继续解析
    }

    const start = resultText.indexOf("{");
    const end = resultText.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("CLI provider 未能从输出中提取 JSON");
    }
    const analysis = JSON.parse(resultText.slice(start, end + 1)) as Analysis;
    return { analysis, model: usedModel };
  }
}
