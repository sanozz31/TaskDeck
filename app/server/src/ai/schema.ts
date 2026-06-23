/** AI 对一句话任务的结构化分析结果。日期用 'YYYY-MM-DD'，无法推断为 null。 */
export interface Analysis {
  title: string;
  notes?: string;
  tags: string[];
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  due_time: string | null;
  scheduled_date: string | null;
}

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

/**
 * 传给 Agent SDK outputFormat 的 JSON Schema。
 * 注意：SDK 仅支持 type/enum/required/format 等基础约束，复杂约束写进 description。
 */
export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "简短任务标题，<=20字，去掉时间/语气词，只保留要做的事" },
    notes: { type: "string", description: "可选补充说明，没有则省略" },
    tags: {
      type: "array",
      items: { type: "string" },
      description:
        "1-4 个中文标签，概括任务主题。优先复用 prompt 给出的「已有标签库」里贴切的标签；都不合适时才新建简短中文标签",
    },
    priority: {
      type: "string",
      enum: PRIORITIES as unknown as string[],
      description: "根据紧急度与重要度判断；含'尽快/今天/截止'等倾向 high/urgent",
    },
    due_date: {
      type: ["string", "null"],
      description: "建议截止日 YYYY-MM-DD；按'今天'推断相对日期（如下周三）；无则 null",
    },
    due_time: {
      type: ["string", "null"],
      description:
        "截止的具体时刻 HH:MM（24小时制）。两类都要填：①明确时刻（'下午3点'→15:00、'晚上8点半'→20:30）；" +
        "②相对偏移（'十分钟后''半小时后''2小时后'）——以 prompt 给出的当前时刻为基准换算出绝对 HH:MM，" +
        "若换算后跨过零点则 due_date 进位到次日。无任何时间信号才填 null",
    },
    scheduled_date: {
      type: ["string", "null"],
      description: "建议开始/执行日 YYYY-MM-DD；无明确信号时可等于或早于 due_date；无则 null",
    },
  },
  required: ["title", "tags", "priority", "due_date", "due_time", "scheduled_date"],
} as const;

/** 构造分析 prompt，注入"当前时刻"与「已有标签库」以便模型推断日期/时刻、优先复用标签。 */
export function buildAnalysisPrompt(input: string, now: string, knownTags: string[] = []): string {
  const tagLine =
    knownTags.length > 0
      ? `已有标签库：${knownTags.join("、")}。打标签时优先从中选最贴切的，都不合适时才新建简短中文标签。`
      : "";
  return [
    `现在是 ${now}（含日期与时刻，星期参照真实日历）。`,
    `请把下面这句任务描述解析为结构化任务：归纳简短标题、1-4个中文标签、`,
    `判断优先级，并按语义推断建议截止日(due_date)与执行日(scheduled_date)，`,
    `能推断相对日期就换算成具体 YYYY-MM-DD，无法推断则填 null。`,
    `时间维度（due_time，HH:MM 24小时制）务必处理两类相对说法：`,
    `①明确时刻"下午3点"→15:00；②相对偏移"十分钟后/半小时后/2小时后"——以上面给出的当前时刻为基准换算出绝对时刻，`,
    `若跨过零点则 due_date 进位到次日；无任何时间信号才填 null。`,
    tagLine ? `\n${tagLine}` : "",
    `\n任务描述：「${input}」`,
  ].join("");
}
