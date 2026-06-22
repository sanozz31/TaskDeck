/** 通用空态：一句提示 + 一个主操作按钮（如「去记录任务」跳转对话页）。 */
export function EmptyCTA({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-cta">
      <div className="empty-cta-title">{title}</div>
      <button className="empty-cta-btn" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
