import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 悬浮窗姿态控制(位置驱动,纯点击 + 手动拖窗,无悬停)。
 *
 * 规则:
 * - **不在边缘** → 一直是展开卡片,可随意拖动,不吸附。
 * - 拖到**左/右边缘** → 吸附、缩成**半隐的圆球**。
 * - 球:**点击**展开;**拖动**换位。展开/吸附判定全部在**真正松手(pointerup)那一刻**。
 * - 卡片**最小化键**:自由态就近吸边、同高度收球;贴边态直接收球。失焦时贴边卡片收球。
 *
 * 关键:**不用 startDragging()**(它把拖动交给 OS,松手事件被吞,只能靠「位移暂停」猜)。
 * 改为自己 setPosition() 手动拖窗(rAF 节流),整条 pointer 生命周期留在 webview,
 * pointerup 真实可靠 → 「手离开鼠标才展开」。参考 Tauri #10767 与官方 Window Customization。
 *
 * 非 Tauri(浏览器预览)下窗口操作 no-op,恒展开卡片。
 */

const BALL = 64; // 球窗口尺寸
const BALL_PEEK = 44; // 吸附时露在屏内的宽度(其余半隐到屏外)
const CARD_W = 320;
const CARD_H = 420;
const MARGIN = 8; // 贴边/留白
const TOP_INSET = 40; // 卡片距顶(避开菜单栏)
const SNAP = 72; // 松手时距边缘多近触发吸附
const DRAG_THRESHOLD = 6; // 位移超过算「拖动」,否则算点击
const KEY = "taskdeck.widget.pos"; // {docked, edge, x, y}

type Edge = "left" | "right";
interface Screen {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Persisted {
  docked: boolean;
  edge: Edge;
  x: number;
  y: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WinApi = { win: any; LogicalPosition: any; LogicalSize: any };

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      return {
        docked: p.docked !== false,
        edge: p.edge === "left" ? "left" : "right",
        x: typeof p.x === "number" ? p.x : NaN,
        y: typeof p.y === "number" ? p.y : NaN,
      };
    }
  } catch {
    /* ignore */
  }
  return { docked: true, edge: "right", x: NaN, y: NaN };
}

export interface Posture {
  expanded: boolean;
  docked: boolean;
  edge: Edge;
  /** 拖动手柄(球或卡片头部)的指针事件;调用方负责 setPointerCapture/release。 */
  onDragStart: (sx: number, sy: number) => void;
  onDragMove: (sx: number, sy: number) => void;
  /** 松手:isBall=true 且未拖动 → 点击展开。 */
  onDragEnd: (sx: number, sy: number, isBall: boolean) => void;
  minimize: () => void;
  focusMain: () => void;
}

export function usePosture(): Posture {
  const init = load();
  const [docked, setDocked] = useState(inTauri() ? init.docked : false);
  const [edge, setEdge] = useState<Edge>(init.edge);
  const [pinned, setPinned] = useState(false);

  const expanded = !docked || pinned;

  const screenRef = useRef<Screen>({ left: 0, top: 0, width: 1440, height: 900 });
  const posRef = useRef<{ x: number; y: number }>({ x: init.x, y: init.y });
  const lastTarget = useRef<{ x: number; y: number }>({ x: init.x, y: init.y });
  const apiRef = useRef<WinApi | null>(null);

  const dockedRef = useRef(docked);
  const expandedRef = useRef(expanded);
  const edgeRef = useRef(edge);
  dockedRef.current = docked;
  expandedRef.current = expanded;
  edgeRef.current = edge;

  // 手动拖动状态
  const drag = useRef({
    active: false,
    moved: false,
    sx: 0, // 起始光标(屏幕逻辑坐标)
    sy: 0,
    wx: 0, // 起始窗口左上(逻辑)
    wy: 0,
    w: BALL, // 拖动时窗口宽(用于边缘判定)
    raf: 0,
    pendingX: 0,
    pendingY: 0,
  });

  const refreshScreen = useCallback(async () => {
    if (!inTauri()) return;
    try {
      const { currentMonitor } = await import("@tauri-apps/api/window");
      const m = await currentMonitor();
      if (m) {
        const s = m.scaleFactor || 1;
        screenRef.current = {
          left: m.position.x / s,
          top: m.position.y / s,
          width: m.size.width / s,
          height: m.size.height / s,
        };
      }
    } catch {
      /* ignore */
    }
  }, []);

  // 同步取窗口 API(挂载后已缓存)。
  const ensureApi = useCallback(async (): Promise<WinApi | null> => {
    if (apiRef.current) return apiRef.current;
    if (!inTauri()) return null;
    try {
      const { getCurrentWindow, LogicalPosition, LogicalSize } = await import(
        "@tauri-apps/api/window"
      );
      apiRef.current = { win: getCurrentWindow(), LogicalPosition, LogicalSize };
      return apiRef.current;
    } catch {
      return null;
    }
  }, []);

  // 按当前姿态落定窗口尺寸+位置。
  const apply = useCallback(async () => {
    const api = await ensureApi();
    if (!api) return;
    await refreshScreen();
    const scr = screenRef.current;
    const right = scr.left + scr.width;
    const bottom = scr.top + scr.height;
    const exp = expandedRef.current;
    const w = exp ? CARD_W : BALL;
    const h = exp ? CARD_H : BALL;
    const py = Number.isNaN(posRef.current.y) ? scr.top + 120 : posRef.current.y;

    let x: number;
    let y: number;
    if (!dockedRef.current && exp) {
      const px = Number.isNaN(posRef.current.x) ? right - CARD_W - MARGIN : posRef.current.x;
      x = clamp(px, scr.left + 4, right - CARD_W - 4);
      y = clamp(py, scr.top + TOP_INSET, bottom - CARD_H - MARGIN);
    } else if (exp) {
      x = edgeRef.current === "right" ? right - CARD_W - MARGIN : scr.left + MARGIN;
      y = clamp(py, scr.top + TOP_INSET, bottom - CARD_H - MARGIN);
    } else {
      x = edgeRef.current === "right" ? right - BALL_PEEK : scr.left - (BALL - BALL_PEEK);
      y = clamp(py, scr.top + MARGIN, bottom - BALL - MARGIN);
    }
    const rx = Math.round(x);
    const ry = Math.round(y);
    posRef.current = { x: rx, y: ry };
    lastTarget.current = { x: rx, y: ry };
    try {
      await api.win.setSize(new api.LogicalSize(w, h));
      await api.win.setPosition(new api.LogicalPosition(rx, ry));
    } catch {
      /* ignore */
    }
  }, [ensureApi, refreshScreen]);

  // 姿态变化 → 重新布局。
  useEffect(() => {
    void apply();
  }, [expanded, docked, edge, apply]);

  // 一次性:缓存 API、置顶、失焦收球。
  useEffect(() => {
    if (!inTauri()) return;
    let unFocus: (() => void) | undefined;
    (async () => {
      await refreshScreen();
      const api = await ensureApi();
      if (!api) return;
      try {
        await api.win.setAlwaysOnTop(true);
        await api.win.setVisibleOnAllWorkspaces(true);
        unFocus = await api.win.onFocusChanged(({ payload }: { payload: boolean }) => {
          if (!payload && dockedRef.current) setPinned(false);
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      unFocus?.();
      if (drag.current.raf) cancelAnimationFrame(drag.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 手动拖动 ----
  const onDragStart = useCallback((sx: number, sy: number) => {
    const d = drag.current;
    d.active = true;
    d.moved = false;
    d.sx = sx;
    d.sy = sy;
    d.wx = lastTarget.current.x;
    d.wy = lastTarget.current.y;
    d.w = expandedRef.current ? CARD_W : BALL;
  }, []);

  const onDragMove = useCallback((sx: number, sy: number) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = sx - d.sx;
    const dy = sy - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD) return; // 还没动够,当点击候选
    d.moved = true;
    d.pendingX = d.wx + dx;
    d.pendingY = d.wy + dy;
    if (d.raf) return; // 每帧只发一次 setPosition
    d.raf = requestAnimationFrame(() => {
      d.raf = 0;
      const api = apiRef.current;
      if (!api) return;
      const x = Math.round(d.pendingX);
      const y = Math.round(d.pendingY);
      lastTarget.current = { x, y };
      try {
        void api.win.setPosition(new api.LogicalPosition(x, y));
      } catch {
        /* ignore */
      }
    });
  }, []);

  const onDragEnd = useCallback(
    (sx: number, sy: number, isBall: boolean) => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      if (d.raf) {
        cancelAnimationFrame(d.raf);
        d.raf = 0;
      }
      if (!d.moved) {
        // 没拖动 = 点击:球 → 展开;悬停态的卡片头部点一下 → 钉住
        if (isBall || dockedRef.current) setPinned(true);
        return;
      }
      // 真正松手:用最终窗口位置判定吸附 / 自由
      const finalX = d.wx + (sx - d.sx);
      const finalY = d.wy + (sy - d.sy);
      const scr = screenRef.current;
      const right = scr.left + scr.width;
      const nearLeft = finalX <= scr.left + SNAP;
      const nearRight = finalX + d.w >= right - SNAP;
      posRef.current = { x: finalX, y: finalY };
      const willDock = nearLeft || nearRight;
      const nextEdge: Edge = nearRight ? "right" : nearLeft ? "left" : edgeRef.current;
      if (willDock) {
        edgeRef.current = nextEdge;
        setEdge(nextEdge);
        setPinned(false);
        setDocked(true);
        dockedRef.current = true;
      } else {
        setDocked(false);
        dockedRef.current = false;
      }
      void apply(); // 落定:吸附则缩球贴边,自由则钳到屏内
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ docked: willDock, edge: nextEdge, x: finalX, y: finalY }),
        );
      } catch {
        /* ignore */
      }
    },
    [apply],
  );

  // 最小化:吸附态直接收球;自由态就近吸边、保持当前高度。
  const minimize = useCallback(() => {
    if (dockedRef.current) {
      setPinned(false);
      return;
    }
    const scr = screenRef.current;
    const px = Number.isNaN(posRef.current.x) ? scr.left + scr.width - CARD_W : posRef.current.x;
    const nextEdge: Edge = px + CARD_W / 2 < scr.left + scr.width / 2 ? "left" : "right";
    edgeRef.current = nextEdge;
    setEdge(nextEdge);
    setPinned(false);
    setDocked(true);
    dockedRef.current = true;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ docked: true, edge: nextEdge, x: posRef.current.x, y: posRef.current.y }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const focusMain = useCallback(async () => {
    if (!inTauri()) return;
    try {
      const { Window } = await import("@tauri-apps/api/window");
      const main = await Window.getByLabel("main");
      await main?.show();
      await main?.setFocus();
    } catch {
      /* ignore */
    }
  }, []);

  return {
    expanded,
    docked,
    edge,
    onDragStart,
    onDragMove,
    onDragEnd,
    minimize,
    focusMain,
  };
}
