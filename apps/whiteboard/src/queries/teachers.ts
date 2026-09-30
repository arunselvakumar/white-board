import { queryOptions } from "@tanstack/react-query";

import { apiJson } from "./http";
import type { BatchListResponse, TimingSlot } from "./batches";

export type TeacherAvailabilitySlot = { daysOfWeek: number[]; startTime: string; endTime: string };
export type TeacherDetails = {
  salutation: "mr" | "mrs" | "ms" | "miss" | "mx" | "dr" | "prof" | null;
  preferredName: string | null;
  gender: "female" | "male" | "non_binary" | "prefer_not_to_say" | null;
  dateOfBirth: string | null;
  address: string | null;
  alternatePhone: string | null;
  cityArea: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  teachingSpecialisms: string[];
  learnerLevels: string[];
  yearsExperience: number | null;
  highestQualification: string | null;
  certifications: string[];
  languages: string[];
  bio: string | null;
  portfolioUrl: string | null;
  startDate: string | null;
  availability: TeacherAvailabilitySlot[];
  idProofType: string | null;
  backgroundCheckStatus: "not_checked" | "pending" | "completed" | "needs_review";
  backgroundCheckDate: string | null;
  backgroundCheckNote: string | null;
  payBasis: "monthly" | "hourly" | "per_batch" | null;
  payRatePaise: number | null;
  bankAccountHolder: string | null;
  bankName: string | null;
  bankIfsc: string | null;
};

export type TeacherProfile = {
  id: string; name: string; email: string; kind: "centre_teacher" | "visiting_tutor";
  phone: string | null; qualificationSummary: string | null;
  details: TeacherDetails;
  photoUrl: string | null;
  privateDetails: { idNumberLast4: string | null; bankAccountLast4: string | null };
  invitationStatus: "not_sent" | "sent" | "failed" | "accepted";
  clerkUserId: string | null; deactivatedAt: string | null;
  createdAt: string; updatedAt: string;
};
export type TeacherWriteInput = Pick<TeacherProfile, "name" | "kind"> & {
  email?: string; phone?: string | null; qualificationSummary?: string | null;
  details?: Partial<TeacherDetails>;
  privateDetails?: { idNumber?: string | null; bankAccountNumber?: string | null };
  photo?: { mimeType: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string };
};
export type TeacherDocument = {
  id: string; teacherId: string; kind: "certificate" | "identity" | "background_check" | "other";
  name: string; mimeType: string; sizeBytes: number; uploadedAt: string;
};
export type TeacherDocumentInput = Pick<TeacherDocument, "kind" | "name"> & { mimeType: "application/pdf" | "image/jpeg" | "image/png"; dataBase64: string };
export type AssignedBatch = {
  id: string; name: string; courseId: string; classMode: string;
  timings: TimingSlot[]; timezone: string; room: string | null; assignedAt: string;
};
export type TeacherListItem = Pick<TeacherProfile, "id" | "name" | "email" | "kind" | "photoUrl" | "invitationStatus" | "deactivatedAt"> & { preferredName: string | null };
export type TeacherList = { items: TeacherListItem[]; total: number; nextCursor: string | null; prevCursor: string | null };
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
  documents: (workspaceId: string | null | undefined, id: string) => queryOptions({ queryKey: [...teacherQueries.key.all, workspaceId, "documents", id], queryFn: () => apiJson<{ items: TeacherDocument[] }>(`/api/teachers/${id}/documents`) }),
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
export const addTeacherDocument = (id: string, input: TeacherDocumentInput) => apiJson<TeacherDocument>(`/api/teachers/${id}/documents`, { method: "POST", headers, body: JSON.stringify(input) });
export const removeTeacherDocument = (id: string, documentId: string) => apiJson<{ id: string }>(`/api/teachers/${id}/documents/${documentId}/remove`, { method: "POST" });
export const activateTeacher = () => apiJson<{ teacherId: string }>("/api/teacher/activate", { method: "POST" });
