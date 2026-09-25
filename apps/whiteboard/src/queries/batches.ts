import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";

export type TimingSlot = {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

export type BatchResponse = {
  id: string;
  courseId: string;
  name: string;
  classMode: "offline" | "online" | "hybrid";
  capacity: number;
  room: string | null;
  joinUrl: string | null;
  timings: TimingSlot[];
  timezone: string;
  closedAt: string | null;
  enrolledCount: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type BatchListResponse = {
  items: BatchResponse[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export type BatchWriteInput = {
  courseId?: string;
  name: string;
  classMode: "offline" | "online" | "hybrid";
  capacity: number;
  room?: string | null;
  joinUrl?: string | null;
  timings: TimingSlot[];
};

export type BatchListFilters = {
  workspaceId?: string | null;
  courseId?: string;
  limit?: number;
  after?: string;
  before?: string;
};

const jsonHeaders = { "content-type": "application/json" };

export const batchQueries = {
  key: {
    all: ["batches"] as const,
    list: (filters?: BatchListFilters) =>
      [...batchQueries.key.all, "list", filters] as const,
    detail: (id: string) => [...batchQueries.key.all, "detail", id] as const,
  },
  list: (filters?: BatchListFilters) =>
    queryOptions({
      queryKey: batchQueries.key.list(filters),
      queryFn: () => {
        const params = new URLSearchParams({
          limit: String(filters?.limit ?? 100),
        });
        if (filters?.courseId) params.set("courseId", filters.courseId);
        if (filters?.after) params.set("after", filters.after);
        if (filters?.before) params.set("before", filters.before);
        return apiJson<BatchListResponse>(`/api/batches?${params.toString()}`);
      },
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: batchQueries.key.detail(id),
      queryFn: () => apiJson<BatchResponse>(`/api/batches/${id}`),
    }),
};

export function createBatch(input: BatchWriteInput): Promise<BatchResponse> {
  return apiJson<BatchResponse>("/api/batches", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function updateBatchSchedule(
  id: string,
  input: BatchWriteInput,
): Promise<BatchResponse> {
  const { courseId: _courseId, ...body } = input;
  return apiJson<BatchResponse>(`/api/batches/${id}/schedule`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

export function closeBatch(id: string): Promise<BatchResponse> {
  return apiJson<BatchResponse>(`/api/batches/${id}/close`, {
    method: "POST",
  });
}
