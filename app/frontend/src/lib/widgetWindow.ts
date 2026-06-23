/**
 * 主窗口侧:显隐桌面组件 / 悬浮窗(label "widget")并记忆开关状态。
 * 非 Tauri(浏览器调试)下所有操作 no-op。
 */

const KEY = "taskdeck.widget.enabled";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 是否开启(默认开;仅当用户显式关过、存了 "0" 才为关)。 */
export function isWidgetEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export async function showWidget(): Promise<void> {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  if (!inTauri()) return;
  try {
    const { Window } = await import("@tauri-apps/api/window");
    const w = await Window.getByLabel("widget");
    // 不抢焦点:避免显示瞬间把前台从用户当前 App 抢走
    await w?.show();
    if (w) await nudgeRedraw(w);
  } catch {
    /* ignore */
  }
}

/**
 * macOS(Sequoia+)已知 bug:隐藏态的透明窗 show 出来后首帧会渲染成黑底,
 * 需触发一次重绘才会用透明重新合成。微调尺寸 ±1px 再还原即可强制重绘。
 * 参考 tauri #8255 / #10306。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nudgeRedraw(w: any): Promise<void> {
  try {
    const { PhysicalSize } = await import("@tauri-apps/api/dpi");
    const sz = await w.innerSize(); // PhysicalSize
    await w.setSize(new PhysicalSize(sz.width, sz.height + 1));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await w.setSize(new PhysicalSize(sz.width, sz.height));
  } catch {
    /* ignore */
  }
}

export async function hideWidget(): Promise<void> {
  try {
    localStorage.setItem(KEY, "0");
  } catch {
    /* ignore */
  }
  if (!inTauri()) return;
  try {
    const { Window } = await import("@tauri-apps/api/window");
    const w = await Window.getByLabel("widget");
    await w?.hide();
  } catch {
    /* ignore */
  }
}
