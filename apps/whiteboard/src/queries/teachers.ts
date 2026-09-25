import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";
import type { BatchListResponse, TimingSlot } from "./batches";

export type TeacherProfile = {
  id: string; name: string; email: string; kind: "centre_teacher" | "visiting_tutor";
  phone: string | null; qualificationSummary: string | null;
  invitationStatus: "not_sent" | "sent" | "failed" | "accepted";
  clerkUserId: string | null; deactivatedAt: string | null;
  createdAt: string; updatedAt: string;
};
export type TeacherWriteInput = Pick<TeacherProfile, "name" | "kind"> & {
  email?: string; phone?: string | null; qualificationSummary?: string | null;
};
export type AssignedBatch = {
  id: string; name: string; courseId: string; classMode: string;
  timings: TimingSlot[]; timezone: string; room: string | null; assignedAt: string;
};
export type TeacherList = { items: TeacherProfile[]; total: number; nextCursor: string | null; prevCursor: string | null };
export type BatchList = { items: AssignedBatch[] };

export const teacherQueries = {
  key: { all: ["teachers"] as const },
  list: (workspaceId: string | null | undefined, page?: { limit?: number; after?: string; before?: string }) => queryOptions({
    queryKey: [...teacherQueries.key.all, workspaceId, "list", page],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(page?.limit ?? 20) });
      if (page?.after) params.set("after", page.after);
      if (page?.before) params.set("before", page.before);
      return apiJson<TeacherList>(`/api/teachers?${params.toString()}`);
    },
  }),
  detail: (workspaceId: string | null | undefined, id: string) => queryOptions({ queryKey: [...teacherQueries.key.all, workspaceId, "detail", id], queryFn: () => apiJson<TeacherProfile>(`/api/teachers/${id}`) }),
  batches: (workspaceId: string | null | undefined, id: string) => queryOptions({ queryKey: [...teacherQueries.key.all, workspaceId, "batches", id], queryFn: () => apiJson<BatchList>(`/api/teachers/${id}/batches`) }),
  batchOptions: (workspaceId: string | null | undefined, page?: { limit?: number; after?: string; before?: string }) => queryOptions({
    queryKey: [...teacherQueries.key.all, workspaceId, "batch-options", page],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(page?.limit ?? 100) });
      if (page?.after) params.set("after", page.after);
      if (page?.before) params.set("before", page.before);
      return apiJson<BatchListResponse>(`/api/batches?${params.toString()}`);
    },
  }),
};

export const myBatchQueries = {
  activation: (workspaceId: string | null | undefined, userId: string | null | undefined) => queryOptions({
    queryKey: ["teacher", workspaceId, userId, "activation"],
    queryFn: activateTeacher,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  }),
  list: (workspaceId: string | null | undefined, userId: string | null | undefined) => queryOptions({
    queryKey: ["teacher", workspaceId, userId, "batches"],
    queryFn: () => apiJson<BatchList>("/api/teacher/batches"),
    staleTime: 0,
    gcTime: 0,
  }),
};

const headers = { "content-type": "application/json" };
export const createTeacher = (input: TeacherWriteInput) => apiJson<TeacherProfile>("/api/teachers", { method: "POST", headers, body: JSON.stringify(input) });
export const updateTeacher = (id: string, input: TeacherWriteInput) => apiJson<TeacherProfile>(`/api/teachers/${id}/profile`, { method: "POST", headers, body: JSON.stringify(input) });
export const inviteTeacher = (id: string) => apiJson<TeacherProfile>(`/api/teachers/${id}/invite`, { method: "POST" });
export const deactivateTeacher = (id: string) => apiJson<TeacherProfile>(`/api/teachers/${id}/deactivate`, { method: "POST" });
export const assignTeacherBatch = (id: string, batchId: string) => apiJson<BatchList>(`/api/teachers/${id}/batches`, { method: "POST", headers, body: JSON.stringify({ batchId }) });
export const unassignTeacherBatch = (id: string, batchId: string) => apiJson<BatchList>(`/api/teachers/${id}/batches/${batchId}/unassign`, { method: "POST" });
export const activateTeacher = () => apiJson<{ teacherId: string }>("/api/teacher/activate", { method: "POST" });
