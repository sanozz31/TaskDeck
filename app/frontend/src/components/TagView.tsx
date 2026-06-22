import { useState, useEffect } from "react";
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

  // 默认选中标签库里的第一个
  useEffect(() => {
    if (!active && defs && defs.length > 0) setActive(defs[0].name);
  }, [defs, active]);

  const { data: tasks } = useTasksByTag(active);
  const countOf = (name: string) =>
    counts?.find((c) => c.tag === name)?.count ?? 0;

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
        {(defs ?? []).map((d) => (
          <span
            key={d.name}
            className={`chip-tag${active === d.name ? " chip-tag--on" : ""}`}
            onClick={() => setActive(d.name)}
          >
            #{d.name}
            <span className="chip-count">{countOf(d.name)}</span>
            <button
              className="chip-del"
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(d.name);
              }}
              aria-label={`删除标签 ${d.name}`}
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
