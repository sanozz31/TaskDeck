import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Task } from "../types";

/** 失效所有任务相关查询，让各视图刷新。 */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  };
}

export function useAllTasks() {
  return useQuery({ queryKey: ["tasks", "all"], queryFn: () => api.listTasks() });
}

export function useCompletedTasks() {
  return useQuery({ queryKey: ["tasks", "completed"], queryFn: () => api.completed() });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => api.tags() });
}

export function useTagDefs() {
  return useQuery({ queryKey: ["tagDefs"], queryFn: () => api.tagDefs() });
}

export function useAddTagDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.addTagDef(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tagDefs"] }),
  });
}

export function useDeleteTagDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deleteTagDef(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tagDefs"] }),
  });
}

export function useReorderTagDefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => api.reorderTagDefs(names),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tagDefs"] }),
  });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.settings() });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, string>) => api.updateSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useTasksByTag(tag: string | null) {
  return useQuery({
    queryKey: ["tasks", "tag", tag],
    queryFn: () => api.byTag(tag!),
    enabled: !!tag,
  });
}

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () => api.calendar(from, to),
  });
}

/** 创建任务（调用 AI 分析）。 */
export function useCreateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: string) => api.createTask(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) =>
      api.updateTask(id, patch),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => invalidate(),
  });
}
