import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  CompleteConstructionTrackingTaskRequestModel,
  ConstructionTrackingTaskActivityResponse,
  ConstructionTrackingTaskDetailResponse,
  ConstructionTrackingTaskProgressResponse,
  ConstructionTrackingTaskResponse,
  CreateConstructionTrackingTaskRequestModel,
  GetConstructionTrackingTaskFormOptionsResponse,
  GetConstructionTrackingTaskGanttResponse,
  ListConstructionTrackingTasksResponse,
  RecordConstructionTrackingTaskProgressRequestModel,
  UpdateConstructionTrackingTaskProgressRequestModel,
  UpdateConstructionTrackingTaskRequestModel,
} from "@/app/api/construction/tracking/tasks/task-models";
import type { TaskStatus } from "@/src/tracking/domain/task-progress";
import type { TrackingPriority } from "@/src/tracking/domain/tracking-documents";

import { apiJson } from "./http";
import { TRACKING_API, TRACKING_KEY } from "./tracking-access";

export type Task = ConstructionTrackingTaskResponse;
export type TaskDetail = ConstructionTrackingTaskDetailResponse;
export type TaskPage = ListConstructionTrackingTasksResponse;
export type TaskGantt = GetConstructionTrackingTaskGanttResponse;
export type TaskProgress = ConstructionTrackingTaskProgressResponse;
export type TaskActivity = ConstructionTrackingTaskActivityResponse;
export type TaskFormOptions = GetConstructionTrackingTaskFormOptionsResponse;
export type CreateTaskInput = z.input<
  typeof CreateConstructionTrackingTaskRequestModel
>;
export type UpdateTaskInput = z.input<
  typeof UpdateConstructionTrackingTaskRequestModel
>;
export type RecordProgressInput = z.input<
  typeof RecordConstructionTrackingTaskProgressRequestModel
>;
export type UpdateProgressInput = z.input<
  typeof UpdateConstructionTrackingTaskProgressRequestModel
>;
export type CompleteTaskInput = z.input<
  typeof CompleteConstructionTrackingTaskRequestModel
>;
export type ImportRowError = { row: number; field: string; message: string };

export const TASKS_API = `${TRACKING_API}/tasks`;
/** Every task read; writes invalidate it (CM-802). */
export const TASKS_KEY = [...TRACKING_KEY, "tasks"] as const;

export type TaskFilters = {
  status?: TaskStatus | null;
  assigneeId?: string | null;
  priority?: TrackingPriority | null;
  tagId?: string | null;
  departmentId?: string | null;
  contractorId?: string | null;
  locationId?: string | null;
  from?: string;
  to?: string;
  search?: string;
};

export type TaskCursor = { after?: string; before?: string } | null;

function filterParams(projectId: string, filters: TaskFilters) {
  const params = new URLSearchParams({ projectId });
  for (const key of [
    "status",
    "assigneeId",
    "priority",
    "tagId",
    "departmentId",
    "contractorId",
    "locationId",
  ] as const) {
    const value = filters[key];
    if (value != null && value !== "") params.set(key, value);
  }
  if (filters.from != null && filters.from !== "")
    params.set("from", filters.from);
  if (filters.to != null && filters.to !== "") params.set("to", filters.to);
  const search = filters.search?.trim() ?? "";
  if (search !== "") params.set("search", search);
  return params;
}

/** Whether any filter is set (the empty state says "No tasks match"). */
export function tasksFiltered(filters: TaskFilters): boolean {
  return filterParams("x", filters).size > 1;
}

/** A page of the Project's task tree: top-level tasks with their sub-tasks. */
export function tasksQuery(
  projectId: string,
  filters: TaskFilters = {},
  cursor: TaskCursor = null,
) {
  const params = filterParams(projectId, filters);
  params.set("limit", "50");
  if (cursor?.after != null) params.set("after", cursor.after);
  if (cursor?.before != null) params.set("before", cursor.before);
  return queryOptions({
    queryKey: [...TASKS_KEY, "list", params.toString()],
    queryFn: () => apiJson<TaskPage>(`${TASKS_API}?${params}`),
  });
}

/** Every row of the tree for the Gantt, with today. */
export function taskGanttQuery(projectId: string, filters: TaskFilters = {}) {
  const params = filterParams(projectId, filters);
  return queryOptions({
    queryKey: [...TASKS_KEY, "gantt", params.toString()],
    queryFn: () => apiJson<TaskGantt>(`${TASKS_API}/gantt?${params}`),
  });
}

export function taskQuery(id: string) {
  return queryOptions({
    queryKey: [...TASKS_KEY, "detail", id],
    queryFn: () =>
      apiJson<TaskDetail>(`${TASKS_API}/${encodeURIComponent(id)}`),
  });
}

export function taskProgressQuery(id: string) {
  return queryOptions({
    queryKey: [...TASKS_KEY, "progress", id],
    queryFn: () =>
      apiJson<{ items: TaskProgress[] }>(
        `${TASKS_API}/${encodeURIComponent(id)}/progress`,
      ),
  });
}

export function taskActivityQuery(id: string) {
  return queryOptions({
    queryKey: [...TASKS_KEY, "activity", id],
    queryFn: () =>
      apiJson<{ items: TaskActivity[] }>(
        `${TASKS_API}/${encodeURIComponent(id)}/activity`,
      ),
  });
}

/** Team Members, Departments, Contractors, Units and Tags of the Project. */
export function taskFormOptionsQuery(projectId: string) {
  const params = new URLSearchParams({ projectId });
  return queryOptions({
    queryKey: [...TASKS_KEY, "form-options", projectId],
    queryFn: () =>
      apiJson<TaskFormOptions>(`${TASKS_API}/form-options?${params}`),
    staleTime: 60_000,
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${TASKS_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: TASKS_KEY });
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => post<{ id: string }>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateTaskInput) =>
      post<TaskDetail>(`/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useCopyTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      post<{ id: string }>(`/${encodeURIComponent(id)}/copy`, {}),
    onSuccess: invalidate,
  });
}

export function useDeleteTasks(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      post<{ deleted: number }>("/bulk-delete", { projectId, ids }),
    // The deleted tasks' own reads would 404; the page leaves them.
    onSuccess: (_result, ids) =>
      client.invalidateQueries({
        queryKey: TASKS_KEY,
        predicate: (query) => !ids.includes(String(query.queryKey[3])),
      }),
  });
}

export function useRebaselineTask(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { reason: string; expectedUpdatedAt?: string }) =>
      post<TaskDetail>(`/${encodeURIComponent(id)}/rebaseline`, input),
    onSuccess: invalidate,
  });
}

export function useRecordProgress(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RecordProgressInput) =>
      post<{ id: string }>(`/${encodeURIComponent(id)}/progress`, input),
    onSuccess: invalidate,
  });
}

export function useCompleteTask(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CompleteTaskInput) =>
      post<{ id: string }>(`/${encodeURIComponent(id)}/complete`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateProgress() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      progressId,
      ...input
    }: UpdateProgressInput & { progressId: string }) =>
      post<undefined>(
        `/progress/${encodeURIComponent(progressId)}/update`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteProgress() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (progressId: string) =>
      post<undefined>(`/progress/${encodeURIComponent(progressId)}/delete`, {}),
    onSuccess: invalidate,
  });
}

/** The import sample's download link. */
export function taskSampleUrl(projectId: string): string {
  return `${TASKS_API}/import-sample?projectId=${encodeURIComponent(projectId)}`;
}

/** Uploads the filled sample; every row or none. */
export function useImportTasks(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (file: File) =>
      apiJson<{ imported: number }>(
        `${TASKS_API}/import?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: file,
        },
      ),
    onSuccess: invalidate,
  });
}

/** Pages of a Project's tasks. */
export function tasksPath(projectId: string, id?: string): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/tasks`;
  return id == null ? base : `${base}/${encodeURIComponent(id)}`;
}
