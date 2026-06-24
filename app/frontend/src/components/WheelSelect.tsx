import { useState } from "react";
import { WheelPicker } from "./WheelPicker";

/**
 * 数字 + 弹出滚轮：平时只显示当前数字（样式同旧版 .cal-sel），点击在下方弹出滚轮选择。
 * 关键交互：滚动时只在内部记「待定值」，**日历不变**；直到收起滚轮（点某一行 / 点空白遮罩）
 * 那一刻才把待定值提交给日历。遮罩还会拦住收起时的这一次点击，不会顺带操作到其他区域。
 */
export function WheelSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: number;
  options: number[];
  onChange: (v: number) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value);

  const openWheel = () => {
    setPending(value); // 每次打开都以当前值为起点
    setOpen(true);
  };

  // 收起并提交：把某个值（默认待定值）落给日历
  const commit = (v: number) => {
    setOpen(false);
    if (v !== value) onChange(v);
  };

  return (
    <span className="wheelsel">
      {/* 触发数字：复用旧的 .cal-sel 外观，样式与之前一致；仅把下拉列表换成滚轮 */}
      <button
        className="cal-sel"
        onClick={() => (open ? commit(pending) : openWheel())}
        aria-label={ariaLabel}
      >
        {value}
      </button>
      {open && (
        <>
          {/* 透明遮罩：拦住外部这一次点击，仅收起滚轮并提交待定值，不触发其他区域 */}
          <div
            className="wheelsel-backdrop"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              commit(pending);
            }}
          />
          <div className="wheelsel-pop">
            <WheelPicker
              value={pending}
              options={options}
              onChange={setPending} // 滚动只更新待定值，不动日历
              onPick={(v) => commit(v)} // 点某一行：收起并提交该行
              ariaLabel={ariaLabel}
            />
          </div>
        </>
      )}
    </span>
  );
}
