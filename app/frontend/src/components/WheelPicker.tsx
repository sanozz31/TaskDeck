import { useEffect, useRef } from "react";

// 行高与可见行数：中间 1 行（选中）+ 上下各 3 行，共 7 行；窗口高度固定 = ROW × VISIBLE。
const ROW = 30;
const VISIBLE = 7;
const PAD = (VISIBLE - 1) / 2; // 上下各留 3 行 padding，使首/末项也能滚到正中

/**
 * 滚轮选择器（CSS scroll-snap，无第三方库）。
 * - 固定高度 = 7 行，上下对称各留 3 行；除居中选中项外上 3 下 3，其余靠滚动。
 * - 中心带高亮即当前选中；滚动停止后回调最接近中心的项；点击某项直接选中。
 */
export function WheelPicker({
  value,
  options,
  onChange,
  onPick,
  unit = "",
  ariaLabel,
}: {
  value: number;
  options: number[];
  onChange: (v: number) => void;
  /** 显式点击某一项时额外回调（用于弹层"点选即收起"；滚动停留不触发） */
  onPick?: (v: number) => void;
  unit?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);

  const idx = Math.max(0, options.indexOf(value));

  // value（或其在选项中的位置）变化时，把选中项滚到正中。DOM 写入，非 setState。
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = idx * ROW;
  }, [idx]);

  // 卸载时清掉停留判定计时器
  useEffect(() => () => clearTimeout(settle.current), []);

  // 滚动停止（120ms 无新事件）后，取最接近中心的项回调
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const ni = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (options[ni] !== value) onChange(options[ni]);
    }, 120);
  };

  return (
    <div className="wheel" style={{ height: ROW * VISIBLE }} aria-label={ariaLabel}>
      <div className="wheel-scroll" ref={ref} onScroll={onScroll}>
        <div className="wheel-pad" style={{ height: ROW * PAD }} />
        {options.map((o) => (
          <div
            key={o}
            className={`wheel-item${o === value ? " wheel-item--on" : ""}`}
            style={{ height: ROW }}
            onClick={() => {
              onChange(o);
              onPick?.(o);
            }}
          >
            {o}
            {unit}
          </div>
        ))}
        <div className="wheel-pad" style={{ height: ROW * PAD }} />
      </div>
      {/* 中心选中带（两条发丝线标出选中区，不挡滚动） */}
      <div className="wheel-center" style={{ top: ROW * PAD, height: ROW }} aria-hidden />
    </div>
  );
}
