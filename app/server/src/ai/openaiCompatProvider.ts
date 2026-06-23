import { analysisJsonSchema, buildAnalysisPrompt, type Analysis } from "./schema.js";
import type { AnalyzeResult, ClaudeProvider } from "./provider.js";
import type { AiConfig } from "../repo/settingsRepo.js";

const SYSTEM_PROMPT =
  "你是一个严谨的任务解析助手，只负责把用户的一句话任务转成结构化数据，" +
  "不闲聊、不追问、不执行任何操作。始终只输出一个 JSON 对象。";

/**
 * OpenAI 兼容 provider：用于 DeepSeek 等第三方模型（自填 API Key + 接口地址）。
 * 走 `${base}/chat/completions`，response_format=json_object，结构靠 prompt 中的 schema 约束 + 文本截取兜底。
 */
export class OpenAiCompatProvider implements ClaudeProvider {
  readonly name = "deepseek";
  constructor(private cfg: AiConfig) {}

  async analyze(input: string, now: string, knownTags: string[] = []): Promise<AnalyzeResult> {
    const { deepseekApiKey, deepseekBaseUrl, deepseekModel } = this.cfg;
    if (!deepseekApiKey) throw new Error("未配置 DeepSeek API Key");

    const prompt =
      buildAnalysisPrompt(input, now, knownTags) +
      `\n\n只输出一个符合下述 JSON Schema 的 JSON 对象，不要任何额外文字或代码块标记。\n` +
      `JSON Schema：${JSON.stringify(analysisJsonSchema)}`;

    const base = deepseekBaseUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: deepseekModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`DeepSeek 请求失败 ${res.status}：${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("DeepSeek 未返回可解析的 JSON");
    const parsed = JSON.parse(content.slice(start, end + 1)) as {
      tasks?: Analysis[];
    } & Partial<Analysis>;
    // 模型返回 { tasks:[...] } 用之；万一直接返回单个对象，兜底包成数组
    const analyses =
      Array.isArray(parsed.tasks) && parsed.tasks.length > 0
        ? parsed.tasks
        : [parsed as Analysis];
    return { analyses, model: data.model ?? deepseekModel };
  }
}
