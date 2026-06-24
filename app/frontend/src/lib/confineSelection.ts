/**
 * 把文本选区收束在单张卡片 / 气泡内：选区一旦跨出起始单元（.task-card / .bubble），
 * 就把焦点拉回该单元边界——实现「只能复制单卡文字、不能跨卡片」。
 * 配合全局 user-select 白名单（只放开纯文字叶子），复制即只得到文字本身、不含空行布局。
 * 返回解绑函数。
 */
export function attachSelectionConfine(): () => void {
  let guard = false; // 防止 extend 触发的 selectionchange 自循环

  const unitOf = (n: Node | null): Element | null => {
    const el = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
    return el ? el.closest(".task-card, .bubble") : null;
  };

  const onSel = () => {
    if (guard) return;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const aUnit = unitOf(sel.anchorNode);
    if (!aUnit) return; // 起点不在卡片/气泡内（如确认弹窗、设置文本）→ 不干预
    if (unitOf(sel.focusNode) === aUnit) return; // 仍在同一单元，正常

    // 跨单元：把焦点收回起始单元的边界
    guard = true;
    try {
      const r = document.createRange();
      r.selectNodeContents(aUnit);
      const focusBeforeAnchor =
        !!sel.anchorNode &&
        !!sel.focusNode &&
        (sel.anchorNode.compareDocumentPosition(sel.focusNode) &
          Node.DOCUMENT_POSITION_PRECEDING) !==
          0;
      if (focusBeforeAnchor) sel.extend(r.startContainer, r.startOffset);
      else sel.extend(r.endContainer, r.endOffset);
    } catch {
      sel.removeAllRanges();
    } finally {
      guard = false;
    }
  };

  document.addEventListener("selectionchange", onSel);
  return () => document.removeEventListener("selectionchange", onSel);
}
