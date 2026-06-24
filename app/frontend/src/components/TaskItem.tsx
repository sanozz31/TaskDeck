import { useEffect, useRef, useState } from "react";
import type { Task, Priority } from "../types";
import { PRIORITY_LABEL, PRIORITY_VAR, prettyDate, dueTone } from "../lib/format";
import { isImminent } from "../lib/deadline";
import { useNow } from "../lib/useNow";
import { useUpdateTask, useDeleteTask, useTagDefs } from "../store/useTasks";
import { markCompleted, unmarkCompleted } from "../lib/sessionCompleted";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export function TaskItem({
  task,
  hideArchive = false,
}: {
  task: Task;
  hideArchive?: boolean;
}) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const done = task.status === "done";
  const tags = [...new Set(task.tags)];
  const now = useNow();
  const imminent = !done && isImminent(task, now);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [editTags, setEditTags] = useState<string[]>(tags);
  const [tagDraft, setTagDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [dueTime, setDueTime] = useState(task.due_time ?? "");
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const { data: tagDefs } = useTagDefs();

  // 标签库里尚未选中的，作为快捷候选
  const tagSuggestions = (tagDefs ?? [])
    .map((d) => d.name)
    .filter((n) => !editTags.includes(n));

  // 草稿无需在非编辑态同步：非编辑态展示的是 task.* 本身，startEdit 进入时再从 task.* 初始化。

  // 编辑态下让描述框贴合内容高度
  useEffect(() => {
    const el = notesRef.current;
    if (editing && el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing, notes]);

  const toggle = () => {
    const next = done ? "todo" : "done";
    update.mutate({ id: task.id, patch: { status: next } });
    // 记录/取消「本次会话刚完成」，使其当次仍留在主列表
    if (next === "done") markCompleted(task.id);
    else unmarkCompleted(task.id);
  };

  const resetDraft = () => {
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setEditTags([...new Set(task.tags)]);
    setTagDraft("");
    setAddingTag(false);
    setPriority(task.priority);
    setDueDate(task.due_date ?? "");
    setDueTime(task.due_time ?? "");
  };

  const startEdit = () => {
    resetDraft();
    setEditing(true);
  };

  const cancelEdit = () => {
    resetDraft();
    setEditing(false);
  };

  const addTag = (raw: string) => {
    const name = raw.trim().replace(/^#/, "");
    if (name && !editTags.includes(name)) setEditTags([...editTags, name]);
    setTagDraft("");
  };

  const removeTag = (name: string) => setEditTags(editTags.filter((t) => t !== name));

  // 打开「新建标签」输入框并聚焦
  const openTagInput = () => {
    setAddingTag(true);
    requestAnimationFrame(() => tagInputRef.current?.focus());
  };

  const saveEdit = () => {
    const nextTitle = title.trim();
    const nextNotes = notes.trim();
    // 标题不能为空：留空则放弃改动
    if (!nextTitle) {
      cancelEdit();
      return;
    }
    const patch: Partial<Task> = {};
    if (nextTitle !== task.title) patch.title = nextTitle;
    if (nextNotes !== (task.notes ?? "")) patch.notes = nextNotes || null;
    // 标签：与原值比对（忽略顺序），有变化才提交
    const orig = [...new Set(task.tags)];
    const changed =
      editTags.length !== orig.length || editTags.some((t) => !orig.includes(t));
    if (changed) patch.tags = editTags;
    // 优先级
    if (priority !== task.priority) patch.priority = priority;
    // 截止日期 / 时间（空串归一为 null）
    const nextDue = dueDate || null;
    const nextTime = dueTime || null;
    if (nextDue !== (task.due_date ?? null)) patch.due_date = nextDue;
    if (nextTime !== (task.due_time ?? null)) patch.due_time = nextTime;
    if (Object.keys(patch).length > 0) update.mutate({ id: task.id, patch });
    setEditing(false);
  };

  const onTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // 有内容则添加并留在输入态继续加；为空则收起输入框
      if (tagDraft.trim()) addTag(tagDraft);
      else setAddingTag(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTagDraft("");
      setAddingTag(false);
    } else if (e.key === "Backspace" && !tagDraft && editTags.length) {
      // 输入为空时退格删除最后一个标签
      removeTag(editTags[editTags.length - 1]);
    }
  };

  // 失焦：把残留内容收进标签后收起输入框
  const onTagBlur = () => {
    if (tagDraft.trim()) addTag(tagDraft);
    setAddingTag(false);
  };

  const onTitleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const onNotesKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 描述允许多行：Enter 保存，Shift+Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <div
      className={`task-card${done ? " task-card--done" : ""}${editing ? " task-card--editing" : ""}`}
    >
      <button
        className={`task-check${done ? " task-check--on" : ""}`}
        onClick={toggle}
        aria-label={done ? "标记未完成" : "标记完成"}
        disabled={editing}
      >
        {done ? "✓" : ""}
      </button>

      <div className="task-body">
        {editing ? (
          <div className="task-edit">
            <input
              className="task-edit-title"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onTitleKey}
              placeholder="任务标题"
            />
            <textarea
              ref={notesRef}
              className="task-edit-notes"
              value={notes}
              rows={1}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={onNotesKey}
              placeholder="添加描述…"
            />
            <div className="task-edit-tags">
              {editTags.map((t) => (
                <span key={t} className="task-edit-chip">
                  #{t}
                  <button
                    className="task-edit-chip-del"
                    onClick={() => removeTag(t)}
                    aria-label={`移除标签 ${t}`}
                    title="移除"
                  >
                    ×
                  </button>
                </span>
              ))}
              {/* 标签库里已有、尚未选中的，点一下快速加上 */}
              {tagSuggestions.map((t) => (
                <button
                  key={t}
                  className="task-edit-sug"
                  onClick={() => addTag(t)}
                  title={`添加 #${t}`}
                >
                  #{t}
                </button>
              ))}
              {/* 新建标签：虚线圈 + 号，点击展开输入 */}
              {addingTag ? (
                <input
                  ref={tagInputRef}
                  className="task-edit-tag-input"
                  value={tagDraft}
                  maxLength={12}
                  autoFocus
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={onTagKey}
                  onBlur={onTagBlur}
                  placeholder="新建标签"
                />
              ) : (
                <button
                  className="task-edit-tag-add"
                  onClick={openTagInput}
                  aria-label="新建标签"
                  title="新建标签"
                >
                  +
                </button>
              )}
            </div>
            <div className="task-edit-row">
              <span className="task-edit-label">优先级</span>
              <div className="task-edit-pris">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    className={`task-edit-pri${priority === p ? " task-edit-pri--on" : ""}`}
                    style={
                      priority === p
                        ? { borderColor: PRIORITY_VAR[p], color: PRIORITY_VAR[p] }
                        : undefined
                    }
                    onClick={() => setPriority(p)}
                  >
                    <span className="task-edit-pri-dot" style={{ background: PRIORITY_VAR[p] }} />
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="task-edit-row">
              <span className="task-edit-label">截止</span>
              <input
                type="date"
                className="task-edit-date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <input
                type="time"
                className="task-edit-time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
              />
              {(dueDate || dueTime) && (
                <button
                  className="task-edit-clear"
                  onClick={() => {
                    setDueDate("");
                    setDueTime("");
                  }}
                  title="清除截止时间"
                >
                  清除
                </button>
              )}
            </div>
            <div className="task-edit-actions">
              <button className="task-edit-btn task-edit-btn--cancel" onClick={cancelEdit}>
                取消
              </button>
              <button className="task-edit-btn task-edit-btn--save" onClick={saveEdit}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="task-title-row">
              <span className="task-title-main">
                <span
                  className={`task-title${imminent ? " task-title--imminent" : ""}`}
                  onDoubleClick={startEdit}
                  title="双击编辑"
                >
                  {task.title}
                </span>
                <button
                  className="task-edit-trigger"
                  onClick={startEdit}
                  aria-label="编辑"
                  title="编辑"
                >
                  ✎
                </button>
              </span>
              <span
                className="task-pri"
                style={{ color: PRIORITY_VAR[task.priority] }}
                title={`优先级：${PRIORITY_LABEL[task.priority]}`}
              >
                ● {PRIORITY_LABEL[task.priority]}
              </span>
            </div>

            {task.notes && (
              <div className="task-notes" onDoubleClick={startEdit} title="双击编辑">
                {task.notes}
              </div>
            )}

            <div className="task-meta">
              {tags.map((t) => (
                <span key={t} className="task-tag">
                  #{t}
                </span>
              ))}
              {task.due_date && (
                <span className={`task-due task-due--${dueTone(task.due_date)}`}>
                  截止 {prettyDate(task.due_date)}
                  {task.due_time && ` ${task.due_time}`}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {!hideArchive && !editing && (
        <button
          className="task-del"
          onClick={() => del.mutate(task.id)}
          aria-label="归档"
          title="归档"
        >
          ×
        </button>
      )}
    </div>
  );
}
