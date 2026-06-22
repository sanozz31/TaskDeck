import { useState, useEffect, useMemo } from "react";
import {
  useTags,
  useTagDefs,
  useAddTagDef,
  useDeleteTagDef,
  useTasksByTag,
} from "../store/useTasks";
import { TaskList } from "./TaskList";
import { ConfirmModal } from "./ConfirmModal";

export function TagView() {
  const { data: defs } = useTagDefs();
  const { data: counts } = useTags();
  const addTag = useAddTagDef();
  const delTag = useDeleteTagDef();

  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const countOf = (name: string) =>
    counts?.find((c) => c.tag === name)?.count ?? 0;

  // 展示顺序：先按任务数量降序，数量相同再按首字母（拼音）升序。
  const ordered = useMemo(() => {
    return (defs ?? [])
      .map((d) => d.name)
      .sort((a, b) => {
        const diff = countOf(b) - countOf(a);
        if (diff !== 0) return diff;
        return a.localeCompare(b, "zh-Hans-CN");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, counts]);

  // 默认选中排序后的第一个
  useEffect(() => {
    if (!active && ordered.length > 0) setActive(ordered[0]);
  }, [ordered, active]);

  const { data: tasks } = useTasksByTag(active);

  const submitAdd = () => {
    const name = draft.trim();
    if (!name) return;
    addTag.mutate(name, { onSuccess: () => setActive(name) });
    setDraft("");
  };

  const remove = (name: string) => {
    delTag.mutate(name);
    if (active === name) setActive(null);
  };

  return (
    <div className="tag-view">
      <div className="tag-bar">
        <div className="tag-chips">
        {ordered.map((name) => (
          <span
            key={name}
            className={`chip-tag${active === name ? " chip-tag--on" : ""}`}
            onClick={() => setActive(name)}
          >
            #{name}
            <span className="chip-count">{countOf(name)}</span>
            <button
              className="chip-del"
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(name);
              }}
              aria-label={`删除标签 ${name}`}
              title="删除标签"
            >
              ×
            </button>
          </span>
        ))}

        <span className="tag-add">
          <input
            className="tag-add-input"
            placeholder="新标签"
            value={draft}
            maxLength={12}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAdd();
            }}
          />
          <button className="tag-add-btn" onClick={submitAdd} disabled={!draft.trim()}>
            添加
          </button>
        </span>
        </div>
      </div>

      <div className="tag-tasks">
        <TaskList
          tasks={active ? tasks : []}
          empty={active ? "该标签下暂无任务" : "选个标签看看，或在对话里记一条任务"}
        />
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="删除标签"
          message={`确定删除标签「${pendingDelete}」？已打此标签的任务不受影响，仅从标签库移除。`}
          confirmText="删除"
          danger
          onConfirm={() => remove(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
