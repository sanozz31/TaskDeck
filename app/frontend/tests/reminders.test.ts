/**
 * reminders.ts 单元测试：验证 deadline 变更去重逻辑
 * 运行: npx tsx src/lib/reminders.test.ts
 */
import { dueAtMs } from "./deadline";
import type { Task } from "../types";

// ---------- Mock 环境 ----------
// Mock localStorage
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};
// Mock Notification (避免 fire() 抛错)
(globalThis as any).Notification = class {
  static permission = "granted";
  constructor(_title: string, _opts?: any) {}
};
// Mock window (isTauri 需要)
(globalThis as any).window = globalThis;

// ---------- 工具函数 ----------
const NOTIFIED_KEY = "taskdeck.notified.v2";
const DUE_SNAPSHOT_KEY = "taskdeck.due_snapshot.v1";
const STAGES = [
  { key: "24h", before: 24 * 60 * 60 * 1000 },
  { key: "6h", before: 6 * 60 * 60 * 1000 },
] as const;

function loadNotified(): Set<string> {
  return new Set(JSON.parse(store[NOTIFIED_KEY] || "[]") as string[]);
}
function saveNotified(s: Set<string>) {
  store[NOTIFIED_KEY] = JSON.stringify([...s]);
}
function loadDueSnapshot(): Record<string, number> {
  return JSON.parse(store[DUE_SNAPSHOT_KEY] || "{}") as Record<string, number>;
}
function saveDueSnapshot(s: Record<string, number>) {
  store[DUE_SNAPSHOT_KEY] = JSON.stringify(s);
}

/**
 * 核心逻辑副本：与 reminders.ts 的 checkReminders 保持一致
 * （用于测试，不依赖 Tauri 插件）
 */
function simulateCheck(tasks: Task[], now: number): string[] {
  const fired: string[] = []; // 收集触发的 stage key
  const notified = loadNotified();
  const liveIds = new Set(tasks.map((t) => t.id));
  const dueSnapshot = loadDueSnapshot();
  const newSnapshot: Record<string, number> = {};
  const GRACE_MS = 24 * 60 * 60 * 1000;

  for (const task of tasks) {
    if (task.status === "done" || task.status === "archived") continue;
    const dueAt = dueAtMs(task);
    if (!Number.isFinite(dueAt)) continue;

    newSnapshot[task.id] = dueAt;

    // deadline 变更检测
    if (dueSnapshot[task.id] !== undefined && dueSnapshot[task.id] !== dueAt) {
      for (const st of STAGES) notified.delete(`${task.id}:${st.key}`);
    }

    if (now > dueAt + GRACE_MS) continue;

    for (let i = STAGES.length - 1; i >= 0; i--) {
      const st = STAGES[i];
      if (now < dueAt - st.before) continue;
      const mark = `${task.id}:${st.key}`;
      if (notified.has(mark)) break;

      fired.push(mark);
      notified.add(mark);
      for (let j = 0; j < i; j++) notified.add(`${task.id}:${STAGES[j].key}`);
      break;
    }
  }

  for (const mark of notified) {
    if (!liveIds.has(mark.split(":")[0])) notified.delete(mark);
  }
  for (const tid of Object.keys(dueSnapshot)) {
    if (!liveIds.has(tid)) delete newSnapshot[tid];
  }

  saveNotified(notified);
  saveDueSnapshot(newSnapshot);
  return fired;
}

// ---------- 辅助：造任务 ----------
const T = (id: string, due_date: string, due_time?: string | null): Task => ({
  id, title: `Test ${id}`, status: "todo", due_date, due_time: due_time ?? null, priority: "medium",
});

// ---------- 测试用例 ----------
let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try {
    // 清空 localStorage
    Object.keys(store).forEach(k => delete store[k]);
    fn();
    passed++;
    console.log(`✅ PASS: ${name}`);
  } catch (e: any) {
    failed++;
    console.error(`❌ FAIL: ${name}\n   ${e.message}`);
  }
}

// 场景 1：首次提醒，正常触发
test("首次进入 24h 窗口 → 触发 24h 提醒", () => {
  const task = T("t1", "2026-06-29", "20:00"); // 6月29日 20:00
  const dueAt = dueAtMs(task); // 应等于 2026-06-29T20:00
  const now = dueAt - 25 * 60 * 60 * 1000; // 截止前 25h（不在任何窗口）

  let fired = simulateCheck([task], now);
  if (fired.length !== 0) throw new Error("距截止25h不应触发");

  // 推进到截止前12h（在24h窗口内）
  const now2 = dueAt - 12 * 60 * 60 * 1000;
  fired = simulateCheck([task], now2);
  if (fired.length !== 1) throw new Error(`应触发1条提醒，实际: ${fired.length}`);
  if (fired[0] !== "t1:24h") throw new Error(`应触发24h，实际: ${fired[0]}`);
});

// 场景 2：deadline 推迟 → 旧 key 清除，新 deadline 可重新触发
test("deadline 推迟 → 旧 key 清除，新 deadline 重新触发", () => {
  const task = T("t2", "2026-06-28", "20:00");
  const dueAt1 = dueAtMs(task);

  // 第一次：靠近旧 deadline，触发 6h 提醒
  const now1 = dueAt1 - 3 * 60 * 60 * 1000; // 截止前 3h
  let fired = simulateCheck([task], now1);
  if (fired.length !== 1 || fired[0] !== "t2:6h") throw new Error(`第1次应触发6h, 实际: ${fired}`);

  // 检查快照已记录
  const snap1 = loadDueSnapshot();
  if (snap1["t2"] !== dueAt1) throw new Error("快照未记录旧 dueAtMs");

  // 现在推迟 deadline 到 6月30日
  const task2 = T("t2", "2026-06-30", "20:00");
  const dueAt2 = dueAtMs(task2);

  // 推进到新 deadline 前 12h（24h 窗口内）
  const now2 = dueAt2 - 12 * 60 * 60 * 1000;
  fired = simulateCheck([task2], now2);

  // 应触发 24h 提醒（旧 6h/24h key 已被清除）
  if (fired.length !== 1) throw new Error(`应触发1条提醒, 实际: ${fired.length}`);
  if (fired[0] !== "t2:24h") throw new Error(`应触发24h, 实际: ${fired[0]}`);

  // 快照应已更新
  const snap2 = loadDueSnapshot();
  if (snap2["t2"] !== dueAt2) throw new Error("快照未更新到新 dueAtMs");
});

// 场景 3：deadline 提前 → 新窗口阶段正确触发
test("deadline 提前 → 新窗口阶段正确触发", () => {
  const task = T("t3", "2026-06-30", "20:00");
  const dueAt1 = dueAtMs(task);

  // 第一次：靠近旧 deadline，只触发 24h 提醒
  const now1 = dueAt1 - 12 * 60 * 60 * 1000;
  let fired = simulateCheck([task], now1);
  if (fired[0] !== "t3:24h") throw new Error(`第1次应触发24h, 实际: ${fired}`);

  // 提前 deadline 到更近的时间（6h 窗口内）
  const task2 = T("t3", "2026-06-29", "02:00");
  const dueAt2 = dueAtMs(task2);
  const now2 = dueAt2 - 3 * 60 * 60 * 1000; // 新 deadline 前 3h

  fired = simulateCheck([task2], now2);
  // 旧 24h key 被清除，新 deadline 6h 窗口内 → 应触发 6h
  if (fired.length !== 1) throw new Error(`应触发1条提醒, 实际: ${fired.length}`);
  if (fired[0] !== "t3:6h") throw new Error(`应触发6h, 实际: ${fired[0]}`);
});

// 场景 4：deadline 不变 → 不重复触发
test("deadline 不变 → 不重复触发", () => {
  const task = T("t4", "2026-06-29", "20:00");
  const dueAt = dueAtMs(task);
  const now = dueAt - 12 * 60 * 60 * 1000;

  // 第一次触发
  let fired = simulateCheck([task], now);
  if (fired.length !== 1) throw new Error(`第1次应触发1条`);

  // 第二次，同一 deadline
  fired = simulateCheck([task], now);
  if (fired.length !== 0) throw new Error(`第2次不应触发, 实际: ${fired}`);
});

// 场景 5：删除任务后快照清理
test("删除任务 → snapshot 和 notified key 清理", () => {
  const task = T("t5", "2026-06-29", "20:00");
  const dueAt = dueAtMs(task);
  const now = dueAt - 3 * 60 * 60 * 1000;

  // 触发提醒
  simulateCheck([task], now);

  let snap = loadDueSnapshot();
  if (!snap["t5"]) throw new Error("快照应包含 t5");

  // 删除任务（空数组）
  simulateCheck([], now);

  snap = loadDueSnapshot();
  if (snap["t5"] !== undefined) throw new Error("快照应已清理 t5");

  const notified = loadNotified();
  const hasT5 = [...notified].some(m => m.startsWith("t5:"));
  if (hasT5) throw new Error("notified 应已清理 t5 的记录");
});

// 场景 6：新任务首次运行（无旧快照）→ 正常触发
test("新任务（无旧快照）→ 直接正常触发", () => {
  const task = T("t6", "2026-06-29", "20:00");
  const dueAt = dueAtMs(task);
  const now = dueAt - 3 * 60 * 60 * 1000;

  const fired = simulateCheck([task], now);
  // 不应因快照缺失而报错，应正常触发 6h
  if (fired.length !== 1) throw new Error(`应触发1条, 实际: ${fired.length}`);
  if (fired[0] !== "t6:6h") throw new Error(`应触发6h, 实际: ${fired[0]}`);
});

// 场景 7：只改 due_time（同一天内）→ 重新触发
test("同天内改 due_time → 旧 key 清除，重新触发", () => {
  const task1 = T("t7", "2026-06-29", "10:00");
  const dueAt1 = dueAtMs(task1);
  const now1 = dueAt1 - 3 * 60 * 60 * 1000;

  // 第一次触发 6h
  let fired = simulateCheck([task1], now1);
  if (fired[0] !== "t7:6h") throw new Error(`第1次应触发6h, 实际: ${fired}`);

  // 修改 due_time 到 22:00（推迟）
  const task2 = T("t7", "2026-06-29", "22:00");
  const dueAt2 = dueAtMs(task2);
  const now2 = dueAt2 - 3 * 60 * 60 * 1000;

  fired = simulateCheck([task2], now2);
  // 旧 key 已清除，应重新触发
  if (fired.length !== 1) throw new Error(`应触发1条, 实际: ${fired.length}`);
  if (fired[0] !== "t7:6h") throw new Error(`应触发6h, 实际: ${fired[0]}`);
});

// ---------- 结果 ----------
console.log(`\n===== 测试结果: ${passed}/${passed + failed} 通过 =====`);
if (failed > 0) throw new Error(`${failed} tests failed`);
