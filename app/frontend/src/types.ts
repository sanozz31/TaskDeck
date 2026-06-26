export type TaskStatus = "todo" | "doing" | "done" | "archived";
export type Priority = "low" | "medium" | "high" | "urgent";

/** 与后端 Task 对齐（tags 已是数组）。 */
export interface Task {
  id: string;
  raw_input: string;
  title: string;
  notes: string | null;
  tags: string[];
  priority: Priority;
  due_date: string | null;
  due_time: string | null;
  status: TaskStatus;
  ai_model: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagDef {
  name: string;
  created_at: string;
}

export type ViewKey = "chat" | "calendar" | "tags" | "all";

export interface Settings {
  aiProvider: string; // 'sdk' | 'deepseek'
  deepseekBaseUrl: string;
  deepseekModel: string;
  hasDeepseekKey: boolean;
  language: string; // 'zh' | 'en'
  setupDone: boolean; // 首启引导是否已完成（用户显式配置过模型）
}
