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
 * 注入 prompt 约束模型输出的 JSON Schema（OpenAI 兼容 provider，response_format=json_object）。
 * 仅用 type/enum/required/format 等基础约束，复杂约束写进 description。
 */
// 单个任务的字段 schema（一句话可拆多个，统一进 tasks 数组）
const TASK_ITEM_SCHEMA = {
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
      description:
        "按以下底线取最高档：①距截止≤24h→urgent（通用）；②工作 / 学习相关任务→至少 medium，" +
        "其中距截止≤7天（一周内）的工作/学习任务→至少 high；③健康相关任务→至少 medium，" +
        "其中当天截止（due_date 为今天）的健康任务→至少 high；语义重要度（'非常重要''关键'等）可在底线之上再上调。" +
        "无日期则按语义，但工作/学习/健康类仍≥medium。多条命中取更高者。",
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

/** 顶层输出：一句话可能含多个任务，统一返回 { tasks: [...] }（至少 1 个）。 */
export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tasks: {
      type: "array",
      minItems: 1,
      description:
        "解析出的任务列表，至少 1 个。一句话含多件事、或'X号到Y号每天/每周'这类日期范围与重复，拆成多个任务逐一列出",
      items: TASK_ITEM_SCHEMA,
    },
  },
  required: ["tasks"],
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
    `判断优先级，按以下底线取最高档：①距截止≤24h→急（通用）；②工作 / 学习相关任务→至少中，` +
      `其中距截止≤7天（一周内）的工作/学习任务→至少高；③健康相关任务→至少中，其中当天截止（截止日为今天）的健康任务→至少高；` +
      `再结合语义重要度（如"非常重要""关键"等）在底线之上上调；无日期则按语义，但工作/学习/健康类仍至少为中。多条命中取更高档。`,
    `并按语义推断建议截止日(due_date)与执行日(scheduled_date)，`,
    `能推断相对日期就换算成具体 YYYY-MM-DD，无法推断则填 null。`,
    `时间维度（due_time，HH:MM 24小时制）务必处理两类相对说法：`,
    `①明确时刻"下午3点"→15:00；②相对偏移"十分钟后/半小时后/2小时后"——以上面给出的当前时刻为基准换算出绝对时刻，`,
    `若跨过零点则 due_date 进位到次日；无任何时间信号才填 null。`,
    `\n【重要】一句话可能包含多个任务：若含多件事、或"X号到Y号每天/每周"这类日期范围或重复，` +
      `请逐一拆成多个任务放进 tasks 数组（如"7月1号到5号每天中午12点健身"→ 拆成 7-01…7-05 共 5 个任务，各 due_time 12:00）；` +
      `单个任务也放进 tasks（长度为 1）。`,
    tagLine ? `\n${tagLine}` : "",
    `\n任务描述：「${input}」`,
  ].join("");
}
